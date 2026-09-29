/**
 * INTI PENILAIAN SIDE SERVER — MURNI, tanpa Firestore, tanpa TypeScript
 * (Assessment Security, M6/PART 26).
 *
 * KENAPA FILE INI `.js` BUKAN `.ts`:
 * Agar bisa diimpor langsung oleh `node --test` tanpa build step, sehingga
 * paritas client-vs-server bisa diverifikasi di setiap `npm run test:units`.
 * File `.ts` yang butuh Firestore (`gradeAttempt.ts`) mengimpor modul ini —
 * bukan menyalin logikanya.
 *
 * KENAPA INI BUKAN "ALGORITMA PENILAIAN KEDUA":
 * Modul ini tidak menentukan benar/salah. Ia memanggil
 * `gradeQuestionAnswer` dari `./grading.js`, yang salinannya byte-identik
 * dengan `src/features/questions/utils/grading.js` (dijaga oleh
 * `scripts/sync-grading.mjs` + `tests/grading-parity.test.mjs`).
 * Modul ini hanya merakit: membaca kunci privat, memanggil penilaian tunggal
 * itu, memvalidasi nilai manual, dan menjumlahkan poin.
 */

import { createHash } from 'node:crypto';
import { gradeQuestionAnswer, round2 } from './grading.js';

export const KEY_SUBCOLLECTION = 'key';
export const ATTEMPT_SCHEMA_VERSION_V3 = 3;
export const SCORE_SOURCE_SERVER = 'server';
export const UNAVAILABLE_TYPE = 'unavailable';

export const ATTEMPT_STATUS = {
  inProgress: 'in_progress',
  pendingGrading: 'pending_grading',
  pendingManualGrade: 'pending_manual_grade',
  graded: 'graded',
  completed: 'completed'
};

export const TERMINAL_STATUSES = [ATTEMPT_STATUS.graded, ATTEMPT_STATUS.completed];

/** Attempt sudah dikirim peserta? */
export function isSubmitted(attempt) {
  return !!attempt && attempt.submittedAt !== undefined && attempt.submittedAt !== null;
}

/**
 * Attempt yang belum boleh dinilai (masih draft).
 *
 * `submittedAt` adalah SATU-SATUNYA penanda submission yang dipercayai.
 * `status` sengaja tidak dipakai sebagai gerbang: `status` justru ditulis
 * server, jadi menjadikannya syarat akan membuat attempt macet bila client
 * gagal menulis status (mis. trimpartial). Karena `applyGradeToAttempt` punya
 * penjaga hash, penilaian ulang pada attempt yang sudah `graded` tetap aman dan
 * idempoten.
 */
export function shouldSkipGrading(attempt) {
  if (!attempt) return true;
  if (!isSubmitted(attempt)) return true;
  if (!Array.isArray(attempt.answers)) return true;
  return false;
}

/** JSON stabil supaya hash tidak berubah hanya karena urutan key. */
export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hash stabil dari isi jawaban — dasar idempotensi (M9). */
export function hashAnswers(answers) {
  const canonical = (Array.isArray(answers) ? answers : []).map((a) => ({
    questionId: (a && a.questionId) || null,
    userAnswer: stableStringify(a && a.userAnswer !== undefined ? a.userAnswer : null),
    needsManualGrade: Boolean(a && a.needsManualGrade),
    manualScore: a && a.manualScore !== undefined ? a.manualScore : null,
    manualFeedback: (a && a.manualFeedback) || null,
    gradedBy: (a && a.gradedBy) || null
  }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Validasi `manualScore` (M10): harus angka finite dan di rentang 0..points.
 * Mengembalikan null bila tidak valid — pemanggil WAJIB memperlakukan null
 * sebagai "belum dinilai", bukan sebagai 0.
 *
 * Perhatikan: `Number(null)`, `Number('')`, dan `Number(false)` semuanya bernilai
 * 0. Kalau jenisnya tidak diperiksa lebih dulu, `manualScore: null` akan terbaca
 * sebagai "nilai 0 yang sah" dan menutup soal manual tanpa pernah dinilai. Jadi
 * jenis datanya diperiksa eksplisit.
 */
export function validateManualScore(manualScore, maxPoints) {
  if (manualScore === null || manualScore === undefined) return null;
  if (typeof manualScore === 'boolean') return null;
  if (typeof manualScore === 'string' && manualScore.trim() === '') return null;
  if (typeof manualScore !== 'number' && typeof manualScore !== 'string') return null;
  const n = Number(manualScore);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > Number(maxPoints)) return null;
  return round2(n);
}

/** Poin maksimal satu entri snapshot. */
export function pointsOf(entry) {
  const p = Number(entry && entry.points);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/**
 * Rakit objek soal yang dibaca `gradeQuestionAnswer` dari entri snapshot
 * (publik) + dokumen kunci (privat).
 *
 * Kolom publik (options/caseText/starterCode) diambil dari snapshot; seluruh
 * kolom kunci diambil dari dokumen kunci privat. Keduanya tidak pernah dicampur
 * dari satu sumber yang sama.
 */
export function buildGradingSubject(entry, key) {
  const type = (entry && entry.type) || 'single';
  if (type === UNAVAILABLE_TYPE || (entry && entry.available === false)) {
    return { type: UNAVAILABLE_TYPE, points: 0 };
  }
  const subject = { type, points: pointsOf(entry) || 10 };
  if (entry && Array.isArray(entry.options)) subject.options = entry.options;
  if (!key) return subject;

  switch (type) {
    case 'single':
      subject.answerIndex = Number(key.answerIndex);
      break;
    case 'multiple':
      if (Array.isArray(key.correctIndices)) subject.correctIndices = key.correctIndices;
      break;
    case 'boolean':
      subject.correctBoolean = Boolean(key.correctBoolean);
      break;
    case 'short_answer':
      if (Array.isArray(key.acceptedAnswers)) subject.acceptedAnswers = key.acceptedAnswers;
      break;
    case 'matching':
      if (Array.isArray(key.pairs)) subject.pairs = key.pairs;
      break;
    case 'ordering':
      if (Array.isArray(key.items)) subject.items = key.items;
      break;
    case 'numerical':
      subject.correctValue = key.correctValue;
      subject.tolerance = Number(key.tolerance) || 0;
      break;
    case 'case_study': {
      if (!Array.isArray(key.subQuestions)) break;
      const publicSubs = entry && Array.isArray(entry.subQuestions) ? entry.subQuestions : [];
      subject.subQuestions = key.subQuestions.map((k, i) => {
        const pub = publicSubs[i] || {};
        return { ...k, options: pub.options !== undefined ? pub.options : k.options };
      });
      break;
    }
    default:
      // essay / code: tidak ada kolom kunci numerik. `gradeQuestionAnswer`
      // sudah menandai keduanya `isManual` tanpa-butuh jawaban.
      break;
  }
  return subject;
}

/**
 * NILAI satu attempt secara penuh. Murni: tidak ada I/O.
 *
 * @param {object} attempt dokumen attempt
 * @param {Map<string, object|null>} keyByQuestionId kunci privat per soal
 * @returns {{score:number,maxScore:number,scorePercent:number,status:string,
 *   pendingManual:boolean,answers:Array,answersHash:string,
 *   gradedKeysMissing:string[]}}
 */
export function gradeAttemptData(attempt, keyByQuestionId) {
  const snapshot = Array.isArray(attempt && attempt.questionSnapshot) ? attempt.questionSnapshot : [];
  const indexById = new Map();
  snapshot.forEach((e) => {
    if (e && e.id) indexById.set(e.id, e);
  });

  const gradedKeysMissing = [];
  const sourceAnswers = Array.isArray(attempt && attempt.answers) ? attempt.answers : [];

  const nextAnswers = sourceAnswers.map((a) => {
    const entry = indexById.get(a && a.questionId);
    if (!entry) {
      // Jawaban tanpa entri snapshot: jangan dihapus, jangan diberi nilai.
      return { ...a, needsManualGrade: true, pointsEarned: 0, isCorrect: null };
    }
    if (entry.type === UNAVAILABLE_TYPE || entry.available === false) {
      // Soal tidak ada saat attempt dimulai: 0 poin + perlu penilaian manual.
      return { ...a, needsManualGrade: true, pointsEarned: 0, isCorrect: null };
    }
    const key = (keyByQuestionId && keyByQuestionId.get(entry.id)) || null;
    if (!key) {
      // Kunci hilang (revisi terhapus/tidak pernah dibuat). JANGAN menebak.
      gradedKeysMissing.push(entry.id);
      return { ...a, needsManualGrade: true, pointsEarned: 0, isCorrect: null };
    }

    const subject = buildGradingSubject(entry, key);
    const maxPoints = pointsOf(entry) || 10;

    // PENILAIAN TUNGGAL — implementasi yang sama dengan client.
    const result = gradeQuestionAnswer(subject, a && a.userAnswer !== undefined ? a.userAnswer : null);

    if (result.isManual) {
      const manual = validateManualScore(a && a.manualScore, maxPoints);
      const pending = manual === null;
      return {
        ...a,
        isCorrect: pending ? null : manual >= maxPoints,
        pointsEarned: pending ? 0 : manual,
        needsManualGrade: true,
        manualScore: manual
      };
    }

    // Auto-grade. `fraction` SENGAJA TIDAK ditulis (kewajiban global #18).
    return {
      ...a,
      isCorrect: result.isCorrect,
      pointsEarned: round2(result.pointsEarned),
      needsManualGrade: false
    };
  });

  const score = nextAnswers.reduce((sum, a) => {
    if (!a.needsManualGrade) return sum + (Number(a.pointsEarned) || 0);
    const n = Number(a.manualScore);
    return sum + (Number.isFinite(n) && n >= 0 ? n : 0);
  }, 0);
  const maxScore = nextAnswers.reduce((sum, a) => sum + pointsOf(indexById.get(a && a.questionId)), 0);
  const rounded = round2(score);
  const scorePercent = maxScore > 0 ? Math.round((rounded / maxScore) * 1000) / 10 : 0;
  const pendingManual = countPendingManual(nextAnswers) > 0;

  return {
    score: rounded,
    maxScore: round2(maxScore),
    scorePercent,
    passed: false, // diisi pemanggil dengan passingScorePercent kuis
    status: pendingManual ? ATTEMPT_STATUS.pendingManualGrade : ATTEMPT_STATUS.graded,
    pendingManual,
    answers: nextAnswers,
    answersHash: hashAnswers(nextAnswers),
    gradedKeysMissing
  };
}

/** Berapa soal manual yang masih menunggu nilai. */
export function countPendingManual(answers) {
  return (Array.isArray(answers) ? answers : []).filter(
    (a) => a && a.needsManualGrade && (a.manualScore === null || a.manualScore === undefined)
  ).length;
}

/** Skor final otoritatif hanya bila semua nilai manual sudah ada. */
export function isFullyAuthoritative(answers) {
  return countPendingManual(answers) === 0;
}

export { gradeQuestionAnswer, round2 };
