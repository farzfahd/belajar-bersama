/**
 * Helper penilaian (grading) murni & deterministik.
 * Tanpa dependensi ke React atau Firestore.
 *
 * KONTRAK (audit fase 2, 2026-09-28): setiap hasil memuat
 * `{ isCorrect, pointsEarned, isManual, fraction }`.
 * - `fraction` = fraksi nilai F ∈ [0,1] berdasar jawaban pengguna.
 * - `pointsEarned` = round2(maxPoints × fraction) untuk tipe otomatis.
 * - Tipe manual (`essay`, `code`) memakai `isManual: true`, `isCorrect: null`,
 *   `fraction: 0`, dan `pointsEarned: 0` (menunggu penilai).
 */

// Koefisien penalti PGK (hasil riset 2026-09-28, γ = 0.75 — lihat
// docs/PROGRESS.md entry "Grading PGK γ=0.75" dan artefak riset).
export const PGK_GAMMA = 0.75;

/** Pembulatan presisi 2 desimal (satu-satunya pembulatan poin). */
export function round2(value) {
  return Math.round(value * 100) / 100;
}

/** Klip ke [0,1]. */
export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalisasi pilihan PGK: array indeks → subset unik yang valid.
 * Duplikat & indeks di luar rentang dibuang (C7: duplikat tidak menambah poin).
 */
export function sanitizeSelection(value, range) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const v of value) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= range || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** Apakah jawaban bernilai F = 1 (sempurna). */
function perfect(points, fraction) {
  return { isCorrect: fraction === 1, pointsEarned: round2(points * fraction), isManual: false, fraction };
}

/**
 * Menilai satu butir soal berdasarkan tipe dan kunci jawabannya.
 * @param {Object} question - Objek soal
 * @param {any} userAnswer - Jawaban yang diberikan pengguna
 * @returns {{ isCorrect: boolean|null, pointsEarned: number, isManual: boolean, fraction: number, details?: any }}
 */
export function gradeQuestionAnswer(question, userAnswer) {
  const points = Number(question.points) || 10;
  const type = question.type || 'single';

  // 1. Pilihan Ganda (Single Choice)
  if (type === 'single') {
    const isCorrect = typeof userAnswer === 'number' && userAnswer === question.answerIndex;
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false,
      fraction: isCorrect ? 1 : 0
    };
  }

  // 2. Pilihan Ganda Kunci (PGK / multiple select) — kredit parsial γ=0.75.
  //    F = clamp01((c/K) × (1 − γ·w/(N−K))), dengan N = jumlah opsi, K = jumlah
  //    kunci benar, c = benar dipilih, w = salah dipilih.
  if (type === 'multiple') {
    const N = Array.isArray(question.options) ? question.options.length : 0;
    const key = sanitizeSelection(question.correctIndices, N);
    const K = key.length;
    if (N === 0 || K === 0 || !Array.isArray(userAnswer)) {
      return { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 };
    }
    const sel = sanitizeSelection(userAnswer, N);
    const keySet = new Set(key);
    let c = 0;
    let w = 0;
    for (const idx of sel) {
      if (keySet.has(idx)) c += 1;
      else w += 1;
    }
    // Degenerate K == N (SEMUA opsi benar): tidak ada distraktor, w selalu 0,
    // maka faktor penalti = 1 (hindari pembagian N−K = 0).
    const penalty = N - K > 0 ? 1 - (PGK_GAMMA * w) / (N - K) : 1;
    const fraction = clamp01((c / K) * penalty);
    return perfect(points, fraction);
  }

  // 3. Benar / Salah (True/False)
  if (type === 'boolean') {
    const isCorrect = typeof userAnswer === 'boolean' && userAnswer === Boolean(question.correctBoolean);
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false,
      fraction: isCorrect ? 1 : 0
    };
  }

  // 4. Isian Singkat (Short Answer)
  if (type === 'short_answer') {
    const normUser = normalizeString(String(userAnswer || ''));
    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    const isCorrect = normUser.length > 0 && accepted.some((ans) => normalizeString(ans) === normUser);
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false,
      fraction: isCorrect ? 1 : 0
    };
  }

  // 5. Uraian / Esai (Manual Grade)
  if (type === 'essay') {
    return {
      isCorrect: null,
      pointsEarned: 0,
      isManual: true,
      fraction: 0,
      status: 'pending_review'
    };
  }

  // 6. Menjodohkan (Matching) — kredit parsial: fraksi = pasangan benar / total.
  if (type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    if (pairs.length === 0 || typeof userAnswer !== 'object' || userAnswer === null) {
      return { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 };
    }
    const matched = pairs.filter((p) => userAnswer[p.left] === p.right).length;
    const fraction = matched / pairs.length;
    return perfect(points, fraction);
  }

  // 7. Mengurutkan (Ordering / Sequencing) — kredit parsial: posisi benar / total.
  if (type === 'ordering') {
    const items = Array.isArray(question.items) ? question.items : [];
    if (!Array.isArray(userAnswer) || userAnswer.length !== items.length) {
      return { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 };
    }
    if (items.length === 0) {
      return { isCorrect: true, pointsEarned: points, isManual: false, fraction: 1 };
    }
    const correct = items.filter((item, idx) => item === userAnswer[idx]).length;
    const fraction = correct / items.length;
    return perfect(points, fraction);
  }

  // 8. Jawaban Numerik (Numerical)
  if (type === 'numerical') {
    const val = Number(userAnswer);
    const correctVal = Number(question.correctValue);
    const tolerance = Number(question.tolerance) || 0;
    if (Number.isNaN(val) || Number.isNaN(correctVal)) {
      return { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 };
    }
    const isCorrect = Math.abs(val - correctVal) <= tolerance;
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false,
      fraction: isCorrect ? 1 : 0
    };
  }

  // 9. Soal Kode (Code Question - Manual Grade)
  if (type === 'code') {
    return {
      isCorrect: null,
      pointsEarned: 0,
      isManual: true,
      fraction: 0,
      status: 'pending_review'
    };
  }

  // 10. Studi Kasus (Case Study)
  if (type === 'case_study') {
    const subQuestions = Array.isArray(question.subQuestions) ? question.subQuestions : [];
    if (subQuestions.length === 0) {
      return { isCorrect: true, pointsEarned: points, isManual: false, fraction: 1 };
    }
    const subAnswers = typeof userAnswer === 'object' && userAnswer !== null ? userAnswer : {};
    let earnedSum = 0;
    let anyManual = false;
    let allCorrect = true;
    const subPoints = points / subQuestions.length;

    const breakdown = subQuestions.map((subQ, idx) => {
      const subAns = subAnswers[idx];
      const res = gradeQuestionAnswer({ ...subQ, points: subPoints }, subAns);
      if (res.isManual) anyManual = true;
      if (!res.isCorrect) allCorrect = false;
      earnedSum += res.pointsEarned;
      return { subIndex: idx, ...res };
    });

    return {
      isCorrect: anyManual ? null : allCorrect,
      pointsEarned: round2(earnedSum),
      isManual: anyManual,
      fraction: points > 0 ? clamp01(earnedSum / points) : 0,
      details: breakdown
    };
  }

  return { isCorrect: false, pointsEarned: 0, isManual: false, fraction: 0 };
}