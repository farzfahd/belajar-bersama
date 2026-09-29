// ============================================================================
// Snapshot attempt VERSI 3 — participant-safe, TANPA answer key (M4/PART 4).
// ============================================================================
//
// MASALAH YANG DISELESAIKAN
// -------------------------
// `ATTEMPT_SCHEMA_VERSION` 2 menyalin isi soal LENGKAP ke `questionSnapshot`,
// termasuk field kunci. Dokumen attempt dibaca pemiliknya sendiri, dan pemilik
// attempt adalah PESERTA. Jadi selama snapshot v2 ada, participant menerima
// kunci jawaban apa pun yang dilakukan Question Bank.
//
// Versi 3 hanya menyalin field yang benar-benar dibutuhkan untuk MENJAWAB:
// prompt, tipe, poin, opsi, dan (untuk studi kasus) teks kasus + sub-soal versi
// publik. Tidak ada satu pun field kunci.
//
// YANG SENGAJA TIDAK DISALIN
//   - Semua field kunci (`answerIndex`, `correctIndices`, `correctBoolean`,
//     `acceptedAnswers`, `sampleAnswer`, `pairs`, `items`, `correctValue`,
//     `tolerance`, `expectedOutput`, `sampleSolution`, `subQuestions` versi
//     berkey).
//   - `pairDraft` (editor-only; bukan data soal).
//   - `explanation`: penjelasan sering membocorkan kunci ("pilih yang berlawanan
//     dengan..."), jadi tidak dikirim ke peserta sebelum attempt selesai.
//
// BACKWARD COMPATIBILITY
// Entri v2 (yang sudah punya kunci di dalamnya) TETAP bisa dirender oleh
// `isLegacySnapshotEntry`. Fungsi ini tidak pernah MEMBUAT v2 lagi.
//
// Modul ini murni dan diuji dengan `node --test`.

import { ALL_KEY_FIELD_NAMES, keyFieldsForType } from '../../questions/utils/questionKeySplit.js';

/** Field publik yang boleh disalin ke snapshot v3. */
const V3_COMMON = ['type', 'prompt', 'points'];

/**
 * Angka revisi yang dipakai untuk entri `unavailable`.
 *
 * Rules mewajibkan `keyRevision` di setiap entri, termasuk entri soal yang
 * hilang. Entri `unavailable` tidak pernah dinilai otomatis (selalu 0 poin +
 * manual), jadi angka ini hanya formalitas agar dokumen tetap valid — bukan
 * rujukan ke dokumen kunci sungguhan.
 */
export const UNAVAILABLE_KEY_REVISION = 1;

/**
 * Nama field kunci yang TIDAK mungkin muncul di entri v3 dalam bentuk apa pun.
 *
 * `subQuestions` sengaja TIDAK ada di sini: untuk studi kasus, `subQuestions`
 * versi publik itu sah (isi sub-soal tanpa kunci). Yang tidak boleh bocor
 * adalah field kunci DI DALAM subQuestions — dicek oleh
 * `assertSubQuestionsHaveNoKeys`, bukan lewat nama fieldnya.
 */
const V3_FORBIDDEN_KEY_FIELDS = ALL_KEY_FIELD_NAMES.filter((f) => f !== 'subQuestions');

/**
 * Sub-soal studi kasus versi publik: pertahankan yang dibutuhkan untuk menjawab
 * (teks pertanyaan, tipe, opsi, kolam kandidat, himpunan item) dan buang
 * seluruh field kunci.
 *
 * `prompt` ikut disalin karena tanpa itu sub-soal tampil sebagai kotak kosong
 * yang tidak bisa dijawab. Yang dibuang tetap field kuncinya (`answerIndex`,
 * `correctBoolean`, `pairs`, `items`, ...) — `prompt` bukan kunci, dan
 * `subQuestionsKeyFree` di rules hanya melarang nama field kunci.
 */
function publicSubQuestion(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const out = { type: sub.type };
  if (typeof sub.prompt === 'string' && sub.prompt) out.prompt = sub.prompt;
  if (Array.isArray(sub.options)) out.options = sub.options;
  if (Array.isArray(sub.matchLeft)) out.matchLeft = sub.matchLeft;
  if (Array.isArray(sub.matchRight)) out.matchRight = sub.matchRight;
  if (Array.isArray(sub.orderItems)) out.orderItems = sub.orderItems;
  return out;
}

/**
 * Pastikan sub-soal yang akan masuk snapshot tidak membawa kunci.
 *
 * Dicek pada SUB-SOAL ASLI (bukan hasil `publicSubQuestion`) supaya kebocoran
 * ketahuan di sumbernya. Melempar Error berisi nama sub-soal agar mudah
 * ditelusuri.
 */
export function assertSubQuestionsHaveNoKeys(subQuestions) {
  const subs = Array.isArray(subQuestions) ? subQuestions : [];
  for (let i = 0; i < subs.length; i += 1) {
    const sub = subs[i] || {};
    for (const f of keyFieldsForType(sub.type)) {
      if (f in sub && sub[f] !== undefined) {
        throw new Error(
          `Sub-soal #${i + 1} (${sub.type}) tidak boleh memuat field kunci "${f}".`
        );
      }
    }
  }
  return subs;
}

/**
 * Bangun SATU entri snapshot v3 dari dokumen soal publik.
 *
 * `question` di sini adalah dokumen PUBLIK (sudah tanpa field kunci setelah
 * M1). Fungsi ini tetap memfilter ulang sebagai pertahanan lapis kedua: kalau
 * ada jalur lain yang berhasil menulis kunci ke dokumen publik, entri ini
 * tetap bersih.
 *
 * @param {Object} question - dokumen soal publik
 * @param {string} questionId
 * @param {string|number} keyRevision - revisi kunci yang dipakai attempt ini
 * @returns {Object} entri snapshot v3 (tanpa field kunci)
 */
export function buildSnapshotV3Entry(question, questionId, keyRevision) {
  const id = question?.id || questionId;
  if (!question || question.available === false) {
    // Soal tidak ada / tidak terlihat saat attempt dimulai.
    // Bentuk ini IDENTIK dengan v2 supaya renderer lama tetap kompatibel:
    // `points: 0` + `available: false` + tanpa field kunci.
    //
    // `keyRevision` tetap wajib diisi karena `validSnapshotEntryV3` mensyaratkannya
    // untuk SEMUA entri. Untuk soal yang hilang, angkanya tidak pernah dipakai
    // untuk menilai (entri `unavailable` selalu 0 poin dan masuk penilaian
    // manual), jadi `1` dipakai sebagai penanda netral — bukan "revisi 1".
    return {
      id,
      type: 'unavailable',
      prompt: '',
      points: 0,
      available: false,
      keyRevision: String(keyRevision ?? UNAVAILABLE_KEY_REVISION)
    };
  }

  const type = question.type || 'single';

  // GUARD LAPIS PERTAMA — cek dokumen SUMBER, bukan hanya entri hasil.
  //
  // Entri dibangun dari whitelist, jadi apa pun yang tidak dicopy memang tidak
  // akan pernah terkirim. Tapi dokumen soal yang masih memuat field kunci
  // (milik tipenya sendiri ATAU milik tipe lain) menandakan migrasi M1 soal
  // ini belum tuntas. Kalau dibuang diam-diam, participant menerima soal yang
  // server tidak punya kuncinya (dokumen `key/{rev}` belum ada) dan attempt-nya
  // diam-diam masuk antrean penilaian manual. Lebih baik gagal sekarang di
  // depan peserta, dengan pesan yang bisa langsung ditindaklanjuti.
  const inlineKeys = V3_FORBIDDEN_KEY_FIELDS.filter(
    (f) => f in question && question[f] !== undefined
  );
  if (inlineKeys.length > 0) {
    throw new Error(
      `Snapshot v3 tidak boleh memuat field kunci: ${inlineKeys.join(', ')}. ` +
        `Soal "${id}" masih menyimpan kunci inline — migrasi ke questions/${id}/key belum tuntas.`
    );
  }

  const entry = { id };
  for (const f of V3_COMMON) {
    if (f in question) entry[f] = question[f];
  }
  entry.type = type;
  entry.prompt = typeof question.prompt === 'string' ? question.prompt : '';
  entry.points =
    Number.isFinite(Number(question.points)) && Number(question.points) > 0
      ? Number(question.points)
      : 10;

  // Opsi hanya untuk tipe yang menampilkannya.
  if (type === 'single' || type === 'multiple') {
    if (Array.isArray(question.options)) entry.options = question.options;
  }
  if (type === 'code') {
    // `starterCode` = kode awal yang harus diedit peserta → aman dipublikasikan.
    if (typeof question.starterCode === 'string') entry.starterCode = question.starterCode;
  }
  if (type === 'matching') {
    // Kolam kandidat wajib ikut: tanpa ini peserta tidak punya `right` untuk
    // dicocokkan. Yang TIDAK ikut adalah `pairs` (pemetaannya adalah kunci).
    // Kalau kolamnya tidak ada, guard di atas sudah melempar lebih dulu — dokumen
    // yang masih menyimpan `pairs` berarti migrasi M1 belum tuntas.
    if (Array.isArray(question.matchLeft)) entry.matchLeft = question.matchLeft;
    if (Array.isArray(question.matchRight)) entry.matchRight = question.matchRight;
  }
  if (type === 'ordering') {
    // Himpunan item wajib ikut; urutannya diacak ulang saat render. Yang tidak
    // ikut adalah `items` (urutan benar).
    if (Array.isArray(question.orderItems)) entry.orderItems = question.orderItems;
  }
  if (type === 'case_study') {
    entry.caseText = typeof question.caseText === 'string' ? question.caseText : '';
    // Dicek pada sub-soal asli: kalau sub-soal masih membawa kunci, itu
    // berarti jalur migrasi M1 belum tuntas untuk soal ini, dan lebih baik
    // gagal sekarang daripada mengirim kunci ke peserta.
    assertSubQuestionsHaveNoKeys(question.subQuestions);
    entry.subQuestions = (Array.isArray(question.subQuestions) ? question.subQuestions : [])
      .map(publicSubQuestion)
      .filter(Boolean);
  }

  // Revisi kunci dicatat TANPA isi kuncinya, supaya server tahu harus nilai
  // attempt ini terhadap revisi yang tepat (M5).
  entry.keyRevision = String(keyRevision);

  assertNoKeyFieldsInEntry(entry);
  return entry;
}

/**
 * Guard: entri snapshot v3 TIDAK BOLEH memuat field kunci apa pun.
 * Melempar Error (bukan hanya return) supaya kegagalan terlihat saat
 * development, bukan diam-diam terkirim ke Firestore.
 */
export function assertNoKeyFieldsInEntry(entry) {
  const found = V3_FORBIDDEN_KEY_FIELDS.filter((f) => f in entry && entry[f] !== undefined);
  if (found.length > 0) {
    throw new Error(`Snapshot v3 tidak boleh memuat field kunci: ${found.join(', ')}`);
  }
  if (Array.isArray(entry.subQuestions)) {
    for (const sub of entry.subQuestions) {
      const subFound = keyFieldsForType(sub?.type).filter((f) => f in (sub || {}));
      if (subFound.length > 0) {
        throw new Error(`Snapshot v3 tidak boleh memuat field kunci di sub-soal: ${subFound.join(', ')}`);
      }
    }
  }
  if ('explanation' in entry) {
    throw new Error('Snapshot v3 tidak boleh memuat explanation (bisa membocorkan kunci).');
  }
  if ('pairDraft' in entry) {
    throw new Error('Snapshot v3 tidak boleh memuat pairDraft (editor-only).');
  }
  return entry;
}

/**
 * Apakah entri snapshot ini versi legacy (v2) yang MEMBAWA kunci di dalamnya?
 *
 * Dipakai UI untuk memilih jalur render: v2 boleh menampilkan kunci saat
 * review (kuncinya memang sudah ada di dokumen), v3 tidak.
 */
export function isLegacySnapshotEntry(entry) {
  if (!entry) return false;
  // Entri v2 yang membawa kunci langsung per tipenya...
  // `subQuestions` dikecualikan: itu NAMA WADAH, bukan kunci. Entri v3 studi
  // kasus memang wajib punya `subQuestions` publik. Kalau tidak dikecualikan,
  // setiap soal studi kasus versi baru akan salah dikira legacy.
  if (
    keyFieldsForType(entry.type)
      .filter((f) => f !== 'subQuestions')
      .some((f) => f in entry && entry[f] !== undefined)
  ) {
    return true;
  }
  // ...atau entri studi kasus yang sub-soalnya masih berkey.
  const subs = Array.isArray(entry.subQuestions) ? entry.subQuestions : [];
  return subs.some((sub) =>
    keyFieldsForType(sub?.type)
      .filter((f) => f !== 'subQuestions')
      .some((f) => f in (sub || {}))
  );
}

/**
 * Daftar entri snapshot yang masih punya kunci di dalamnya.
 * Untuk UI: beri tahu user bahwa attempt lama ini sudah pernah membocorkan
 * kunci dan tidak bisa "diperbaiki" tanpa mengulang.
 */
export function legacyEntriesWithKeys(snapshot) {
  return (Array.isArray(snapshot) ? snapshot : []).filter(isLegacySnapshotEntry);
}

/**
 * Key fields apa saja yang terdapat pada satu entri (untuk review v2).
 * Mengembalikan objek berisi field kunci yang ditemukan, mis.
 * `{ options: [...], answerIndex: 1 }`.
 */
export function keyFieldsOfLegacyEntry(entry) {
  const out = {};
  if (!entry) return out;
  const typeFields = keyFieldsForType(entry.type);
  for (const f of [...typeFields, ...ALL_KEY_FIELD_NAMES]) {
    if (f in entry && entry[f] !== undefined) out[f] = entry[f];
  }
  return out;
}
