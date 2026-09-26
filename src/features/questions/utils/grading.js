/**
 * Helper penilaian (grading) murni & deterministik.
 * Tanpa dependensi ke React atau Firestore.
 */

export function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Menilai satu butir soal berdasarkan tipe dan kunci jawabannya.
 * @param {Object} question - Objek soal
 * @param {any} userAnswer - Jawaban yang diberikan pengguna
 * @returns {{ isCorrect: boolean|null, pointsEarned: number, isManual: boolean, details?: any }}
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
      isManual: false
    };
  }

  // 2. Pilihan Ganda Kompleks (Multiple Select)
  if (type === 'multiple') {
    if (!Array.isArray(userAnswer) || !Array.isArray(question.correctIndices)) {
      return { isCorrect: false, pointsEarned: 0, isManual: false };
    }
    const userSorted = [...userAnswer].map(Number).sort((a, b) => a - b);
    const keySorted = [...question.correctIndices].map(Number).sort((a, b) => a - b);

    const isCorrect =
      userSorted.length === keySorted.length &&
      userSorted.every((val, idx) => val === keySorted[idx]);

    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false
    };
  }

  // 3. Benar / Salah (True/False)
  if (type === 'boolean') {
    const isCorrect = typeof userAnswer === 'boolean' && userAnswer === Boolean(question.correctBoolean);
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false
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
      isManual: false
    };
  }

  // 5. Uraian / Esai (Manual Grade)
  if (type === 'essay') {
    return {
      isCorrect: null,
      pointsEarned: 0,
      isManual: true,
      status: 'pending_review'
    };
  }

  // 6. Menjodohkan (Matching)
  if (type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    if (pairs.length === 0 || typeof userAnswer !== 'object' || userAnswer === null) {
      return { isCorrect: false, pointsEarned: 0, isManual: false };
    }
    const isCorrect = pairs.every((p) => {
      const expectedRight = p.right;
      const givenRight = userAnswer[p.left];
      return givenRight !== undefined && givenRight === expectedRight;
    });
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false
    };
  }

  // 7. Mengurutkan (Ordering / Sequencing)
  if (type === 'ordering') {
    const items = Array.isArray(question.items) ? question.items : [];
    if (!Array.isArray(userAnswer) || userAnswer.length !== items.length) {
      return { isCorrect: false, pointsEarned: 0, isManual: false };
    }
    const isCorrect = items.every((item, idx) => item === userAnswer[idx]);
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false
    };
  }

  // 8. Jawaban Numerik (Numerical)
  if (type === 'numerical') {
    const val = Number(userAnswer);
    const correctVal = Number(question.correctValue);
    const tolerance = Number(question.tolerance) || 0;
    if (Number.isNaN(val) || Number.isNaN(correctVal)) {
      return { isCorrect: false, pointsEarned: 0, isManual: false };
    }
    const isCorrect = Math.abs(val - correctVal) <= tolerance;
    return {
      isCorrect,
      pointsEarned: isCorrect ? points : 0,
      isManual: false
    };
  }

  // 9. Soal Kode (Code Question - Manual Grade)
  if (type === 'code') {
    return {
      isCorrect: null,
      pointsEarned: 0,
      isManual: true,
      status: 'pending_review'
    };
  }

  // 10. Studi Kasus (Case Study)
  if (type === 'case_study') {
    const subQuestions = Array.isArray(question.subQuestions) ? question.subQuestions : [];
    if (subQuestions.length === 0) {
      return { isCorrect: true, pointsEarned: points, isManual: false };
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
      pointsEarned: Math.round(earnedSum),
      isManual: anyManual,
      details: breakdown
    };
  }

  return { isCorrect: false, pointsEarned: 0, isManual: false };
}
