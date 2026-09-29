// ============================================================================
// Melihat satu soal beserta kuncinya (untuk author).
// ============================================================================
//
// Setelah pemisahan kunci, satu soal hidup di DUA dokumen:
//
//   - `questions/{qid}`            -> sisi publik (prompt, opsi, poin, meta)
//   - `questions/{qid}/key/{rev}`  -> sisi kunci, private untuk `createdBy`
//
// Editor dan panel detail butuh keduanya SEKALIGUS. Fungsi di sini menyatukan
// keduanya menjadi satu objek untuk ditampilkan, tanpa pernah menulis ulang ke
// dokumen mana pun.
//
// DUA BATAS YANG DIJAGA MODUL INI
//
//  1. HANYA field kunci milik tipenya yang diambil. Dokumen kunci juga membawa
//     `createdAt`, `schemaVersion`, dan `keyRevision` milik dirinya sendiri.
//     Menyalin semuanya akan membuat metadata soal ikut berubah hanya karena
//     panel detail dibuka — dan `createdAt` yang tertimpa tidak bisa dikembalikan.
//     Field bernilai `null` dianggap tidak ada, sama seperti di
//     `presentKeyFields`: Firestore memakai `null` untuk MENGHAPUS field, jadi
//     `null` di patch penghapusan berarti "tidak ada lagi", bukan "nilainya nol".
//
//  2. HANYA `createdBy` yang boleh melihat kunci sama sekali. Modul ini tidak
//     memeriksa hak akses: pemanggil dijamin hanya memanggilnya dengan kunci
//     yang memang berhasil dibaca untuk soal itu sendiri, karena rules
//     (policy P2) sudah menolak pembacaan kunci oleh partner. Yang dijaga di
//     sini adalah BENTUK gabungannya, bukan siapa yang berhak — memanggil
//     pemeriksaan hak akses lagi di sini hanya menjatuhkan lapisan keamanan
//     tanpa menambah apa pun.
//
// Modul ini MURNI: tidak menyentuh Firebase, bisa diuji dengan `node --test`.

import { keyFieldsForType } from './questionKeySplit.js';

/** Apakah `field` benar-benar terisi di `obj`? `null` dihitung kosong. */
function present(obj, field) {
  return obj != null && obj[field] !== undefined && obj[field] !== null;
}

/**
 * Gabungkan kunci sub-soal studi kasus ke sub-soal publik, per indeks.
 *
 * `publicSubs` = sub-soal dari dokumen soal (punya `type` + material publik).
 * `keySubs`    = sub-soal dari dokumen kunci (punya `type` + field kunci).
 *
 * Setiap sub-soal publik dijaga tetap ADA di hasil, walaupun pasangannya di
 * dokumen kunci tidak ada. Menghapus baris berarti author kehilangan sub-soal
 * tanpa disadari ketika menyimpan.
 */
export function mergeSubQuestionKey(publicSubs, keySubs) {
  const list = Array.isArray(publicSubs) ? publicSubs : [];
  const keys = Array.isArray(keySubs) ? keySubs : [];
  return list.map((sub, i) => {
    // Pasangan dianggap milik sub-soal ini hanya kalau tipenya sama. Tanpa
    // pemeriksaan ini, sub-soal yang berganti urutan di sisi kunci akan
    // "meminjam" kunci tetangganya.
    const key = keys[i] && keys[i].type === sub?.type ? keys[i] : {};
    const merged = { ...sub };
    for (const f of keyFieldsForType(sub?.type)) {
      if (f === 'subQuestions') continue;
      if (present(key, f)) merged[f] = key[f];
    }
    return merged;
  });
}

/**
 * Objek tampilan untuk satu soal + kunci.
 *
 * Mengembalikan `question` apa adanya bila kunci tidak diberikan — jadi
 * pemanggil bisa memakai hasil yang sama untuk author maupun partner, dan
 * `null` di hasilnya berarti "tidak ada yang perlu ditampilkan sebagai kunci",
 * bukan "kuncinya disembunyikan sebagian".
 *
 * Field yang tidak dikenal di kunci diabaikan; hanya `keyFieldsForType` yang
 * diteruskan.
 */
export function mergeKeyIntoQuestion(question, key) {
  if (!question) return question;
  if (!key || typeof key !== 'object') return question;

  const type = question.type;
  const merged = { ...question };

  for (const f of keyFieldsForType(type)) {
    if (f === 'subQuestions') {
      merged.subQuestions = mergeSubQuestionKey(question.subQuestions, key.subQuestions);
      continue;
    }
    if (present(key, f)) merged[f] = key[f];
  }
  return merged;
}
