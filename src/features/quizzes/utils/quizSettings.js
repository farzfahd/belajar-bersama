// Validasi sisi client untuk dokumen kuis (UX). Keamanan sebenarnya ditegakkan
// di Firestore Rules (`validQuiz` / `validQuizSettings`). Bersifat murni: tanpa
// React maupun Firestore, supaya bisa diuji dengan `node --test`.

// Ekstensi `.js` dipakai karena modul ini diimpor langsung oleh `node --test`
// (ESM murni tanpa loader Vite). Service boleh tetap tanpa ekstensi.
import { QUIZ_LIMITS, QUIZ_SETTINGS_DEFAULTS } from '../../../lib/constants.js';

// Mode tampilkan kunci jawaban setelah kuis selesai.
export const QUIZ_SHOW_ANSWER_MODES = ['none', 'after_each', 'after_all'];

function text(value) {
  return String(value ?? '').trim();
}

function requireInt(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} harus bilangan bulat ${min}–${max}.`);
  }
  return n;
}

function requireBool(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} harus true atau false.`);
  return value;
}

/**
 * Membersihkan & memvalidasi snapshot `questionIds`.
 * - wajib berupa array dengan 1..50 id
 * - setiap id: string, non-kosong setelah trim, maksimal 100 karakter
 * - duplikat ditolak (bukan dihapus diam-diam) supaya kuis tidak diam-diam
 *   berbeda dari yang ditulis pengguna
 *
 * Catatan: id ini TIDAK diverifikasi keberadaannya di koleksi `questions`
 * (butuh 1 read per id; Firestore Rules juga tidak bisa melakukan loop).
 * Verifikasi keberadaan itu tanggung jawab service/UI, bukan rules.
 */
export function normalizeQuestionIds(input) {
  if (!Array.isArray(input)) throw new Error('Daftar soal kuis tidak valid.');
  if (input.length < QUIZ_LIMITS.minQuestions) {
    throw new Error(`Kuis harus memiliki minimal ${QUIZ_LIMITS.minQuestions} soal.`);
  }
  if (input.length > QUIZ_LIMITS.maxQuestions) {
    throw new Error(`Kuis maksimal ${QUIZ_LIMITS.maxQuestions} soal.`);
  }

  const seen = new Set();
  const ids = [];
  for (const raw of input) {
    const id = text(raw);
    if (!id) throw new Error('Kuis memuat id soal kosong.');
    if (id.length > 100) throw new Error('Id soal kuis terlalu panjang.');
    if (seen.has(id)) throw new Error(`Soal dengan id ${id} sudah ada di kuis ini.`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Menggabungkan input settings dengan default, lalu memvalidasi tipe & rentang.
 * Semua kunci settings selalu dikembalikan utuh (dipakai apa adanya) supaya
 * memenuhi `validQuizSettings` yang mengunci `keys().hasOnly([...])`.
 */
export function normalizeQuizSettings(input) {
  const s = { ...QUIZ_SETTINGS_DEFAULTS, ...(input || {}) };

  // Kunci asing dibuang diam-diam di sini, TIDAK di rules: rules menolak dokumen
  // (hasOnly), jadi lebih baik service men-_normalize_ daripada gagal menulis.
  for (const key of Object.keys(s)) {
    if (!(key in QUIZ_SETTINGS_DEFAULTS)) delete s[key];
  }

  const questionCount = requireInt(
    s.questionCount, 'Jumlah soal', QUIZ_LIMITS.minQuestions, QUIZ_LIMITS.maxQuestions
  );
  const timeLimitMinutes = requireInt(s.timeLimitMinutes, 'Batas waktu', 0, QUIZ_LIMITS.maxTimeLimitMinutes);
  const passingScorePercent = requireInt(s.passingScorePercent, 'Nilai kelulusan', 0, 100);
  const maxAttempts = requireInt(s.maxAttempts, 'Batas percobaan', 1, QUIZ_LIMITS.maxAttempts);
  const showAnswerMode = text(s.showAnswerMode);

  if (!QUIZ_SHOW_ANSWER_MODES.includes(showAnswerMode)) {
    throw new Error('Mode tampilkan jawaban tidak valid.');
  }

  return {
    questionCount,
    randomizeQuestionOrder: requireBool(s.randomizeQuestionOrder, 'Acak urutan soal'),
    randomizeOptionOrder: requireBool(s.randomizeOptionOrder, 'Acak urutan pilihan'),
    timeLimitMinutes,
    passingScorePercent,
    maxAttempts,
    showAnswerMode,
    showExplanation: requireBool(s.showExplanation, 'Tampilkan pembahasan'),
    allowRetry: requireBool(s.allowRetry, 'Izinkan ulangan')
  };
}

/**
 * Judul & deskripsi kuis (dipakai create dan update).
 */
export function normalizeQuizText(input) {
  const title = text(input.title);
  if (!title) throw new Error('Judul kuis wajib diisi.');
  if (title.length > QUIZ_LIMITS.maxTitle) {
    throw new Error(`Judul maksimal ${QUIZ_LIMITS.maxTitle} karakter.`);
  }

  const description = text(input.description);
  if (description.length > QUIZ_LIMITS.maxDescription) {
    throw new Error(`Deskripsi maksimal ${QUIZ_LIMITS.maxDescription} karakter.`);
  }

  const topicId = text(input.topicId);
  if (!topicId) throw new Error('Topik kuis wajib dipilih.');

  return { title, description, topicId };
}