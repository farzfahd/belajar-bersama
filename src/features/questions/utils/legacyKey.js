// ============================================================================
// Deteksi & pembacaan kunci jawaban LEGACY (kunci inline di dokumen soal).
// ============================================================================
//
// SEBELUM pemisahan kunci (M1), satu dokumen `questions/{qid}` memuat prompt DAN
// kunci jawaban sekaligus. Dokumen seperti itu masih ada di produksi dan masih
// harus bisa dibaca, tapi tidak boleh diperlakukan sebagai sumber kebenaran
// baru.
//
// Modul ini murni (tanpa Firebase) supaya bisa diuji dengan `node --test`.
//
// ATURAN YANG DIJAGA DI SINI — tiga hal yang mudah keliru:
//
//  1. "Inline key" itu ADA atau TIDAK, bukan "sebagian". `hasInlineAnswerKey`
//     sengaja bernilai benar begitu SATU field kunci ditemukan: kunci yang
//     sebagian hilang lebih berbahaya daripada yang utuh, karena pemanggil
//     cenderung mel convincingly "kuncinya sudah dipindah" padahal tidak semua.
//     Yang menentukan boleh-tidaknya kunci itu dipakai ada di
//     `isCompleteInlineKey`.
//
//  2. Kunci legacy TIDAK BOLEH dihapus diam-diam. Pemisahan hanya berarti: kunci
//     legacy dibaca apa adanya, dan key doc dibuat saat author mengedit soal
//     (jalur eksplisit, bukan otomatis). Modul ini tidak menyediakan fungsi
//     hapus — deliberate.
//
//  3. Pemindahan kunci legacy → key doc harus bisa dilakukan TANPA kehilangan
//     data. `buildMigratedKeyDocument` menolak kalau kunci legacy tidak lengkap
//     (lihat `isCompleteInlineKey`), jadi tidak mungkin mengarang kunci dari
//     separuh data.
//
// PERBEDAAN `inlineKeyFields` vs `ALL_KEY_FIELD_NAMES` (dari questionKeySplit):
// yang di sini menjawab "dokumen ini punya key field apa saja", yang di sana
// menjawab "nama apa saja yang pernah jadi kunci". Keduanya dipakai: yang
// pertama untuk keputusan logika, yang kedua untuk guard.

import { ALL_KEY_FIELD_NAMES, keyFieldsForType, presentKeyFields } from './questionKeySplit.js';

/**
 * Field kunci yang SEDANG ADA di sebuah dokumen soal apa adanya.
 *
 * Menghitung rekursif ke dalam `subQuestions` (nama `subQuestions` sendiri
 * tidak dihitung sebagai kebocoran — dokumen publik studi kasus memang harus
 * punya sub-soal publik; yang dihitung adalah kunci DI DALAM sub-soalnya).
 *
 * @returns {string[]} nama field kunci yang ditemukan, urut mengikuti `ALL_KEY_FIELD_NAMES`
 */
export function inlineKeyFields(question) {
  return presentKeyFields(question);
}

/**
 * Apakah dokumen soal ini menyimpan kunci jawaban secara inline (bentuk legacy)?
 *
 * Bernilai `true` begitu ada satu saja field kunci — termasuk hanya di dalam
 * `subQuestions`. Nilai `false` berarti dokumen ini sudah bentuk baru (kunci
 * sudah pindah ke `questions/{qid}/key/{rev}`).
 */
export function hasInlineAnswerKey(question) {
  return inlineKeyFields(question).length > 0;
}

/**
 * Field kunci yang WAJIB ada supaya kunci legacy bisa deemed lengkap.
 *
 * Untuk `case_study` yang wajibnya `subQuestions`, "lengkap" berarti daftar
 * sub-soalnya ada. Penilaian per sub-soal ditangani `isCompleteInlineKey` agar
 * tidak menggandakan aturan.
 */
function requiredKeyFieldsFor(type) {
  // `case_study` memang bawa `subQuestions`, tapi itu bukan "satu field kunci
  // tunggal" — isinya perlu diperiksa sendiri.
  return keyFieldsForType(type).filter((f) => f !== 'subQuestions');
}

/**
 * Apakah kunci legacy pada dokumen ini LENKAP untuk dipindahkan ke key doc?
 *
 * "Lengkap" berarti: ada key field yang WAJIB untuk tipenya, dan — untuk studi
 * kasus — setiap sub-soalnya juga punya kunci yang wajib. Nilai yang dikembalikan
 * BUKAN aman dipakai: nilai `essay`/`code` memang boleh kosong, karena dua tipe
 * itu bisa jadi soal penilaian manual (lihat `essayKeyOk`/`codeKeyOk` di rules).
 *
 * @returns {boolean}
 */
export function isCompleteInlineKey(question) {
  const type = question?.type;
  if (!type) return false;

  if (type === 'case_study') {
    const subs = question.subQuestions;
    // Daftar kosong = sah (grading.js memperlakukannya sebagai soal otomatis),
    // jadi lengkap. Yang tidak lengkap adalah sub-soal yang ada tapi tak berkunci.
    if (!Array.isArray(subs)) return false;
    return subs.every((sub) => {
      const subType = sub?.type;
      if (!subType) return false;
      // `essay`/`code`/`case_study` tidak boleh jadi tipe sub-soal sama sekali
      // (`validPublicSubQuestion`), jadi kemunculannya berarti data rusak.
      if (requiredKeyFieldsFor(subType).length === 0 && subType !== 'case_study') {
        return subType === 'essay' || subType === 'code';
      }
      return requiredKeyFieldsFor(subType).every((f) => f in (sub || {}) && sub[f] !== undefined);
    });
  }

  const required = requiredKeyFieldsFor(type);
  if (required.length === 0) {
    // `essay` & `code` boleh tanpa kunci: keduanya bisa jadi soal penilaian
    // manual, dan `validEssay` versi lama juga membolehkan absennya `sampleAnswer`.
    return type === 'essay' || type === 'code';
  }
  return required.every((f) => f in question && question[f] !== undefined);
}

/**
 * Kunci yang TERISI dari dokumen legacy, kalau ada. Null kalau tidak lengkap.
 *
 * Dipakai jalur migrasi: pemanggil butuh key data utuh, dan mem-/membuang
 * sebagian kunci akan menghasilkan key doc yang lolos validasi rules tapi
 * salah nilainya.
 */
export function legacyKeyData(question) {
  if (!isCompleteInlineKey(question)) return null;
  const type = question.type;
  if (type === 'case_study') {
    return {
      subQuestions: (question.subQuestions || []).map((sub) => {
        const out = { type: sub.type };
        for (const f of requiredKeyFieldsFor(sub.type)) {
          if (f in sub) out[f] = sub[f];
        }
        return out;
      })
    };
  }
  const out = {};
  for (const f of requiredKeyFieldsFor(type)) {
    if (f in question) out[f] = question[f];
  }
  return out;
}

/**
 * Susun key doc dari kunci legacy, JIKA kuncinya lengkap.
 *
 * Mengembalikan `null` (bukan melempar) supaya pemanggil bisa menampilkan
 * "soal ini belum punya kunci yang bisa dipakai" alih-alih crash saat membuka
 * editor.
 *
 * `keyRevision` memakai string karena itu bentuknya di Firestore (dan yang
 * diminta rules lewat `d.keyRevision == keyRevision`).
 */
export function buildMigratedKeyDocument(question, { keyRevision = '1', createdAt = null } = {}) {
  const keyData = legacyKeyData(question);
  if (!keyData) return null;
  const type = question.type;
  return {
    keyRevision: String(keyRevision),
    type,
    ...keyData,
    schemaVersion: 1,
    createdAt
  };
}

/**
 * Kunci yang harus dipakai AUTOR saat menyunting soal.
 *
 * Prioritas key doc: bentuk yang sudah dipisah adalah yang akan dipakai server,
 * sedangkan kunci inline bisa saja sisa penulisan lama yang belum pernah
 * dimigrasikan. Kalau keduanya ada dan berbeda, author harus melihat yang akan
 * benar-benar dipakai — bukan yang tertinggal.
 *
 * Mengembalikan `null` untuk soal yang sama sekali tidak punya kunci, supaya
 * pemanggil bisa membedakan "belum ada kunci" dari "kunci kosong".
 *
 * PENTING: fungsi ini untuk jalur AUTHOR saja. Jangan pernah dipakai di jalur
 * peserta: kalau kunci inline masih ada, di situlah bocornya, dan memanggil
 * fungsi ini di sana justru memindahkan kunci ke memory browser.
 */
export function authorKeyData(question, keyDoc) {
  if (keyDoc && typeof keyDoc === 'object') {
    const { id, ...rest } = keyDoc;
    void id;
    return {
      ...rest,
      keyRevision: rest.keyRevision != null ? String(rest.keyRevision) : null
    };
  }
  return legacyKeyData(question);
}

/**
 * Ringkasan status kunci untuk UI & laporan migrasi.
 *
 * Murni turunan dari bentuk dokumen: tanpa IO, tanpa efek samping. Bedakan
 * `hasInlineKey` (apapun kunci yang ada) dari `inlineKeyComplete` (cukup utuh
 * untuk dipindahkan) karena keduanya sering berbeda persis pada soal yang
 * sebagian sudah termigrasi.
 */
export function keyStatus(question) {
  const fields = inlineKeyFields(question);
  const complete = isCompleteInlineKey(question);
  return {
    hasInlineKey: fields.length > 0,
    inlineKeyFields: fields,
    inlineKeyComplete: complete,
    canMigrateToKeyDoc: complete
  };
}