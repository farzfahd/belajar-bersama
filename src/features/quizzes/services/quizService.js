import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { ATTEMPT_SCHEMA_VERSION, COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import {
  normalizeQuestionIds,
  normalizeQuizSettings,
  normalizeQuizText
} from '../utils/quizSettings';
import {
  ATTEMPT_STATUS,
  assertNotAuthorOfQuizQuestions,
  buildAnswersV3,
  buildQuestionSnapshotV3,
  buildQuizKeyManifest,
  computeScore,
  indexSnapshot,
  isV3Attempt,
  resolveAttemptStatus,
  withManualScoreV3
} from '../utils/attemptEngine';

function attemptRef(spaceId, quizId, attemptId) {
  return doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId, COL.attempts, attemptId);
}

function attemptsCol(spaceId, quizId) {
  return collection(db, ROOT.spaces, spaceId, COL.quizzes, quizId, COL.attempts);
}

// Peta id → dokumen soal. HANYA dipakai saat attempt DIMULAI, untuk menyalin
// isi soal ke `questionSnapshot`. Setelah attempt ada, tidak ada lagi kode di
// aplikasi yang memakai peta ini untuk render/grading/review attempt tersebut.
function questionByIdMap(questions) {
  const map = {};
  for (const q of Array.isArray(questions) ? questions : []) {
    if (q?.id) map[q.id] = q;
  }
  return map;
}

// Peta id → entri snapshot. Inilah sumber kebenaran SETELAH attempt dibuat:
// render, penilaian, dan review attempt lama semuanya membaca peta ini, bukan
// Question Bank. Karena itu attempt tetap utuh walau soal aslinya diubah atau
// dihapus.
function snapshotMap(attempt) {
  return indexSnapshot(attempt?.questionSnapshot);
}

/**
 * Mempertahankan `manualScore`/`manualFeedback`/`gradedBy`/`gradedAt` dari
 * attempt sebelumnya ketika jawaban dinilai ulang. Tanpa ini `buildAnswers`
 * membuat entri baru dan menghapus nilai manual yang sudah tersimpan.
 *
 * Dipakai juga saat owner melakukan recompute, supaya nilai manual partner
 * tidak pernah tertimpa (lihat `finalizeAttempt`).
 */
export function preserveManualScores(freshAnswers, existingAnswers) {
  const previous = new Map(
    (Array.isArray(existingAnswers) ? existingAnswers : []).map((a) => [a.questionId, a])
  );
  return (Array.isArray(freshAnswers) ? freshAnswers : []).map((a) => {
    const prev = previous.get(a.questionId);
    if (!prev || !a.needsManualGrade) return a;
    if (prev.manualScore === null || prev.manualScore === undefined) return a;
    return {
      ...a,
      manualScore: prev.manualScore,
      manualFeedback: prev.manualFeedback ?? '',
      gradedBy: prev.gradedBy ?? null,
      gradedAt: prev.gradedAt ?? null
    };
  });
}


function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function quizRef(spaceId, quizId) {
  return doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId);
}

// Satu-satunya tempat yang membentuk payload kuis, dipakai create & update
// supaya validasi client tidak pernah menyimpang dari rules.
function quizFields(input) {
  const { title, description, topicId } = normalizeQuizText(input);
  return {
    title,
    description,
    topicId,
    questionIds: normalizeQuestionIds(input.questionIds),
    settings: normalizeQuizSettings(input.settings)
  };
}

export async function createQuiz(spaceId, input) {
  const uid = requireUser();
  const fields = quizFields(input);
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.quizzes));
  await setDoc(ref, {
    ...fields,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
  return ref.id;
}

// Update parsial; rules melihat hasil full doc yang tersimpan di server.
// `createdBy` & `createdAt` sengaja tidak pernah dikirim (immutable di rules).
export async function updateQuiz(spaceId, quizId, input) {
  requireUser();
  const fields = quizFields(input);
  await updateDoc(quizRef(spaceId, quizId), {
    ...fields,
    updatedAt: serverTimestamp()
  });
}

// Mengganti snapshot soal (tambah/hapus/reorder) tanpa menyentuh dokumen soal.
//
// `questionKeyRevisions` ikut ditulis di sini: kuis mengunci nomor revisi kunci
// setiap soal yang masuk ke dalamnya, jadi attempt yang dimulai DI KEMUDIAN tetap
// dinilai terhadap kunci versi yang sama walau kuncinya sudah direvisi.
// Nilainya diambil dari dokumen soal publik (nomor revisi bersifat publik;
// hanya ISI kuncinya yang privat), jadi tidak perlu membaca dokumen kunci.
//
// Dua sumber revision, dan itu bukan pengulangan:
//   - `questions` yang sudah dipegang pemanggil (umumnya editor kuis, yang
//     memang sudah memuat seluruh soal). Gratis.
//   - dokumen soal yang BELUM ada di daftar itu. Ada satu kasus nyata: soal
//     baru saja dibuat lewat "+ Soal Baru", lalu autosave pertamanya sudah
//     selesai tetapi `useQuestions` belum menerima update snapshot-nya. Tanpa
//     pembacaan tambahan, revisi soal itu akan hilang dari manifest — dan kuis
//     akan diam-diam memakai kunci terbaru. Hanya id yang bermasalah yang
//     dibaca, jadi biayanya sebanding dengan yang berubah.
//
// Revisi yang sudah tercatat pada kuis TIDAK pernah dihapus selama soalnya masih
// ada di kuis. Kalau dokumen soal tiba-tiba tidak terbaca (mis. berubah jadi
// private), lebih baik kuis memakai revisi yang sudah dikunci daripada kehilangan
// pin dan ikut bergeser ke kunci terbaru.
export async function updateQuizQuestionIds(spaceId, quizId, questionIds, questions) {
  requireUser();
  const ids = normalizeQuestionIds(questionIds);
  const patch = { questionIds: ids, updatedAt: serverTimestamp() };

  const previous = await getQuiz(spaceId, quizId);
  const known = questionByIdMap(questions);
  const unread = ids.filter((id) => !known[id]);
  if (unread.length > 0) {
    const snaps = await Promise.all(
      unread.map((id) => getDoc(doc(db, ROOT.spaces, spaceId, COL.questions, id)))
    );
    for (const snap of snaps) {
      if (snap.exists()) known[snap.id] = snap.data();
    }
  }

  const manifest = buildQuizKeyManifest(ids, known);
  // Pin lama dipertahankan untuk soal yang revisinya tidak bisa dibaca ulang.
  for (const [id, rev] of Object.entries(previous?.questionKeyRevisions || {})) {
    if (ids.includes(id) && !manifest[id]) manifest[id] = rev;
  }
  if (Object.keys(manifest).length > 0) {
    patch.questionKeyRevisions = manifest;
  }
  await updateDoc(quizRef(spaceId, quizId), patch);
}

export async function getQuiz(spaceId, quizId) {
  requireUser();
  const snap = await getDoc(quizRef(spaceId, quizId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// Kedua anggota boleh membaca semua kuis di ruangnya (lihat rules).
export async function getQuizzes(spaceId) {
  requireUser();
  const snap = await getDocs(collection(db, ROOT.spaces, spaceId, COL.quizzes));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

// ===================================================================
// ATTEMPT ENGINE (CP2) — alur pengerjaan kuis.
//
// DUA VERSI SEKALIGUS, bukan salah satu:
//
//   v3 (BARU) — snapshot tanpa kunci, `answers` hanya `{questionId, userAnswer}`,
//               skor TIDAK ditulis client, status `pending_grading` setelah
//               submit. Ini jalur yang dipakai `startAttempt` sekarang.
//   v2 (LAMA) — snapshot menyalin kunci, `answers` menyimpan nilai, skor ditulis
//               client. Fungsi-fungsinya TETAP ADA karena attempt v2 yang sudah
//               tersimpan masih harus bisa dibaca dan di-finalisasi pemiliknya.
//
// CATATAN KEAMANAN: pada v2, skor dihitung di CLIENT (`computeScore`). Itu bukan
// mekanisme anti-tampering setara trusted server-side grading; yang dijaga rules
// hanya field struktural (lihat blok `attempts` di firestore.rules). Pada v3
// masalah ini hilang: client tidak punya kunci dan tidak menulis nilai apa pun ke
// dokumen attempt.
// ===================================================================

/**
 * Memulai attempt baru — SELALU versi 3.
 *
 * Yang ditulis ke Firestore sengaja dibuat MINIMAL:
 *   uid, quizId, startedAt, questionSnapshot, answers, status, schemaVersion
 *
 * Tidak ada `score`/`maxScore`/`scorePercent`/`passed`. Field-field itu milik
 * server (`serverOwnedScoreFields` di rules) dan tidak boleh diisi client; di v2
 * `startAttempt` pernah menulis `score: 0` yang membuat attempt terlihat "nol"
 * selama menunggu penilaian — sekarang keadaan itu direpresentasikan dengan
 * field nilai yang memang belum ada.
 *
 * @returns {string} attemptId
 */
export async function startAttempt(spaceId, quizId, quiz, questions) {
  const uid = requireUser();
  const byId = questionByIdMap(questions);

  // P2: penulis soal tidak boleh mengerjakan kuis yang memuat soal sendiri.
  // Dicek penuh di client supaya pesannya jelas; rules tetap memeriksa 8 soal
  // pertama sebagai jaring pengaman.
  assertNotAuthorOfQuizQuestions(uid, quiz, byId);

  // Snapshot = SALINAN TANPA KUNCI + nomor revisi kunci yang dikunci untuk
  // attempt ini. `questions` hanya dibutuhkan di baris ini; setelah dokumen
  // tersimpan tidak ada lagi pembacaan Question Bank untuk attempt ini.
  const questionSnapshot = buildQuestionSnapshotV3(
    quiz,
    byId,
    uid,
    quiz?.questionKeyRevisions
  );
  const answers = buildAnswersV3(questionSnapshot, {});
  const ref = doc(attemptsCol(spaceId, quizId));

  await setDoc(ref, {
    uid,
    quizId,
    startedAt: serverTimestamp(),
    completedAt: null,
    durationSeconds: null,
    questionSnapshot,
    answers,
    status: ATTEMPT_STATUS.inProgress,
    schemaVersion: ATTEMPT_SCHEMA_VERSION
  });
  return ref.id;
}

/**
 * Autosave jawaban sementara selama attempt masih `in_progress`.
 * Array `answers` ditulis utuh (Firestore tak mendukung update field di array).
 *
 * Bentuk entri answers tidak boleh berubah: v3 hanya boleh `{questionId,
 * userAnswer}` dan v2 boleh punya field nilai. Penyerahan jawaban di bawah sudah
 * memanggil `buildAnswersV3`/`buildAnswers` sesuai versinya.
 */
export async function saveAttemptDraft(spaceId, quizId, attemptId, answers) {
  requireUser();
  await updateDoc(attemptRef(spaceId, quizId, attemptId), { answers });
}

/**
 * Menutup attempt.
 *
 * v3 (jalur baru): answers diserahkan apa adanya, TANPA penilaian apa pun di
 * client. Status jadi `pending_grading` sambil memasang `submittedAt` — dua
 * hal itu hacerlo berpasangan karena `attemptOwnerStatusOk` di rules menolak
 * `pending_grading` tanpa `submittedAt`. Skor muncul setelah server menilainya;
 * sampai itu terjadi dokumen memang tidak punya field nilai.
 *
 * v2 (jalur lama): seperti sebelumnya — nilai ulang jawaban dari snapshot,
 * simpan skor, tentukan status. Hanya dipakai untuk attempt v2 yang sudah
 * ada, karena `create` di rules sudah menutup pembuatan attempt v2 baru.
 */
export async function submitAttempt(spaceId, quizId, attemptId, answers, attempt, passingScorePercent, previousAnswers, durationSeconds) {
  requireUser();
  const duration = Number.isFinite(durationSeconds) ? durationSeconds : null;

  if (isV3Attempt(attempt)) {
    await updateDoc(attemptRef(spaceId, quizId, attemptId), {
      answers,
      status: ATTEMPT_STATUS.pendingGrading,
      submittedAt: serverTimestamp(),
      durationSeconds: duration
    });
    return { score: null, maxScore: null, scorePercent: null, pending: true };
  }

  const byId = snapshotMap(attempt);
  const merged = preserveManualScores(answers, previousAnswers);
  const { score, maxScore, scorePercent, pending } = computeScore(merged, byId);

  await updateDoc(attemptRef(spaceId, quizId, attemptId), {
    answers: merged,
    score,
    maxScore,
    scorePercent,
    passed: scorePercent >= (Number(passingScorePercent) || 0),
    status: resolveAttemptStatus(merged),
    completedAt: serverTimestamp(),
    durationSeconds: duration
  });
  return { score, maxScore, scorePercent, pending };
}

/**
 * Recompute skor oleh PEMILIK setelah nilai manual tersedia.
 *
 * KHUSUS ATTEMPT v2 (LAMA). Pada v3 fungsi ini tidak boleh jalan: `score`,
 * `maxScore`, `scorePercent`, `passed` ada di `serverOwnedScoreFields`, dan rules
 * menolak owner yang mengubahnya (`changed().hasAny(...) == false`). Nilai v3
 * dihitung server dari dokumen kunci privat; pemilik tidak punya kunci itu, jadi
 * tidak ada yang bisa ia hitung sendiri.
 *
 * PENTING (race condition, jalur v2): fungsi ini TIDAK menulis `answers`, hanya
 * field skor. Jadi ketika partner baru saja menulis nilai manual lalu owner
 * menekan "Finalisasi", nilai manual partner tetap utuh dan tidak tertimpa.
 */
export async function finalizeAttempt(spaceId, quizId, attemptId, currentAnswers, attempt, passingScorePercent) {
  requireUser();
  if (isV3Attempt(attempt)) {
    throw new Error(
      'Nilai attempt ini dihitung otomatis oleh server dari kunci soal, jadi tidak bisa difinalisasi manual.'
    );
  }
  const byId = snapshotMap(attempt);
  const { score, maxScore, scorePercent } = computeScore(currentAnswers, byId);

  await updateDoc(attemptRef(spaceId, quizId, attemptId), {
    score,
    maxScore,
    scorePercent,
    passed: scorePercent >= (Number(passingScorePercent) || 0),
    status: ATTEMPT_STATUS.graded
  });
  return { score, maxScore, scorePercent };
}

/**
 * Mengisi nilai manual satu soal (oleh partner, atau pemilik sendiri).
 *
 * Dua jalur, karena bentuk entri jawaban berbeda:
 *   v3 — entri hanya boleh berisi `questionId`, `userAnswer`, dan metadata nilai
 *        manual (`partnerAnswerEntryOk` memakai `hasOnly`). Contoh entri v3 yang
 *        ikut disalin apa adanya akan ditolak rules.
 *   v2 — pertahankan apa adanya; hanya entri tujuan yang ditambah `manualScore`.
 *
 * Keduanya TIDAK boleh mengubah `userAnswer`/`questionId`; `answerEntryStableV3`
 * memverifikasi hal yang sama di sisi server.
 */
export async function gradeAnswerManually(spaceId, quizId, attemptId, answers, questionId, manualScore, manualFeedback, attempt) {
  const uid = requireUser();
  // CATATAN: `gradedAt` berada DI DALAM array `answers`, dan Firestore SDK
  // menolak `serverTimestamp()` di dalam array ("serverTimestamp() is not
  // currently supported inside arrays"). Karena itu dipakai `new Date()` —
  // waktu yang tercatat berasal dari client, bukan waktu server. Rules tetap
  // memvalidasinya sebagai `timestamp`.
  const gradedAt = new Date();
  const feedback = String(manualFeedback ?? '').trim().slice(0, 2000);
  const score = Math.max(0, Number(manualScore) || 0);

  if (isV3Attempt(attempt)) {
    await updateDoc(attemptRef(spaceId, quizId, attemptId), {
      answers: withManualScoreV3(answers, questionId, score, feedback, uid, gradedAt)
    });
    return;
  }

  const next = (Array.isArray(answers) ? answers : []).map((a) => {
    if (a.questionId !== questionId) return a;
    return {
      ...a,
      manualScore: score,
      manualFeedback: feedback,
      gradedBy: uid,
      gradedAt
    };
  });
  await updateDoc(attemptRef(spaceId, quizId, attemptId), { answers: next });
}

export async function getAttempt(spaceId, quizId, attemptId) {
  requireUser();
  const snap = await getDoc(attemptRef(spaceId, quizId, attemptId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAttempts(spaceId, quizId) {
  requireUser();
  const snap = await getDocs(attemptsCol(spaceId, quizId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.startedAt?.toMillis?.() || 0) - (a.startedAt?.toMillis?.() || 0));
}

// Hapus permanen (hanya pembuat; rules mengizinkan delete createdBy).
// TIDAK menghapus Question document mana pun — soal tetap utuh di bank soal.
export async function deleteQuiz(spaceId, quizId) {
  requireUser();
  await deleteDoc(quizRef(spaceId, quizId));
}