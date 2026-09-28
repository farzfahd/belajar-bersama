// Ekstensi `.js` pada import WAJIB: modul ini diuji langsung oleh `node --test`,
// dan resolver ESM Node tidak menebak ekstensi (Vite menebak).
import {
  QUESTION_REPORT_LIMITS,
  QUESTION_REPORT_TYPES
} from '../../../lib/constants.js';

/**
 * Membersihkan & memvalidasi isi report soal. Murni (tanpa Firestore) supaya
 * bisa diuji unit; `questionService.reportQuestion` memakainya sebelum write,
 * dan rules memvalidasinya ulang di server.
 *
 * Enumerasi `type` sengaja memakai daftar yang sama dengan rules
 * (`request.resource.data.type in [...]`), bukan `Object.keys` bebas, supaya
 * penambahan tipe baru tidak diam-diam lolos di client tapi ditolak server.
 */
export const REPORT_TYPE_VALUES = Object.freeze(Object.values(QUESTION_REPORT_TYPES));

export function normalizeQuestionReport(type, message) {
  if (!REPORT_TYPE_VALUES.includes(type)) {
    throw new Error('Jenis report tidak valid.');
  }
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) throw new Error('Isi report wajib diisi.');
  if (cleanMessage.length > QUESTION_REPORT_LIMITS.maxMessage) {
    throw new Error(`Report maksimal ${QUESTION_REPORT_LIMITS.maxMessage} karakter.`);
  }
  return { type, message: cleanMessage };
}
