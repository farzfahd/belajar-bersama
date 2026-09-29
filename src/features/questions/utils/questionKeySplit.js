// ============================================================================
// Pemisahan data soal PUBLIK vs KUNCI JAWABAN (Assessment Security, M1).
// ============================================================================
//
// SEBELUM M1: satu dokumen `questions/{qid}` memuat prompt DAN kunci jawaban.
// Rules tidak bisa menyembunyikan field di dalam satu dokumen, jadi selama kunci
// di sana, SIAPAPUN yang boleh read dokumen itu juga boleh baca kunci.
//
// SESUDAH M1: dua dokumen terpisah.
//   - `questions/{qid}`            → data publik (prompt, opsi, poin, meta).
//                                   TIDAK memuat field kunci sama sekali.
//   - `questions/{qid}/key/{rev}`  → kunci jawaban, private, HANYA boleh dibaca
//                                   oleh `createdBy` soal (policy P2).
//
// MASALAH YANG HARUS DISELESAIKAN DI SINI: MATCHING & ORDERING
// ------------------------------------------------------
// Dua tipe ini tidak bisa "dibelah" dengan memindah field-nya apa adanya,
// karena field itu sekaligus berisi konten soal DAN kunci:
//
//   - `matching`: `pairs: [{left, right}]`. Peserta harus melihat `left` dan
//     harus melihat sekumpulan `right` untuk dicocokkan. Tapi PASANGAN-nya
//     adalah kunci. Kalau `pairs` seluruhnya dipindah ke dokumen kunci,
//     peserta tidak punya apa pun untuk dicocokkan.
//   - `ordering`: `items: ['a','b','c']`. Urutannya adalah kunci, tapi
//     HIMPUNAN item-nya adalah konten soal. Kalau `items` seluruhnya dipindah
//     ke dokumen kunci, peserta tidak punya apa pun untuk diurutkan.
//
// SOLUSI: pisahkan HIMPUNAN (publik) dari PASANGAN/URUTAN (privat).
//   - `matching` publik : `matchLeft[]`, `matchRight[]` (kolam kandidat)
//     `matching` kunci  : `pairs[]` (pemetaan left → right)
//   - `ordering` publik : `orderItems[]` (himpunan item, diacak deterministik)
//     `ordering` kunci  : `items[]` (urutan benar)
//
// Keduanya memakai alat pengacak yang sudah ada di repo (`shuffleWithSeed` +
// `seedFromText`) supaya urutan publiknya TIDAK sama dengan kunci, dan supaya
// dua client melihat urutan yang sama.
//
// KONSEKUEN YANG TIDAK BISA DIHINDARI: memindahkan kunci ke dokumen terpisah
// hanya berhasil kalau tidak ada jalur lain yang menuliskannya ke dokumen yang
// bisa dibaca peserta. Jalur itu adalah `questionSnapshot` pada attempt —
// ditutup di M4 (snapshot v3) + M6 (server grading). Sampai keduanya siap,
// kunci masih bocor lewat attempt. Fungsi-fungsi di file ini hanya menangani
// sisi Question Bank.
//
// ATURAN YANG DIPERTAHANKAN (tidak diubah di M1):
//   - `pairDraft` tetap editor-only: tidak pernah masuk dokumen publik, dan
//     tidak pernah masuk key (draft bukan kunci).
//   - Validasi yang sudah ada (matching uniqueness, PGK K<N, min 2 item, dll.)
//     tetap dijalankan terhadap data yang akan ditulis.
//
// Modul ini MURNI: tidak menyentuh Firebase, tidak Effects. Semua fungsi bisa
// diuji dengan `node --test`.

import { seedFromText, shuffleWithSeed } from './matchingPairs.js';

// Field kunci per tipe. Ini daftar tunggal yang dipakai untuk memisahkan
// dokumen publik dari dokumen kunci, DAN untuk mendeteksi kebocoran (guard).
//
// PENTING: `starterCode` TIDAK ada di sini. `starterCode` adalah kode AWAL yang
// memang harus dilihat peserta (dia mengeditnya), jadi ia bagian data publik.
// Yang private dari tipe `code` adalah `expectedOutput` + `sampleSolution`.
const KEY_FIELDS_BY_TYPE = {
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

/**
 * Field publik KONTEN soal yang boleh ikut di `questionSnapshot` attempt v3.
 *
 * `explanation` SENGAJA TIDAK termasuk, terutama karena penjelasan sering
 * membocorkan kunci ("pilih yang berlawanan dengan petunjuk di soal"), dan
 * participant tidak boleh menerimanya sebelum attempt selesai. Penjelasan
 * dikirim lewat jalur terpisah setelah attempt terminal (lihat M4/UI).
 */
export const SNAPSHOT_V3_PUBLIC_FIELDS = [
  'type',
  'prompt',
  'points',
  'options',
  'caseText',
  'starterCode',
  'matchLeft',
  'matchRight',
  'orderItems',
  'subQuestions'
];

/**
 * Semua nama field kunci yang mungkin muncul di mana saja dalam satu soal,
 * termasuk di dalam `subQuestions` (yang tidak bisa dihitung dari
 * `KEY_FIELDS_BY_TYPE` saja karena isinya varying).
 *
 * Dipakai untuk:
 *   - `assertNoKeyFields()` — menolak snapshot/public doc yang membawa kunci.
 *   - `presentKeyFields()` — untuk laporan migrasi.
 */
export const ALL_KEY_FIELD_NAMES = [
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
  'sampleSolution',
  'subQuestions'
];

/** Key fields yang relevan untuk satu tipe soal. */
export function keyFieldsForType(type) {
  return KEY_FIELDS_BY_TYPE[type] ? [...KEY_FIELDS_BY_TYPE[type]] : [];
}

/** Tipe yang memakai sub-soal. */
function isCaseStudy(type) {
  return type === 'case_study';
}

/**
 * Kolam kandidat untuk `matching`, diacak deterministik per soal.
 *
 * Kolam kandidat harus memuat semua `left` dan semua `right` yang muncul di
 * pasangan, tanpa menunjukkan pasangan mana yang benar. Kandidat yang tidak
 * punya pasangan tetap boleh ikut sebagai pengecoh — itulah gunanya.
 */
export function buildMatchingPools(pairs, questionId = '') {
  const list = Array.isArray(pairs) ? pairs : [];
  const left = [];
  const right = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    if (p.left !== undefined && !left.includes(p.left)) left.push(p.left);
    if (p.right !== undefined && !right.includes(p.right)) right.push(p.right);
  }
  return {
    matchLeft: shuffleWithSeed(left, seedFromText(`${questionId}:left`)),
    matchRight: shuffleWithSeed(right, seedFromText(`${questionId}:right`))
  };
}

/**
 * Himpunan item untuk `ordering`, diacak deterministik per soal.
 *
 * Isinya himpunan yang sama dengan kunci, TAPI urutannya diacak supaya
 * urutan pada dokumen publik tidak pernah sama dengan urutan benar. Klien
 * mengacak lagi saat render (lihat `orderingAnswer.js`), jadi urutan publik
 * hanya perlu "tidak membocorkan", tidak perlu final.
 */
export function buildOrderingItemsPublic(items, questionId = '') {
  const clean = (Array.isArray(items) ? items : [])
    .map((it) => String(it ?? '').trim())
    .filter(Boolean);
  return shuffleWithSeed(clean, seedFromText(`${questionId}:order`));
}

/**
 * Pisahkan data soal menjadi bagian publik dan bagian kunci.
 *
 * Mengembalikan `{ public, key }`. `public` SELALU punya `type`; `key` punya
 * `type` + field kunci milik tipe itu (bisa kosong kalau tipe tidak punya
 * kunci).
 *
 * Field yang tidak dikenal (foreign field) TIDAK ikut ke bagian mana pun —
 * pemanggil yang memutuskan. Ini mencegah data asing tersesat ke dokumen publik.
 *
 * @param {string} type tipe soal
 * @param {object} data data soal apa adanya (bisa masih memegang kunci)
 * @param {string} questionId dipakai sebagai seed pengacakan (opsional)
 */
export function splitQuestionData(type, data = {}, questionId = '') {
  // Default parameter hanya berlaku untuk `undefined`. Data dari Firestore bisa
  // `null` (field hilang), jadi dinormalisasi eksplisit di sini.
  const src = data && typeof data === 'object' ? data : {};
  const publicFields = {};
  const keyFields = {};

  // `type` SELALU ikut ke bagian publik: tanpa itu dokumen publik tidak bisa
  // dirender dan pemanggil tidak tahu harus menampilkan kolom apa. Ini juga
  // yang dipakai `buildSnapshotV3Entry` untuk memilih material publik.
  publicFields.type = type;

  // Data yang selalu publik, apa pun tipenya.
  for (const f of [
    'prompt',
    'topicId',
    'difficulty',
    'visibility',
    'tags',
    'points',
    'timeLimitSeconds',
    'attachmentUrl',
    'relatedNoteId',
    'relatedResourceId',
    'commentCount',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'schemaVersion',
    'createdBy'
  ]) {
    if (f in src) publicFields[f] = src[f];
  }

  if (type === 'single' || type === 'multiple') {
    if ('options' in src) publicFields.options = src.options;
  } else if (type === 'code') {
    // `starterCode` dilihat peserta saat menjawab → publik.
    if ('starterCode' in src) publicFields.starterCode = src.starterCode;
  } else if (type === 'matching') {
    // Kolam kandidat publik DIBANGUN dari `pairs`, bukan disalin apa adanya.
    const pools = buildMatchingPools(src.pairs, questionId);
    if (pools.matchLeft.length) publicFields.matchLeft = pools.matchLeft;
    if (pools.matchRight.length) publicFields.matchRight = pools.matchRight;
  } else if (type === 'ordering') {
    // Himpunan item publik DIBANGUN dari `items`, lalu diacak.
    const publicItems = buildOrderingItemsPublic(src.items, questionId);
    if (publicItems.length) publicFields.orderItems = publicItems;
  } else if (isCaseStudy(type)) {
    if ('caseText' in src) publicFields.caseText = src.caseText;
    // Sub-soal dipisah satu per satu: bagian publiknya ikut ke dokumen publik,
    // bagian kuncinya ikut ke dokumen kunci. Ini yang membuat studi kasus
    // tidak bocor tanpa membuat sub-soal-nya hilang dari tampilan.
    if (Array.isArray(src.subQuestions)) {
      const publicSubs = [];
      const keySubs = [];
      src.subQuestions.forEach((sub, i) => {
        const subType = sub?.type;
        const { public: subPublic, key: subKey } = splitQuestionData(
          subType,
          sub,
          `${questionId}:sub${i}`
        );
        publicSubs.push({ ...subPublic, type: subType });
        keySubs.push({ ...subKey, type: subType });
      });
      if (publicSubs.length) publicFields.subQuestions = publicSubs;
      if (keySubs.length) keyFields.subQuestions = keySubs;
    }
  }

  // Kunci langsung (bukan lewat case_study, sudah di atas).
  for (const f of keyFieldsForType(type)) {
    if (isCaseStudy(type)) continue; // sudah ditangani
    if (f in src) keyFields[f] = src[f];
  }

  return { public: publicFields, key: keyFields };
}

/**
 * Bangun dokumen kunci dari data soal yang sudah dinormalisasi.
 *
 * `keyRevision` ditulis sebagai string supaya urutannya stabil dan bisa
 * dibandingkan secara leksikografis pada dasarnya. Revisi LAMA tidak pernah
 * ditimpa: pemanggil membuat dokumen baru dengan revisi baru (lihat
 * `questionKeyService`).
 */
export function buildKeyDocument(type, keyData, { keyRevision = '1', createdAt = null } = {}) {
  const fields = {};
  for (const f of keyFieldsForType(type)) {
    if (f in keyData) fields[f] = keyData[f];
  }
  return {
    keyRevision: String(keyRevision),
    type,
    ...fields,
    schemaVersion: 1,
    createdAt
  };
}

/**
 * Daftar field kunci yang ADA di sebuah objek (untuk laporan / guard).
 *
 * Menghitung rekursif di dalam `subQuestions`. Nama `subQuestions` sendiri TIDAK
 * dilaporkan sebagai kebocoran: dokumen publik studi kasus memang boleh —
 * bahkan harus — punya `subQuestions` publik. Yang dilaporkan adalah field kunci
 * di dalam sub-soalnya, tepat seperti yang dicari guard ini.
 */
export function presentKeyFields(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const found = ALL_KEY_FIELD_NAMES.filter(
    // `null` diperlakukan sama dengan "tidak ada". Firestore memakai `null` untuk
    // MENGHAPUS field, jadi `answerIndex: null` pada patch berarti field itu
    // hilang dari dokumen, bukan kunci yang ikut tersimpan. Tanpa pengecualian
    // ini, patch penghapusan kunci selalu terbaca sebagai kebocoran dan
    // `assertNoKeyFields` menolak justru hal yang paling ingin dilakukan.
    (f) => f !== 'subQuestions' && f in obj && obj[f] !== undefined && obj[f] !== null
  );
  if (Array.isArray(obj.subQuestions)) {
    for (const sub of obj.subQuestions) {
      for (const f of presentKeyFields(sub)) {
        if (!found.includes(f)) found.push(f);
      }
    }
  }
  return found;
}

/**
 * Melempar Error bila objek (public doc / snapshot) membawa field kunci.
 *
 * Ini guard sisi client untuk mendeteksi kebocoran lebih awal. Rules tetap
 * lapisan wajib — guard client bisa dilewati Konsol, rules tidak.
 */
export function assertNoKeyFields(obj, label = 'dokumen') {
  const found = presentKeyFields(obj);
  if (found.length > 0) {
    throw new Error(
      `${label} tidak boleh memuat field kunci jawaban: ${found.join(', ')}`
    );
  }
  return obj;
}

/**
 * Daftar field kunci yang ada di dalam `subQuestions` (nested, satu tingkat).
 * Dipakai saat memverifikasi backfill agar key studi kasus ikut termigrasi.
 */
export function subQuestionKeyFields(subQuestions) {
  const found = new Set();
  for (const sub of Array.isArray(subQuestions) ? subQuestions : []) {
    for (const f of keyFieldsForType(sub?.type)) {
      if (f in (sub || {})) found.add(f);
    }
  }
  return [...found];
}
