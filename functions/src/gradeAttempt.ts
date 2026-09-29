/**
 * PENILAIAN OTORITATIF SIDE SERVER — bagian I/O (Assessment Security, M6/M9/M10).
 *
 * ATURAN: file ini HANYA berisi hal yang butuh Firestore. Seluruh logika
 * penilaian murni tinggal di `shared/gradeCore.js` (dipakai bersama oleh test
 * paritas), supaya tidak ada implementasi penilaian kedua.
 *
 * IDEMPOTENSI (M9)
 * ---------------
 * Trigger dipanggil ulang setiap attempt berubah dan Cloud Functions bisa
 * di-retry. Maka:
 *   - isi jawaban di-hash SHA-256 → `answersHash`. Hash sama + sudah
 *     otoritatif ⇒ tidak ada yang ditulis (retry idempoten, nol penulisan).
 *   - hash sama tapi `manualScore` berubah ⇒ skor DIHITUNG ULANG (nilai manual
 *     baru ikut terhitung), hasilnya deterministik sehingga aman ditulis ulang.
 *   - penulisan memakai `transaction`, jadi dua eksekusi paralel tidak saling
 *     menimpa dengan nilai berbeda.
 *
 * SKOR BUKAN DARI CLIENT
 * ---------------------
 * `pointsEarned`/`score` yang mungkin dikirim client diabaikan total dan
 * ditimpa. Satu-satunya masukan penilaian: `questionSnapshot` (publik),
 * kunci privat pada `keyRevision` yang tercatat, dan `answers`.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readKeysForSnapshot } from './keys.js';
import {
  ATTEMPT_STATUS,
  countPendingManual,
  gradeAttemptData,
  hashAnswers,
  isSubmitted,
  shouldSkipGrading
} from './shared/gradeCore.js';

interface AttemptLike {
  schemaVersion?: number;
  submittedAt?: unknown;
  status?: string;
  questionSnapshot?: Array<Record<string, unknown>>;
  answers?: Array<Record<string, unknown>>;
  answersHash?: string;
  isAuthoritative?: boolean;
  [k: string]: unknown;
}

/** Baca `passingScorePercent` dari dokumen kuis (default 0 = belum diatur). */
export async function readPassingScorePercent(spaceId: string, quizId: string): Promise<number> {
  const db = getFirestore();
  const snap = await db.doc(`spaces/${spaceId}/quizzes/${quizId}`).get();
  if (!snap.exists) return 0;
  const settings = (snap.data() as { settings?: { passingScorePercent?: number } }).settings;
  return Number(settings?.passingScorePercent) || 0;
}

/**
 * Terapkan hasil penilaian ke dokumen attempt, ATOMIK dan idempoten.
 * Mengembalikan `true` bila benar-benar menulis.
 */
export async function applyGradeToAttempt(
  spaceId: string,
  quizId: string,
  attemptId: string,
  result: {
    score: number;
    maxScore: number;
    scorePercent: number;
    status: string;
    pendingManual: boolean;
    answers: Array<Record<string, unknown>>;
    answersHash: string;
  },
  passingScorePercent: number
): Promise<boolean> {
  const db = getFirestore();
  const ref = db.doc(`spaces/${spaceId}/quizzes/${quizId}/attempts/${attemptId}`);
  const threshold = Number(passingScorePercent) || 0;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const current = snap.data() as AttemptLike;

    // Legacy v2 TIDAK PERNAH dinilai ulang otomatis (PART 14).
    if (Number(current.schemaVersion) !== 3) return false;

    // Idempotensi: isi jawaban tidak berubah dan skor sudah otoritatif.
    const sameContent = current.answersHash === result.answersHash;
    if (sameContent && current.isAuthoritative === true) return false;

    const score = Number(result.score) || 0;
    const maxScore = Number(result.maxScore) || 0;
    const scorePercent = Number(result.scorePercent) || 0;
    const status = result.pendingManual ? ATTEMPT_STATUS.pendingManualGrade : result.status;

    tx.update(ref, {
      answers: result.answers,
      answersHash: result.answersHash,
      score,
      maxScore,
      scorePercent,
      passed: scorePercent >= threshold,
      status,
      isAuthoritative: !result.pendingManual,
      scoreSource: 'server',
      gradedAt: FieldValue.serverTimestamp(),
      pendingManualCount: countPendingManual(result.answers)
    });
    return true;
  });
}

export interface GradeOutcome {
  written: boolean;
  skipped?: 'not-found' | 'not-submitted' | 'legacy-v2';
  result?: ReturnType<typeof gradeAttemptData>;
}

/** Alur lengkap satu attempt: baca kunci → nilai → tulis. */
export async function gradeAndPersist(
  spaceId: string,
  quizId: string,
  attemptId: string
): Promise<GradeOutcome> {
  const db = getFirestore();
  const ref = db.doc(`spaces/${spaceId}/quizzes/${quizId}/attempts/${attemptId}`);
  const snap = await ref.get();
  if (!snap.exists) return { written: false, skipped: 'not-found' };
  const attempt = snap.data() as AttemptLike;

  if (shouldSkipGrading(attempt)) return { written: false, skipped: 'not-submitted' };
  if (Number(attempt.schemaVersion) !== 3) return { written: false, skipped: 'legacy-v2' };

  const keyByQuestionId = await readKeysForSnapshot(
    spaceId,
    (attempt.questionSnapshot || []) as never
  );
  const result = gradeAttemptData(attempt, keyByQuestionId as never);
  const passing = await readPassingScorePercent(spaceId, quizId);
  const written = await applyGradeToAttempt(spaceId, quizId, attemptId, result, passing);
  return { written, result };
}

export { isSubmitted, hashAnswers };
