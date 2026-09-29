// ============================================================================
// Rencana penulisan soal: dokumen publik + dokumen kunci, satu operasi atomik.
// ============================================================================
//
// Modul ini MURNI (tanpa Firebase) sehingga seluruh keputusan bentuk dokumen
// bisa diuji dengan `node --test`. `questionService` hanya menerjemahkan hasilnya
// menjadi `writeBatch`.
//
// TIGA KEKANGAN YANG MENGATUR SELURUH ISI FILE:
//
//  1. TIDAK BOLEH ada kunci di dokumen publik. `assertNoKeyFields` dipasang di
//     jalur KELUAR sebelum hasil dikembalikan, jadi bug di pemecah di atas tidak
//     bisa lolos diam-diam. Rules juga menolak, tetapi rules menolak SETELAH
//     network call; guard di sini menolak sebelum ada yang ditulis.
//
//  2. Kunci harus TERSIMPAN bersamaan dengan dokumen publiknya. Kalau dokumen
//     publik ditulis lebih dulu tanpa kunci, ada jeda di mana soal sudah ada
//     tetapi belum punya kunci — persis kondisi "public-without-key" yang harus
//     dihindari. Maka pemanggil WAJIB mengeksekusi kedua operasi dalam satu
//     `writeBatch`; rencana ini tidak boleh dieksekusi terpisah.
//
//  3. Revisi kunci lama TIDAK PERNAH ditimpa. Setiap perubahan kunci menghasilkan
//     revisi BARU dengan nomor yang naik, karena attempt lama menunjuk nomor
//     revisi tertentu. Menimpa revisi lama berarti attempt lama diam-diam dinilai
//     dengan kunci yang sudah berubah. Rules mengunci `update: if false` untuk
//     dokumen kunci, jadi aturan ini berlaku di dua lapisan.
//
// SOAL LEGACY (kunci inline) ditangani di sini, bukan dihapus diam-diam: kunci
// yang masih tertinggal dibawa ke revisi baru, lalu field inline-nya dihapus pada
// penulisan yang sama. Tidak ada data yang hilang, dan tidak ada kunci yang
// menyala di dokumen publik bahkan setelah write selesai.

import { assertNoKeyFields, buildKeyDocument, splitQuestionData } from './questionKeySplit.js';
import { hasInlineAnswerKey, isCompleteInlineKey, legacyKeyData } from './legacyKey.js';
import { nextKeyRevisionFrom } from './keyRevision.js';

// Nama field kunci yang berlaku untuk SEMUA tipe, ditambah `pairDraft` yang
// bukan kunci tetapi juga tidak boleh tinggal di dokumen soal.
//
// Sengaja TIDAK memuat `subQuestions` sebagai nilai yang dihapus utuh: menghapus
// seluruh array akan menghilangkan sub-soal publik yang justru harus tetap ada.
// Sub-soal publik ditulis ulang utuh oleh `splitQuestionData`, dan kunci di
// dalamnya hilang karena splitter tidak pernah menyalin field kunci ke sisi publik.
const INLINE_KEY_FIELDS = [
  'answerIndex',
  'correctIndices',
  'correctBoolean',
  'acceptedAnswers',
  'sampleAnswer',
  'pairs',
  'items',
  'correctValue',
  'tolerance',
  'expectedOutput',
  'sampleSolution'
];

const EDITOR_ONLY_FIELDS = ['pairDraft'];

/** Patch yang menghapus seluruh field kunci yang mungkin tertinggal. */
function inlineKeyDeletions() {
  const out = {};
  for (const f of INLINE_KEY_FIELDS) out[f] = null;
  for (const f of EDITOR_ONLY_FIELDS) out[f] = null;
  return out;
}

/**
 * Field kunci yang benar-benar masih ada pada dokumen soal yang dibaca.
 *
 * Dipakai untuk laporan migrasi (dan tes): kalau `hasInlineAnswerKey` benar
 * tetapi daftar ini kosong, ada ketidakcocokan antara detektor dan dokumen, dan
 * pemanggil perlu tahu daripada diam-diam menganggap migrasi berhasil.
 */
export function presentInlineKeyFields(question) {
  return INLINE_KEY_FIELDS.filter((f) => question && f in question && question[f] !== undefined);
}

/**
 * Data kunci yang akan ditulis untuk satu operasi.
 *
 * Urutan sumber, dari paling dipercaya:
 *   1. `data.key` dari form editor — kunci yang baru saja diketik author
 *   2. kunci legacy inline pada dokumen yang ada — kalau form tidak mengirim
 *      kunci, misalnya karena author hanya mengubah metadata
 *
 * Kunci LAMA yang tersimpan di key doc sengaja tidak ikut. Setiap edit membuat
 * revisi baru, dan isi revisi baru adalah kunci HASIL EDIT, bukan kunci lama
 * yang belum disentuh. Kalau author tidak menyentuh kunci pun, editor tetap
 * mengirim kunci yang termuat di form, jadi tidak terjadi revisi kosong.
 */
function resolveKeyInput(data, existingQuestion) {
  if (data.key && typeof data.key === 'object') return data.key;
  if (existingQuestion && hasInlineAnswerKey(existingQuestion)) {
    const legacy = legacyKeyData(existingQuestion);
    if (legacy) return legacy;
  }
  return null;
}

/**
 * Nomor revisi kunci berikutnya.
 *
 * Soal tanpa `keyRevision` (legacy yang belum pernah disentuh) memulai dari '1',
 * bukan '2'. `nextKeyRevisionFrom(null)` mengembalikan '1' karena input tidak
 * valid, dan itu justru hasil yang benar di sini.
 */
export function nextRevisionFor(existingQuestion, explicitNext) {
  if (explicitNext != null) return String(explicitNext);
  return nextKeyRevisionFrom(existingQuestion?.keyRevision ?? null);
}

/**
 * Rencana write untuk MEMBUAT soal baru.
 *
 * `splitQuestionData` membangun sisi publik dari `pairs`/`items` (kolam kandidat
 * dan himpunan item yang diacak deterministik) — bukan menyalin apa adanya.
 * Itulah yang membuat dokumen publik tidak pernah memuat pasangan benar maupun
 * urutan benar.
 *
 * @param {object} params
 * @param {string} params.questionId id soal yang sudah dialokasikan pemanggil
 * @param {string} params.type tipe soal
 * @param {object} params.data data dari form (sudah divalidasi)
 * @param {string} [params.keyRevision] nomor revisi, default '1'
 * @returns {{publicDoc: object, keyDoc: object, keyRevision: string}}
 */
export function planCreateQuestion({ questionId, type, data, keyRevision = '1' }) {
  const revision = String(keyRevision);
  const { public: splitPublic, key: splitKey } = splitQuestionData(type, data, questionId);

  assertNoKeyFields(splitPublic, 'Dokumen soal publik');

  const keySource = data.key && typeof data.key === 'object' ? data.key : splitKey;
  const keyDoc = buildKeyDocument(type, keySource, { keyRevision: revision, createdAt: null });

  return { publicDoc: splitPublic, keyDoc, keyRevision: revision };
}

/**
 * Rencana write untuk MENGUBAH soal yang sudah ada.
 *
 * `existingQuestion` dipakai untuk dua hal yang tidak bisa ditebak dari form:
 * membawa kunci legacy inline yang belum termigrasi, dan menomori revisi baru.
 *
 * @returns {{
 *   publicPatch: object,
 *   keyDoc: object,
 *   keyRevision: string,
 *   removedInlineKey: string[]
 * }}
 */
export function planUpdateQuestion({
  type,
  data,
  existingQuestion = null,
  nextKeyRevision = null
}) {
  const revision = nextRevisionFor(existingQuestion, nextKeyRevision);
  const questionId = existingQuestion?.id || '';

  const { public: splitPublic, key: splitKey } = splitQuestionData(type, data, questionId);

  // Hapus setiap field kunci yang mungkin masih tertinggal di dokumen publik.
  // Tanpa ini edit soal legacy ditolak rules (`hasNoInlineKeyFields`), dan yang
  // lebih buruk, kunci lama tetap menyala di dokumen publik sepanjang proses.
  const publicPatch = { ...splitPublic, ...inlineKeyDeletions() };
  assertNoKeyFields(publicPatch, 'Patch dokumen soal publik');

  const keyInput = resolveKeyInput(data, existingQuestion);
  const hasInput = keyInput && Object.keys(keyInput).length > 0;
  const keyDoc = buildKeyDocument(type, hasInput ? keyInput : splitKey, {
    keyRevision: revision,
    createdAt: null
  });

  const removedInlineKey = presentInlineKeyFields(existingQuestion);

  return { publicPatch, keyDoc, keyRevision: revision, removedInlineKey };
}

/**
 * Apakah kunci legacy pada soal ini perlu DIBAWA ke revisi baru?
 *
 * Dipakai UI untuk memberi tahu author bahwa kunci soal ini dipindahkan ke
 * dokumen terpisah, sehingga perubahan tidak terjadi tanpa penjelasan.
 */
export function carriesLegacyKey(existingQuestion) {
  return (
    Boolean(existingQuestion) &&
    hasInlineAnswerKey(existingQuestion) &&
    isCompleteInlineKey(existingQuestion)
  );
}
