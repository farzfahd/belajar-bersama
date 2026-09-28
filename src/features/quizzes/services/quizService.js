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
  buildAnswers,
  buildQuestionSnapshot,
  computeScore,
  indexSnapshot,
  resolveAttemptStatus
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
export async function updateQuizQuestionIds(spaceId, quizId, questionIds) {
  requireUser();
  await updateDoc(quizRef(spaceId, quizId), {
    questionIds: normalizeQuestionIds(questionIds),
    updatedAt: serverTimestamp()
  });
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
// CATATAN KEAMANAN: skor dihitung di CLIENT (`computeScore`). Ini bukan
// mekanisme anti-tampering setara trusted server-side grading; yang dijaga
// rules hanya field struktural (lihat blok `attempts` di firestore.rules).
// ===================================================================

/**
 * Memulai attempt baru: `questionSnapshot` memuat SELURUH soal kuis (jumlah
 * soal = panjang `questionIds`), dan satu entri `answers` per soal dengan
 * `userAnswer: null`.
 * @returns {string} attemptId
 */
export async function startAttempt(spaceId, quizId, quiz, questions) {
  const uid = requireUser();
  // Snapshot = SALINAN ISI SOAL saat attempt dimulai. `questions` hanya
  // dibutuhkan di baris ini; tidak ada lagi pembacaan Question Bank
  // untuk attempt ini setelah dokumen tersimpan.
  const questionSnapshot = buildQuestionSnapshot(quiz, questionByIdMap(questions));
  const answers = buildAnswers(questionSnapshot, {});
  const ref = doc(attemptsCol(spaceId, quizId));

  await setDoc(ref, {
    uid,
    quizId,
    startedAt: serverTimestamp(),
    completedAt: null,
    durationSeconds: null,
    questionSnapshot,
    answers,
    score: 0,
    maxScore: 0,
    scorePercent: 0,
    passed: false,
    status: ATTEMPT_STATUS.inProgress,
    schemaVersion: ATTEMPT_SCHEMA_VERSION
  });
  return ref.id;
}

/**
 * Autosave jawaban sementara selama attempt masih `in_progress`.
 * Array `answers` ditulis utuh (Firestore tak mendukung update field di array).
 */
export async function saveAttemptDraft(spaceId, quizId, attemptId, answers) {
  requireUser();
  await updateDoc(attemptRef(spaceId, quizId, attemptId), { answers });
}

/**
 * Menutup attempt: nilai ulang jawaban, simpan skor, dan tentukan status
 * `completed` atau `pending_manual_grade`.
 *
 * Penilaian memakai KUNCI JAWABAN DARI SNAPSHOT (`attempt`), bukan dari Question
 * Bank. Jadi kalau soalnya sudah diedit/dihapus setelah attempt dimulai, skor
 * attempt ini tetap memakai versi soal yang benar-benar dikerjakan.
 *
 * `previousAnswers` dipakai agar `manualScore` yang sudah ada tidak hilang
 * (mis. saat mengulang submit karena auto-submit timer).
 */
export async function submitAttempt(spaceId, quizId, attemptId, answers, attempt, passingScorePercent, previousAnswers, durationSeconds) {
  requireUser();
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
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null
  });
  return { score, maxScore, scorePercent, pending };
}

/**
 * Recompute skor oleh PEMILIK setelah nilai manual tersedia.
 *
 * PENTING (race condition): fungsi ini TIDAK menulis `answers`, hanya field
 * skor. Jadi ketika partner baru saja menulis nilai manual lalu owner menekan
 * "Finalisasi", nilai manual partner tetap utuh dan tidak tertimpa.
 */
export async function finalizeAttempt(spaceId, quizId, attemptId, currentAnswers, attempt, passingScorePercent) {
  requireUser();
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
 * Array `answers` ditulis ulang karena Firestore tidak mendukung update field
 * di dalam array. `questionId`/`userAnswer`/`pointsEarned`/`isCorrect`/
 * `needsManualGrade` pada entri tujuan TIDAK diubah — `answerEntryStable` di
 * rules memverifikasi hal yang sama di sisi server.
 */
export async function gradeAnswerManually(spaceId, quizId, attemptId, answers, questionId, manualScore, manualFeedback) {
  const uid = requireUser();
  const next = (Array.isArray(answers) ? answers : []).map((a) => {
    if (a.questionId !== questionId) return a;
    return {
      ...a,
      manualScore: Math.max(0, Number(manualScore) || 0),
      manualFeedback: String(manualFeedback ?? '').trim().slice(0, 2000),
      gradedBy: uid,
      // CATATAN: `gradedAt` berada DI DALAM array `answers`, dan Firestore SDK
      // menolak `serverTimestamp()` di dalam array ("serverTimestamp() is not
      // currently supported inside arrays"). Karena itu dipakai `new Date()` —
      // waktu yang tercatat berasal dari client, bukan waktu server. Rules tetap
      // memvalidasinya sebagai `timestamp`.
      gradedAt: new Date()
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