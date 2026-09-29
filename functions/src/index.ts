/**
 * Entry point Cloud Functions — Belajar Bersama (Assessment Security).
 *
 * YANG DI-EXPORT HANYA SATU: trigger penilaian attempt.
 *
 * KENAPA trigger, bukan callable? (PART 9)
 * ---------------------------------------
 * Attempt bisa berubah dari dua arah: peserta mengirim jawaban, atau penilai
 * mengisi `manualScore`. Keduanya harus memicu penilaian ulang. Dengan trigger
 * `onDocumentWritten` kita tidak perlu mengingat siapa yang memanggil, sehingga
 * tidak ada jalur yang bisa "lupa" untuk dinilai. Callable tambahan hanya
 *Authorize() — tidak ada endpoint yang menulis skor.
 *
 * KEAMANAN
 * --------
 * - Firestore Rules tetap lapisan OTORISASI untuk client. Fungsi ini memakai
 *   Admin SDK yang memang melewati rules; itu disengaja dan diterima karena
 *   tidak ada input dari client yang dipakai untuk menentukan skor.
 * - Skor dihitung dari kunci server + jawaban, BUKAN dari nilai yang dikirim
 *   client. `answers` hanya dibaca; `pointsEarned` yang dikirim client diabaikan
 *   dan ditimpa.
 * - App Check TIDAK dipakai sebagai otorisasi. Identitas tetap Firebase Auth +
 *   Firestore Rules; trigger ini tidak memverifikasi identitas pemanggil karena
 *   dipicu oleh perubahan dokumen, bukan oleh permintaan HTTP.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { gradeAndPersist } from './gradeAttempt.js';

// Region Jakarta agar dekat dengan user Indonesia dan menurunkan latensi.
setGlobalOptions({ region: 'asia-southeast2', maxInstances: 4 });

/**
 * Menilai attempt yang sudah dikirim peserta.
 *
 * Trigger dipasang pada path attempt (`onDocumentWritten` v2). Filter
 * `document.ancestor` tidak didukung pada v2, dan filter
 * `document.field` pun tidak ada untuk `onDocumentWritten`, jadi perubahan
 * dinilai di dalam body: hanya diproses bila status/`submittedAt`/`answers`
 * benar-benar berubah. Itu mencegah penilaian berulang untuk perubahan yang
 * tidak relevan (mis. `lastSeenAt`).
 */
export const onAttemptWritten = onDocumentWritten(
  {
    document: 'spaces/{spaceId}/quizzes/{quizId}/attempts/{attemptId}',
    retry: false
  },
  async (event) => {
    const { spaceId, quizId, attemptId } = event.params;
    const after = event.data?.after;
    if (!after?.exists) {
      // Attempt dihapus — attempt tidak boleh dihapus di rules, tapi bila
      // terjadi, tidak ada yang boleh dinilai.
      return;
    }
    // Hanya proses perubahan yang relevan: jawaban berubah, status masuk
    // pending, atau submittedAt baru terisi. Menilai pada setiap perubahan
    // timestamp lain akan boros tanpa guna.
    const before = event.data?.before?.data?.() as Record<string, unknown> | undefined;
    const afterData = after.data() as Record<string, unknown>;
    const relevant =
      !before ||
      String(before.status ?? '') !== String(afterData.status ?? '') ||
      before.submittedAt !== afterData.submittedAt ||
      JSON.stringify(before.answers ?? null) !== JSON.stringify(afterData.answers ?? null);
    if (!relevant) return;

    try {
      const { written, result } = await gradeAndPersist(spaceId, quizId, attemptId);
      if (written && result) {
        logger.info('attempt graded', {
          spaceId,
          quizId,
          attemptId,
          score: result.score,
          maxScore: result.maxScore,
          scorePercent: result.scorePercent,
          status: result.status,
          pendingManual: result.pendingManual,
          keysMissing: result.gradedKeysMissing.length
        });
        if (result.gradedKeysMissing.length > 0) {
          // Kehilangan kunci adalah kondisi yang harus terlihat, bukan diam.
          logger.warn('answer key missing for questions', {
            spaceId,
            quizId,
            attemptId,
            questionIds: result.gradedKeysMissing
          });
        }
      }
    } catch (err) {
      // Jangan menelan error: Cloud Functions akan mencatatnya, dan attempt
      // tetap `pending_grading` sehingga tidak pernah terlihat utuh.
      logger.error('grade attempt failed', { spaceId, quizId, attemptId, err });
      throw err;
    }
  }
);
