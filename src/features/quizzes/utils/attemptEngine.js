// Utilitas murni untuk mesin pengerjaan kuis (CP2 attempt engine).
//
// PENTING: penilaian jawaban TIDAK ditulis ulang di sini. Modul ini mengimpor
// dan memakai ulang `gradeQuestionAnswer` dari
// `src/features/questions/utils/grading.js` (satu-satunya grading engine, sudah
// terverifikasi untuk 10 tipe soal). Kalau suatu saat perlu perilaku penilaian
// berbeda untuk kuis, ubah/parameterisasi di SATU tempat itu, bukan menambah
// salinan di sini.
//
// Modul ini murni (tanpa React/Firestore) supaya bisa diuji dengan `node --test`.
// Ekstensi `.js` dipakai karena diimpor langsung oleh `node --test`.
import { gradeQuestionAnswer } from '../../questions/utils/grading.js';

// Status lifecycle attempt. `in_progress` = masih dikerjakan; `completed` =
// selesai & semua soal ter-nilai otomatis; `pending_manual_grade` = selesai
// tapi masih ada soal uraian/kode yang menunggu penilaian; `graded` = sudah
// di-finalisasi pemilik setelah nilai manual tersedia.
export const ATTEMPT_STATUS = {
  inProgress: 'in_progress',
  completed: 'completed',
  pendingManualGrade: 'pending_manual_grade',
  graded: 'graded'
};

export const ATTEMPT_STATUSES = Object.values(ATTEMPT_STATUS);

/**
 * Tipe khusus untuk entri snapshot yang SOALNYA TIDAK ADA saat attempt
 * dimulai (sudah dihapus, atau private sehingga tidak terlihat oleh
 * Dosennyah yang memulai attempt).
 *
 * Ini kasus tepi, bukan kondisi normal: begitu attempt punya snapshot lengkap,
 * attempt lama tetap bisa dirender walau soal aslinya kemudian dihapus. Tipe
 * ini hanya muncul bila soal sudah hilang SEBELUM attempt dimulai, dan entry
 * seperti ini selalu `available: false` sehingga tidak pernah dinilai otomatis
 * (lihat `gradeAnswerFor`).
 */
export const UNAVAILABLE_TYPE = 'unavailable';

/**
 * Field yang dipakai SEMUA tipe soal.
 *
 * Tabel ini BUKAN hasil tebakan: setiap field diturunkan dari pemakaian nyata
 * di dua tempat, dan tidak ada field lain yang boleh masuk:
 *   - `QuestionAttemptForm.jsx` (render attempt & review)
 *   - `gradeQuestionAnswer()` di `questions/utils/grading.js` (grading)
 *
 *  type       -> cabang render + cabang grading
 *  prompt     -> `QuestionAttemptForm.jsx:52` (teks soal)
 *  points     -> `grading.js:18` (poin per soal) & `computeScore` (maxScore)
 *  explanation-> `QuizAttemptResultPage.jsx:185` (dibatasi `settings.showExplanation`)
 */
const SNAPSHOT_COMMON_FIELDS = ['type', 'prompt', 'points', 'explanation'];

/**
 * Field kunci per tipe — dipetakan 1:1 dari apa yang dibaca `grading.js`
 * dan yang dirender `QuestionAttemptForm.jsx`:
 *
 *  single      -> answerIndex            (grading.js:23) + options  (render:56)
 *  multiple    -> correctIndices         (grading.js:34) + options  (render:88)
 *  boolean     -> correctBoolean         (grading.js:52)
 *  short_answer-> acceptedAnswers        (grading.js:63) + hint review (render:123)
 *  essay       -> sampleAnswer           (referensi bagi penilai manual)
 *  matching    -> pairs                  (grading.js:85) + render:143
 *  ordering    -> items                  (grading.js:102) + render:166
 *  numerical   -> correctValue+tolerance (grading.js:117-118) + hint review (render:187)
 *  code        -> starterCode            (render:195) + expectedOutput/sampleSolution
 *                                         (referensi bagi penilai manual)
 *  case_study  -> caseText + subQuestions(grading.js:151-158) + render:205-262
 *
 * Field question yang SENGAJA TIDAK disalin karena tidak dibaca satu pun dari
 * dua tempat di atas: `topicId`, `difficulty`, `visibility`, `tags`,
 * `createdBy`, `createdAt`, `updatedAt`, `deletedAt`, `schemaVersion`,
 * `commentCount`, `timeLimitSeconds`, `attachmentUrl`, `relatedNoteId`,
 * `relatedResourceId`, `hasAnswerKey`. Menyalinnya hanya memperbesar dokumen
 * tanpa memperbaiki perilaku apa pun.
 */
const SNAPSHOT_TYPE_FIELDS = {
  single: ['options', 'answerIndex'],
  multiple: ['options', 'correctIndices'],
  boolean: ['correctBoolean'],
  short_answer: ['acceptedAnswers'],
  essay: ['sampleAnswer'],
  matching: ['pairs'],
  ordering: ['items'],
  numerical: ['correctValue', 'tolerance'],
  code: ['starterCode', 'expectedOutput', 'sampleSolution'],
  case_study: ['caseText', 'subQuestions']
};

/** Field yang boleh ditulis di entri sub-soal studi kasus (satu tingkat, sesuai rules). */
const SUB_SNAPSHOT_FIELDS = {
  single: ['prompt', 'options', 'answerIndex'],
  multiple: ['prompt', 'options', 'correctIndices'],
  boolean: ['prompt', 'correctBoolean'],
  short_answer: ['prompt', 'acceptedAnswers'],
  matching: ['prompt', 'pairs'],
  ordering: ['prompt', 'items'],
  numerical: ['prompt', 'correctValue', 'tolerance']
};

/**
 * Salin nilai secara dalam (deep copy) untuk array & objek biasa.
 *
 * WAJIB: tanpa ini, `options`, `correctIndices`, `pairs`, `items`, dan
 * `subQuestions` pada snapshot akan berbagi objek yang sama dengan dokumen soal
 * di Question Bank. Kalau array itu nanti dimutasi di tempat (bukan diganti
 * objek baru), attempt lama ikut berubah — persis yang harus dicegah snapshot.
 * `Date`/`Timestamp` tidak muncul di field yang disalin, jadi tidak perlu
 * penanganan khusus.
 */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = cloneValue(v);
    return out;
  }
  return value;
}

/**
 * Field soal yang KHUSUS editor dan TIDAK BOLEH PERNAH masuk snapshot peserta.
 *
 * `pairDraft` menyimpan `lefts`/`rights`/`assigned` - peta sambungan yang SEDANG
 * disusun di builder. `assigned` praktis membocorkan jawaban benar, jadi field
 * ini tidak boleh sampai ke dokumen attempt. Peserta hanya membacanya dari
 * `questionSnapshot`, jadi menjauhkannya di sini sudah cukup.
 *
 * CATATAN: `buildSnapshotEntry` sudah memakai DAFTAR IZIN
 * (`SNAPSHOT_COMMON_FIELDS` + `SNAPSHOT_TYPE_FIELDS` di atas), bukan menyalin
 * seluruh objek soal, jadi `pairDraft` secara struktural memang tidak bisa ikut.
 * Daftar di bawah adalah pengaman lapis kedua yang eksplisit: kalau suatu saat
 * ada penyuntingan yang menambahkan field ke daftar izin, pengaman ini tetap
 * menutup celahnya. Jangan dihapus tanpa penggantinya.
 */
const EDITOR_ONLY_FIELDS = ['pairDraft'];

/** Buang field editor-only dari entri snapshot. Pengaman lapis kedua. */
function stripEditorOnlyFields(entry) {
  for (const field of EDITOR_ONLY_FIELDS) delete entry[field];
  return entry;
}

function pick(source, fields) {
  const out = {};
  for (const field of fields) {
    if (source && Object.prototype.hasOwnProperty.call(source, field)) {
      out[field] = cloneValue(source[field]);
    }
  }
  return out;
}

/**
 * Salin satu sub-soal studi kasus. Sub-soal tidak membawa `points` sendiri
 * (`grading.js:154` membagi poin induk per jumlah sub-soal) dan tidak boleh
 * punya `subQuestions`/another level — itu sudah dikunci `validCaseStudy`.
 */
function buildSubSnapshotEntry(sub) {
  const fields = SUB_SNAPSHOT_FIELDS[sub?.type];
  if (!fields) return { type: UNAVAILABLE_TYPE, prompt: '', available: false };
  // `type` WAJIB ikut disalin: `grading.js` memilih cabang penilaian per tipe
  // sub-soal, jadi sub-soal tanpa `type` akan selalu jatuh ke manual.
  return stripEditorOnlyFields({ type: sub.type, ...pick(sub, fields) });
}

/**
 * Salin isi LENGKAP satu soal menjadi entri snapshot.
 *
 * `question` boleh `null`/tidak terbaca (soal sudah dihapus atau private saat
 * attempt dimulai). Hasilnya tetap sebuah entri supaya jumlah `answers`
 * selalu sama dengan `questionSnapshot` dan indeks soal tidak bergeser.
 */
export function buildSnapshotEntry(question, questionId) {
  const id = question?.id || questionId;
  if (!question || question.available === false) {
    return {
      id,
      type: UNAVAILABLE_TYPE,
      prompt: '',
      points: 0,
      available: false
    };
  }

  const type = question.type || 'single';
  const entry = { id, ...pick(question, SNAPSHOT_COMMON_FIELDS) };
  entry.type = type;
  entry.prompt = typeof question.prompt === 'string' ? question.prompt : '';
  // `points` opsional di dokumen soal; `grading.js:18` memakai default 10.
  // Disalin sebagai nilai yang sudah final supaya attempt lama tidak ikut
  // berubah bila default atau nilai poin di Question Bank diubah belakangan.
  entry.points = Number.isFinite(Number(question.points)) && Number(question.points) > 0
    ? Number(question.points)
    : 10;

  const fields = SNAPSHOT_TYPE_FIELDS[type] || [];
  Object.assign(entry, pick(question, fields));
  if (type === 'case_study') {
    entry.caseText = typeof question.caseText === 'string' ? question.caseText : '';
    entry.subQuestions = (Array.isArray(question.subQuestions) ? question.subQuestions : []).map(
      buildSubSnapshotEntry
    );
  }
  // Pengaman lapis kedua (lihat `EDITOR_ONLY_FIELDS`): `pairDraft` sudah tidak
  // bisa masuk lewat daftar izin, dan di sini kita pastikan tetap begitu.
  return stripEditorOnlyFields(entry);
}

/**
 * Menyusun `questionSnapshot` dari kuis — SALINAN ISI SOAL, bukan daftar ID.
 *
 * Ini adalah kontrak inti attempt: begitu attempt dibuat, kuis maupun Question
 * Bank boleh berubah sesuka hati tanpa mengubah attempt tersebut. Render,
 * penjawabannya, grading, dan review SEMUA membaca dari snapshot ini — tidak
 * pernah menanyakan ulang ke dokumen `questions/{questionId}`.
 *
 * Jumlah & urutan tetap mengikuti `quiz.questionIds` (`questionCount` sudah
 * dihapus; `randomizeQuestionOrder` hanya mengacak URUTAN, bukan mengambil
 * sebagian), jadi urutan soal pada attempt sama dengan urutan di kuis.
 *
 * `questionById` hanya dibutuhkan DI SINA — saat attempt dimulai. Setelah
 * fungsi ini dipanggil, pemanggil tidak boleh bergantung pada live questions
 * lagi.
 */
export function buildQuestionSnapshot(quiz, questionById, seed) {
  const ids = Array.isArray(quiz?.questionIds) ? quiz.questionIds : [];
  const ordered = quiz?.settings?.randomizeQuestionOrder ? shuffle(ids, seed) : [...ids];
  return ordered.map((id) => buildSnapshotEntry(resolveQuestion(questionById, id), id));
}

/**
 * Baca satu soal dari sumber apa pun: `Map`, objek biasa, atau null.
 * Dipakai agar `computeScore`/helper tetap bisa menerima bentuk lama.
 */
export function resolveQuestion(source, questionId) {
  if (!source || !questionId) return null;
  if (source instanceof Map) return source.get(questionId) || null;
  return source[questionId] || null;
}

/**
 * Indeks snapshot berdasarkan `id`, untuk lookup cepat saat render & grading.
 * `id` dijamin unik di dalam satu kuis (`validQuiz` menolak `questionIds` duplikat),
 * jadi pemetaan ini tidak pernah menimpa.
 */
export function indexSnapshot(snapshot) {
  const map = new Map();
  for (const entry of Array.isArray(snapshot) ? snapshot : []) {
    if (entry?.id) map.set(entry.id, entry);
  }
  return map;
}


/**
 * Fisher–Yates dengan PRNG mulberry32 bila `seed` diberikan, sehingga urutan
 * acak bisa direproduksi (berguna untuk tes & untuk snapshot attempt).
 * Tanpa seed memakai Math.random (acak sungguhan, tidak direproduksi).
 */
function shuffle(items, seed) {
  const out = [...items];
  const rand = seed === undefined || seed === null ? Math.random : mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bangun array `answers` untuk attempt baru.
 *
 * Setiap entri `answers` hanya melihat snapshot, bukan Question Bank. Karena
 * itu `questionById` tidak lagi diperlukan: entri snapshot sudah memuat kunci
 * jawabannya.
 *
 * Setiap soal punya satu entri, termasuk soal yang belum dijawab (userAnswer
 * `null`) — supaya `maxScore` dan lokasi soal tidak berubah saat menjawab,
 * dan indeks soal stabil antar render.
 */
export function buildAnswers(questionSnapshot, userAnswers = {}) {
  const entries = Array.isArray(questionSnapshot) ? questionSnapshot : [];
  return entries.map((entry) => {
    const questionId = entry?.id;
    const userAnswer = Object.prototype.hasOwnProperty.call(userAnswers, questionId)
      ? userAnswers[questionId]
      : null;
    return gradeAnswerFor(questionId, entry, userAnswer);
  });
}

/**
 * Menilai satu entri jawaban memakai grading engine yang sudah ada, dengan
 * kunci jawaban dari SALINAN SOAL di snapshot.
 *
 * `needsManualGrade` = true untuk tipe 5 (uraian) & 9 (kode), dan untuk
 * case_study yang memuat sub-soal bertipe manual (ditentukan grading engine).
 * Entri `unavailable` (soal sudah hilang sebelum attempt dimulai) juga
 * diperlakukan manual dengan 0 poin.
 */
export function gradeAnswerFor(questionId, question, userAnswer) {
  if (!question || question.available === false || hasUngradableSubQuestion(question)) {
    // Soal hilang/tidak terbaca SAAT ATTEMPT DIMULAI, atau studi kasus yang
    // memuat sub-soal tidak bisa dinilai. Jangan crash dan jangan auto-"salah":
    // tandai perlu penilaian manual agar attempt tidak bisa lolos dengan skor
    // penuh atau kehilangan poin tanpa jalur perbaikan.
    return blankAnswer(questionId, userAnswer, true);
  }
  const result = gradeQuestionAnswer(question, userAnswer);
  const needsManual = result.isManual === true;
  return {
    questionId,
    userAnswer: userAnswer ?? null,
    isCorrect: needsManual ? null : Boolean(result.isCorrect),
    pointsEarned: needsManual ? 0 : Number(result.pointsEarned) || 0,
    needsManualGrade: needsManual,
    manualScore: null,
    manualFeedback: '',
    gradedBy: null,
    gradedAt: null
  };
}

/**
 * Apakah studi kasus ini punya sub-soal yang TIDAK bisa dinilai otomatis?
 *
 * `SUB_SNAPSHOT_FIELDS` hanya memuat 7 tipe otomatis (sesuai `validCaseStudy`),
 * jadi sub-soal bertipe lain — atau bertipe rusak — menjadi `unavailable` di
 * snapshot. `gradeQuestionAnswer` akan menilainya `isCorrect: false` dengan
 * `isManual: false`, artinya sub itu otomatis salah tanpa pernah masuk antrean
 * penilaian. Untuk attempt itu berarti poin hilang tanpa ada yang bisa menilai
 * ulang, jadi seluruh soalnya kita alihkan ke penilaian manual.
 */
function hasUngradableSubQuestion(question) {
  if (question?.type !== 'case_study') return false;
  if (!Array.isArray(question.subQuestions)) return false;
  return question.subQuestions.some((sub) => sub?.type === UNAVAILABLE_TYPE);
}

function blankAnswer(questionId, userAnswer, needsManual) {
  return {
    questionId,
    userAnswer: userAnswer ?? null,
    isCorrect: needsManual ? null : false,
    pointsEarned: 0,
    needsManualGrade: needsManual,
    manualScore: null,
    manualFeedback: '',
    gradedBy: null,
    gradedAt: null
  };
}

/**
 * Daftar soal yang belum dijawab, untuk dialog konfirmasi submit.
 *
 * "Belum dijawab" ditentukan dari sisi DATA, bukan tebakan per tipe: entri
 * dengan `userAnswer` null/tidak ada. Entri `unavailable` (soal hilang saat
 * attempt dimulai) TIDAK dihitung - peserta tidak mungkin menjawabnya, jadi
 * menghitungnya akan membuat attempt mustahil dikirim.
 *
 * PENTING: penanda `available`/`optional` hidup di SNAPSHOT soal, bukan di
 * objek jawaban (dokumen `answers` tidak boleh membawa field tambahan).
 * Karena itu sumber soal harus diteruskan; tanpa sumber, entri dianggap
 * biasa dan tetap dihitung sebagai belum dijawab.
 *
 * Belum ada tipe soal yang boleh dikosongkan di schema saat ini, jadi
 * entri `optional: true` (kalau nanti ada) tidak masuk daftar ini dan
 * aturannya tetap di satu tempat.
 */
export function findUnanswered(answers, questionSource) {
  const list = Array.isArray(answers) ? answers : [];
  const unanswered = [];
  list.forEach((answer, index) => {
    const question = resolveQuestion(questionSource, answer?.questionId) || null;
    if (question?.available === false) return;
    if (question?.optional === true) return;
    if (answer?.available === false) return;
    if (isAnswered(answer?.userAnswer)) return;
    unanswered.push({ index, questionId: answer?.questionId ?? null });
  });
  return {
    count: unanswered.length,
    indices: unanswered.map((u) => u.index),
    questionIds: unanswered.map((u) => u.questionId),
    items: unanswered,
    hasUnanswered: unanswered.length > 0
  };
}

/** Apakah nilai jawaban peserta dianggap sudah menjawab. */
function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  // boolean & angka: apa pun yang benar-benar tersimpan sudah dianggap menjawab.
  return true;
}

/**
 * Nilai final satu soal: nilai manual bila ada, jika tidak nilai otomatis.
 */
export function effectivePoints(answer) {
  if (answer?.needsManualGrade) {
    const m = Number(answer.manualScore);
    return Number.isFinite(m) && m > 0 ? m : 0;
  }
  return Number(answer?.pointsEarned) || 0;
}

/** Apakah attempt masih punya soal yang belum dinilai manual. */
export function hasPendingManual(answers) {
  return (Array.isArray(answers) ? answers : []).some(
    (a) => a?.needsManualGrade && (a.manualScore === null || a.manualScore === undefined)
  );
}

/**
 * Hitung skor akhir attempt dari daftar jawaban.
 *
 * `questionSource` = salinan snapshot (`Map` dari `indexSnapshot`, atau objek
 * biasa). Poin dibaca dari snapshot, BUKAN dari Question Bank, sehingga nilai
 * `maxScore` attempt lama tidak ikut berubah bila `points` di bank soal diubah
 * belakangan.
 *
 * CATATAN KEAMANAN (limitation arsitektural yang disengaja & terdokumentasi):
 * perhitungan ini berjalan di CLIENT dan hanya ber-integritas seperti data yang
 * dikirim client — ini BUKAN mekanisme anti-tampering setara trusted server-side
 * grading. Yang dijaga rules hanyalah field struktural: `uid`/`quizId`/
 * `startedAt`/`questionSnapshot` immutable, dan partner tidak boleh menyentuh
 * `userAnswer`/`score`/`maxScore`. Nilai manual pun tidak terverifikasi karena
 * partner memang diizinkan menulisnya (keputusan CP2).
 */
export function computeScore(answers, questionSource = new Map()) {
  const list = Array.isArray(answers) ? answers : [];
  const score = list.reduce((sum, a) => sum + effectivePoints(a), 0);

  // Soal yang hilang diperlakukan 0 poin supaya tidak menambah ekspektasi
  // poin yang tidak mungkin dicapai.
  const maxScore = list.reduce((sum, a) => {
    const p = Number(resolveQuestion(questionSource, a.questionId)?.points);
    return sum + (Number.isFinite(p) && p > 0 ? p : 0);
  }, 0);

  // Pembulatan ke 1 desimal supaya persentase tidak menghasilkan angka panjang.
  const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
  return { score, maxScore, scorePercent, pending: hasPendingManual(list) };
}

/** Status akhir attempt setelah auto-grading atau recompute. */
export function resolveAttemptStatus(answers) {
  return hasPendingManual(answers) ? ATTEMPT_STATUS.pendingManualGrade : ATTEMPT_STATUS.completed;
}

/** Apakah attempt sudah boleh di-finalisasi pemilik (tidak ada manual tertinggal). */
export function canFinalize(answers) {
  return !hasPendingManual(answers);
}

/** Ubah timestamp Firestore/Date/number menjadi milidetik, atau null. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Durasi attempt dalam detik, minimal 0; null bila timestamp tak terbaca. */
export function computeDurationSeconds(startedAt, completedAt) {
  const a = toMillis(startedAt);
  const b = toMillis(completedAt);
  if (a === null || b === null) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/**
 * Sisa detik untuk timer berdasarkan `timeLimitMinutes` kuis.
 * `null` bila kuis tidak punya batas waktu (0 = tanpa batas).
 */
export function remainingSeconds(timeLimitMinutes, nowMs, startedAtMs) {
  const minutes = Number(timeLimitMinutes) || 0;
  if (minutes <= 0) return null;
  const start = toMillis(startedAtMs);
  if (start === null) return null;
  return Math.max(0, minutes * 60 - Math.floor((nowMs - start) / 1000));
}

/** Format detik menjadi mm:ss, atau h:mm:ss bila >= 1 jam. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Berapa attempt lagi yang boleh dibuat. */
export function attemptsRemaining(attempts, maxAttempts) {
  const used = (Array.isArray(attempts) ? attempts : []).length;
  const max = Number(maxAttempts) || 1;
  return Math.max(0, max - used);
}

/** Apakah quiz boleh dicoba lagi. */
export function canStartNewAttempt(attempts, maxAttempts, allowRetry) {
  if (allowRetry === false) return false;
  return attemptsRemaining(attempts, maxAttempts) > 0;
}

/** Cari attempt milik `uid` yang masih berjalan, agar dilanjutkannya bukan diulang. */
export function findInProgress(attempts, uid) {
  return (
    (Array.isArray(attempts) ? attempts : []).find(
      (a) => a?.status === ATTEMPT_STATUS.inProgress && (!uid || a.uid === uid)
    ) || null
  );
}
