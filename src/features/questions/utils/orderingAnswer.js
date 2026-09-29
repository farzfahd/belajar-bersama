// Logika murni untuk soal "mengurutkan" (ordering) di sisi attempt. Dipisah dari
// React supaya bisa diuji tanpa DOM, mengikuti pola `matchingPairs.js`.
//
// MODEL DATA (penting — dua hal yang TIDAK boleh dicampur)
// -------------------------------------------------------
// `items` pada dokumen soal adalah KUNCI JAWABAN: urutan yang dianggap benar.
// Yang disimpan di `answers[].userAnswer` adalah URUTAN YANG DIPILIH PESERTA —
// daftar item yang sama, disusun ulang oleh peserta.
//
// Versi lama mencampur keduanya: `QuestionAttemptForm` memakai
// `Array.isArray(value) && value.length ? value : question.items || []`, jadi
// (1) kunci jawaban tampil di layar peserta sebagai daftar, dan (2) jawaban
// kosong ikut terhitung sebagai jawaban pada mode review (fallback dibandingkan
// dengan dirinya sendiri, hasilnya semua "Benar"). Di sini keduanya dipisah:
//
//   items  : data item + kunci. Dipakai untuk mengacak urutan awal & menilai.
//   answer : urutan milik peserta, `null` sampai peserta benar-benar menyusun.
//
// INITIAL ORDER
// ------------
// Urutan awal dibuat dari `items` lalu DIACAK dengan seed stabil (turun dari id
// soal), persis seperti kolom kanan pada `MatchingAnswer`. Seed stabil penting
// untuk dua hal: urutan awal tidak berubah-ubah saat reload sebelum menjawab,
// dan tidak ada yang bisa menebak kunci dari urutan awal.
//
// Konsekuensi yang disengaja: untuk 2 item,Mengacak bisa menghasilkan urutan
// yang kebetulan sama dengan kunci. Itu benar secara statistik (tebakan 1 dari
// 2) dan bukan kebocoran — yang dihindari adalah memakai kunci sebagai
// fallback saat jawaban kosong.
import { seedFromText, shuffleWithSeed } from './matchingPairs.js';

/** Item unik yang boleh masuk daftar (sama dengan bentuk tersimpan di builder). */
export function cleanOrderingItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

/** Bandingkan dua daftar item apa adanya (urut & isi). */
export function sameOrder(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  return left.every((item, i) => item === right[i]);
}

/** Kunci multiset: dipakai untuk mengecek jawaban peserta benar-benar susunan ulang. */
function multisetKey(list) {
  return list.map((v) => String(v)).sort().join('\u0000');
}

/**
 * Apakah `answer` bisa dipakai sebagai urutan peserta.
 *
 * Selain harus array, isinya harus memuat item yang sama persis dengan `items`
 * (multiset). Tanpa cek ini, jawaban hasil reload dari soal yang berubah bisa
 * membuat daftar yang isinya bukan soal itu — dan penanda "Benar" di review
 * jadi dibandingkan terhadap teks yang tidak ada.
 */
export function isOrderingAnswer(answer, items) {
  const clean = cleanOrderingItems(items);
  if (!Array.isArray(answer)) return false;
  if (answer.length !== clean.length) return false;
  return multisetKey(answer) === multisetKey(clean);
}

/**
 * State awal daftar untuk attempt.
 *
 * `answered` = false berarti urutan yang tampil HANYA urutan acuan awal: ini
 * belum jawaban peserta dan belum boleh dihitung nilai. Peserta baru berbalik
 * menjadi "sudah menjawab" saat `onChange` menerima susunan baru.
 */
export function orderingStateFromAnswer(items, answer, seed) {
  const clean = cleanOrderingItems(items);
  if (isOrderingAnswer(answer, clean)) return { order: answer.slice(), answered: true };
  return { order: shuffleWithSeed(clean, seedFromText(seed)), answered: false };
}

/** Pindahkan satu item dari `from` ke `to`. Di luar batas, atau `from === to`, dikembalikan apa adanya. */
export function moveOrderingItem(order, from, to) {
  if (!Array.isArray(order)) return order;
  if (!(Number.isInteger(from) && from >= 0 && from < order.length)) return order;
  if (!(Number.isInteger(to) && to >= 0 && to < order.length) || from === to) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Arah dari tombol panah pada keyboard -> indeks tujuan, atau `null` kalau
 * tombol itu tidak memindahkan apa pun (termasuk di batas atas/bawah).
 *
 * Hanya atas/bawah: daftar ini vertikal, jadi panah kiri/kanan dibiarkan
 * untuk navigasi fokus biasa agar tidak mengejutkan pengguna.
 */
export function moveTargetFromKey(key, index, length) {
  if (key === 'ArrowUp') return index - 1 >= 0 ? index - 1 : null;
  if (key === 'ArrowDown') return index + 1 < length ? index + 1 : null;
  return null;
}

/**
 * Hasil penilaian untuk tampilan review. Perhitungannya sengaja sama dengan
 * `grading.js` (posisi benar / total) supaya badge di layar tidak pernah
 * berbeda dengan angka resmi.
 *
 * PENTING: jawaban kosong menghasilkan `positions: []` — tidak ada satu pun
 * baris yang ditandai "Benar". Ini yang mencegah bug lama, di mana fallback ke
 * kunci membuat soal yang tidak dijawab tampil seluruhnya benar.
 */
export function orderingReviewOutcome(items, answer) {
  const clean = cleanOrderingItems(items);
  if (!clean.length || !isOrderingAnswer(answer, clean)) {
    return { answered: false, total: clean.length, correctCount: 0, positions: [] };
  }
  const positions = answer.map((item, i) => clean[i] === item);
  return {
    answered: true,
    total: clean.length,
    correctCount: positions.filter(Boolean).length,
    positions
  };
}
