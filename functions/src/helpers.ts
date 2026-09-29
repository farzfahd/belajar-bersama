/**
 * TYPES Cloud Functions (Assessment Security).
 *
 * File ini HANYA berisi deklarasi tipe. Semua nilai runtime (status, builder
 * objek soal, hashing, validasi manual) di-import dari `./shared/gradeCore.js`
 * supaya tidak ada dua salinan logika di repo ini.
 */

import type { gradeAttemptData } from './shared/gradeCore.js';

/** Field kunci jawaban per tipe — cerminan `questionKeySplit.js` (client). */
export const KEY_FIELDS_BY_TYPE: Record<string, string[]> = {
  single: ['answerIndex'],
  multiple: ['correctIndices'],
  boolean: ['correctBoolean'],
  short_answer: ['acceptedAnswers'],
  essay: ['sampleAnswer'],
  matching: ['pairs'],
  ordering: ['items'],
  numerical: ['correctValue', 'tolerance'],
  code: ['expectedOutput', 'sampleSolution'],
  case_study: ['subQuestions']
};

export const ALL_KEY_FIELD_NAMES = Object.values(KEY_FIELDS_BY_TYPE).flat();

/** Tipe entri snapshot yang berarti "soal tidak ada saat attempt dimulai". */
export type UnavailableType = 'unavailable';

export interface SnapshotEntry {
  id: string;
  type: string;
  prompt?: string;
  points?: number;
  options?: string[];
  caseText?: string;
  starterCode?: string;
  subQuestions?: Array<Record<string, unknown>>;
  /** Revisi kunci yang dipakai attempt ini. WAJIB ada untuk v3. */
  keyRevision?: string | number;
  available?: boolean;
  [k: string]: unknown;
}

export interface AnswerEntry {
  questionId: string;
  userAnswer: unknown;
  isCorrect?: boolean | null;
  pointsEarned?: number;
  needsManualGrade?: boolean;
  manualScore?: number | null;
  manualFeedback?: string;
  gradedBy?: string | null;
  gradedAt?: unknown;
  [k: string]: unknown;
}

export interface AttemptDoc {
  uid?: string;
  quizId?: string;
  status?: string;
  schemaVersion?: number;
  score?: number;
  maxScore?: number;
  scorePercent?: number;
  passed?: boolean;
  isAuthoritative?: boolean;
  scoreSource?: string;
  answersHash?: string;
  pendingManualCount?: number;
  gradedAt?: unknown;
  submittedAt?: unknown;
  questionSnapshot?: SnapshotEntry[];
  answers?: AnswerEntry[];
  [k: string]: unknown;
}

export interface KeyDoc {
  keyRevision?: string | number;
  type?: string;
  answerIndex?: number;
  correctIndices?: number[];
  correctBoolean?: boolean;
  acceptedAnswers?: string[];
  sampleAnswer?: string;
  pairs?: Array<{ left: string; right: string }>;
  items?: string[];
  correctValue?: number;
  tolerance?: number;
  expectedOutput?: string;
  sampleSolution?: string;
  subQuestions?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export type GradeResult = ReturnType<typeof gradeAttemptData>;

/**
 * Daftar entri snapshot v2 yang membawa kolom kunci inline (lahan kebocoran
 * lama). Dipakai untuk log migrasi, bukan untuk membatasi: entri v2 tetap sah
 * secara historis dan tidak boleh dinilai ulang (PART 14).
 */
export function countLegacyKeyLeakingEntries(snapshot: SnapshotEntry[] | undefined): number {
  const list = Array.isArray(snapshot) ? snapshot : [];
  return list.filter((e) =>
    ALL_KEY_FIELD_NAMES.some(
      (f) => f !== 'subQuestions' && f in (e as Record<string, unknown>) && e[f] !== undefined
    )
  ).length;
}
