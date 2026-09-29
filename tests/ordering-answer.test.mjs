// Tes untuk jalur jawaban soal "mengurutkan" (ordering) di sisi attempt.
//
// Yang dijaga di sini adalah cacat yang SUDAH terjadi sebelum perbaikan ini:
// jawaban kosong jatuh ke answer key (`question.items`), sehingga kunci tampil
// di layar peserta DAN soal yang tidak dijawab terlihat seluruhnya "Benar" di
// review. Proyek ini tidak memakai jsdom, jadi logika murni di
// `orderingAnswer.js` yang diuji; terakhir ada penjaga source-level untuk
// memastikan `QuestionAttemptForm` tidak pernah memakai `items` sebagai
// fallback lagi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gradeQuestionAnswer } from '../src/features/questions/utils/grading.js';
import {
  cleanOrderingItems,
  isOrderingAnswer,
  moveOrderingItem,
  moveTargetFromKey,
  orderingReviewOutcome,
  orderingStateFromAnswer,
  sameOrder
} from '../src/features/questions/utils/orderingAnswer.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ITEMS = ['Merdeka', 'Kemerdekaan', 'Republik'];

// ---------- initial order ----------

test('ordering: jawaban kosong TIDAK memakai answer key sebagai fallback', () => {
  const state = orderingStateFromAnswer(ITEMS, null, 'soal-1');
  assert.equal(state.answered, false, 'belum menjawab harus tetap false');
  // Isinya tetap ITEM yang sama (dasar soal), hanya urutannya.
  assert.deepEqual(state.order.slice().sort(), ITEMS.slice().sort());
  // Urutan awal bukan urutan kunci.
  assert.notDeepEqual(state.order, ITEMS);
});

test('ordering: urutan awal diacak, tapi seed-nya stabil (reload sama)', () => {
  const a = orderingStateFromAnswer(ITEMS, null, 'soal-1');
  const b = orderingStateFromAnswer(ITEMS, null, 'soal-1');
  assert.deepEqual(a.order, b.order, 'reload sebelum menjawab tidak boleh mengacak ulang');
  const lain = orderingStateFromAnswer(ITEMS, null, 'soal-2');
  assert.notDeepEqual(a.order, lain.order, 'seed beda -> urutan awal beda');
});

test('ordering: urutan awal benar-benar diacak, bukan urutan kunci apa adanya', () => {
  // Untuk 2 item, seed tertentu memang menghasilkan urutan yang sama dengan
  // kunci. Itu tebasan yang wajar, bukan kebocoran — yang dibuktikan di sini:
  // untuk data yang sama, seed berbeda menghasilkan urutan berbeda, jadi urutan
  // awal memang hasil acak dan bukan `items` yang disalin.
  const items = ['a', 'b'];
  const hasil = ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (s) => orderingStateFromAnswer(items, null, s).order.join('|')
  );
  assert.ok(new Set(hasil).size > 1, 'seed berbeda harus bisa menghasilkan urutan berbeda');
  for (const s of ['0', '1', '2', '3', '4', '5', '6', '7']) {
    const state = orderingStateFromAnswer(items, null, s);
    assert.equal(state.answered, false, 'acak atau tidak, tetap belum menjawab');
    assert.equal(state.order.length, 2);
  }
});

test('ordering: jawaban peserta yang valid dipakai apa adanya', () => {
  const jawaban = ['Republik', 'Merdeka', 'Kemerdekaan'];
  const state = orderingStateFromAnswer(ITEMS, jawaban, 'soal-1');
  assert.equal(state.answered, true);
  assert.deepEqual(state.order, jawaban, 'tidak boleh diacak ulang saat sudah dijawab');
});

test('ordering: jawaban rusak (bukan susunan ulang item yang sama) diabaikan', () => {
  for (const buruk of [
    undefined,
    null,
    '',
    'Merdeka',
    [],
    ['Merdeka'],
    ['a', 'b', 'c'],
    ['Merdeka', 'Merdeka', 'Kemerdekaan'],
    [{ x: 1 }, { x: 2 }, { x: 3 }]
  ]) {
    const state = orderingStateFromAnswer(ITEMS, buruk, 'soal-1');
    assert.equal(state.answered, false, `harus dianggap belum menjawab: ${JSON.stringify(buruk)}`);
    assert.equal(state.order.length, ITEMS.length);
  }
});

// ---------- reorder ----------

test('ordering: move up / move down menggeser satu item, sisanya tetap', () => {
  const awal = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveOrderingItem(awal, 2, 1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveOrderingItem(awal, 1, 2), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveOrderingItem(awal, 0, 0), awal, 'tidak ada perubahan = array yang sama');
});

test('ordering: move di luar batas tidak mengubah apa pun', () => {
  const awal = ['a', 'b', 'c'];
  for (const [from, to] of [
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
    [0, 1.5],
    [1, '0']
  ]) {
    assert.equal(moveOrderingItem(awal, from, to), awal, `${from}->${to} harus ditolak`);
  }
  assert.equal(moveOrderingItem(null, 0, 1), null);
});

test('ordering: susunan baru dari move tetap berisi item yang sama (bukan duplikat)', () => {
  const awal = ITEMS.slice();
  const hasil = moveOrderingItem(awal, 2, 0);
  assert.deepEqual(hasil.slice().sort(), ITEMS.slice().sort());
  assert.equal(new Set(hasil).size, ITEMS.length, 'tidak boleh ada item yang dobel');
});

// ---------- keyboard ----------

test('ordering: keyboard panah atas/bawah -> indeks tujuan, null di batas', () => {
  assert.equal(moveTargetFromKey('ArrowUp', 2, 4), 1);
  assert.equal(moveTargetFromKey('ArrowDown', 2, 4), 3);
  // Batas atas & bawah: tidak ada tujuan, jadi fokus tidak ikut geser.
  assert.equal(moveTargetFromKey('ArrowUp', 0, 4), null);
  assert.equal(moveTargetFromKey('ArrowDown', 3, 4), null);
  // Tombol lain tidak memindahkan apa pun (bukan return diam tanpa alasan:
  // pemanggil memakai nilai null untuk memutuskan tidak melakukan apa-apa).
  for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab', 'a']) {
    assert.equal(moveTargetFromKey(key, 1, 4), null, `${key} tidak boleh memindahkan`);
  }
});

test('ordering: keyboard menyambungkan ke move yang benar', () => {
  const awal = ITEMS.slice();
  const dari = 1;
  const target = moveTargetFromKey('ArrowUp', dari, awal.length);
  const hasil = moveOrderingItem(awal, dari, target);
  assert.equal(hasil[target], awal[dari], 'item yang difokuskan pindah ke posisi target');
});

// ---------- review ----------

test('review: jawaban kosong TIDAK menjadi benar (bug lama: semua "Benar")', () => {
  for (const kosong of [null, undefined, [], 'bukan array']) {
    const outcome = orderingReviewOutcome(ITEMS, kosong);
    assert.equal(outcome.answered, false);
    assert.equal(outcome.correctCount, 0);
    assert.deepEqual(outcome.positions, [], 'tidak boleh ada baris yang ditandai benar');
  }
});

test('review: jawaban kosong bernilai 0 di grading (bukan nilai penuh)', () => {
  const soal = { type: 'ordering', items: ITEMS, points: 10 };
  for (const kosong of [null, undefined, []]) {
    const hasil = gradeQuestionAnswer(soal, kosong);
    assert.equal(hasil.isCorrect, false);
    assert.equal(hasil.pointsEarned, 0);
    assert.equal(hasil.fraction, 0);
  }
});

test('review: urutan peserta dipakai untuk menentukan posisi benar', () => {
  // Satu item meleset ke posisi terakhir: 1 dari 3 benar (dua item lain ikut
  // bergeser karena urutannya harus tetap lengkap).
  const jawaban = ['Merdeka', 'Republik', 'Kemerdekaan'];
  const outcome = orderingReviewOutcome(ITEMS, jawaban);
  assert.equal(outcome.answered, true);
  assert.equal(outcome.total, 3);
  assert.equal(outcome.correctCount, 1);
  assert.deepEqual(outcome.positions, [true, false, false]);
});

test('review: urutan tepat sama dengan kunci -> semua benar', () => {
  const outcome = orderingReviewOutcome(ITEMS, ITEMS.slice());
  assert.equal(outcome.correctCount, 3);
  assert.deepEqual(outcome.positions, [true, true, true]);
});

test('review: penanda di layar konsisten dengan nilai resmi grading', () => {
  // Yang tampil di review harus sama dengan angka yang tersimpan, supaya tidak
  // pernah ada badge "Benar" untuk soal yang nilainya 0.
  const jawaban = ['Kemerdekaan', 'Merdeka', 'Republik'];
  const soal = { type: 'ordering', items: ITEMS, points: 10 };
  const outcome = orderingReviewOutcome(ITEMS, jawaban);
  const hasil = gradeQuestionAnswer(soal, jawaban);
  assert.equal(outcome.correctCount / outcome.total, hasil.fraction);
  if (hasil.pointsEarned === 0) {
    assert.equal(outcome.correctCount, 0, 'nilai 0 tidak boleh punya baris "Benar"');
  }
});

test('review: snapshot dengan items kosong tidak crash dan tidak menandai benar', () => {
  const outcome = orderingReviewOutcome([], ['a']);
  assert.equal(outcome.answered, false);
  assert.deepEqual(outcome.positions, []);
});

// ---------- answer key tidak bocor sebagai jawaban ----------

test('answer key tidak pernah menjadi respons peserta', () => {
  // Urutan awal boleh memuat item yang sama dengan kunci (memang itu isi
  // soal), tapi TIDAK BOLEH menyalin urutan kunci sebagai jawaban tersimpan.
  const key = ITEMS.slice();
  const state = orderingStateFromAnswer(key, null, 'soal-1');
  assert.equal(state.answered, false, 'status harus "belum menjawab"');
  // Nilai yang akan dikirim ke server sebelum ada interaksi tetap `null`
  // (dipakai lewat `value`), bukan daftar dari state lokal.
  assert.equal(sameOrder(state.order, key), false, 'urutan awal bukan urutan kunci');
});

test('items sudah trims & kosong dibuang, sama seperti bentuk tersimpan', () => {
  assert.deepEqual(cleanOrderingItems([' a ', '', null, undefined, 'b']), ['a', 'b']);
  assert.deepEqual(cleanOrderingItems('bukan list'), []);
  assert.deepEqual(cleanOrderingItems(undefined), []);
});

test('isOrderingAnswer: hanya susunan ulang dari item yang sama', () => {
  assert.equal(isOrderingAnswer(ITEMS.slice(), ITEMS), true);
  assert.equal(isOrderingAnswer(['Kemerdekaan', 'Merdeka', 'Republik'], ITEMS), true);
  assert.equal(isOrderingAnswer(['Republik', 'Merdeka'], ITEMS), false);
  assert.equal(isOrderingAnswer([...ITEMS, 'tambahan'], ITEMS), false);
  // Multiset, bukan himpunan: jumlah kemunculan item ikut dibandingkan, jadi
  // jawaban yang menambah dobel tidak bisa lolos.
  assert.equal(isOrderingAnswer(['a', 'a', 'b'], ['a', 'b', 'b']), false, 'jumlah kemunculan harus sama');
  assert.equal(isOrderingAnswer(['a', 'a', 'b'], ['a', 'a', 'b']), true);
});

// ---------- penjaga source-level ----------

test('QuestionAttemptForm tidak pernah membaca items sebagai fallback', () => {
  const src = readFileSync(join(root, 'src/features/quizzes/components/QuestionAttemptForm.jsx'), 'utf8');
  const baris = src
    .split('\n')
    .filter((t) => !t.trim().startsWith('//') && !t.trim().startsWith('*'));
  const salah = baris.filter((t) => /\.\s*items\b|\[\s*'items'\s*\]/.test(t));
  assert.equal(salah.length, 0, `jenis soal "mengurutkan" harus ditangani OrderingAnswer:\n${ salah.join('\n') }`);
  assert.match(src, /<OrderingAnswer/, 'branch ordering harus memakai komponen OrderingAnswer');
});

test('komponen OrderingAnswer tidak pernah merender answer key ke peserta', () => {
  const src = readFileSync(join(root, 'src/features/quizzes/components/OrderingAnswer.jsx'), 'utf8');
  // Pola bug lama: `value.length ? value : items`.
  assert.doesNotMatch(src, /value\.length\s*\?/, 'tidak boleh ada fallback dari answer ke items');
  // Urutan awal wajib lewat pengacakan dengan seed, dari KOLAM item (`pool`),
  // bukan dari `items` apa adanya. Nama variabelnya `pool` justru memperjelas
  // asal-usulnya: himpunan item, bukan urutan jawaban.
  assert.match(src, /orderingStateFromAnswer\(pool, value, seed\)/, 'state awal dari util');
  // Kalau belum dijawab, review tidak boleh merender daftar sama sekali.
  assert.match(src, /if \(!outcome\.answered\)/, 'review tanpa jawaban tidak merender daftar');
  // Penanda benar/tidak hanya boleh tampil kalau kunci benar-benar ada di
  // dokumen. Tanpa penjaga ini, entri v3 (yang tidak memuat kunci sama sekali)
  // akan menandai semua baris "Belum tepat".
  assert.match(src, /\{hasKey && <ReviewBadge/, 'badge review hanya saat kunci ada');
  assert.match(
    src,
    /orderingReviewOutcome\(question\?\.items, value\)/,
    'penilaian review harus memakai kunci, bukan kolam item'
  );
});

test('kolam item (orderItems) dipakai lebih dulu daripada kunci (items)', () => {
  const src = readFileSync(join(root, 'src/features/quizzes/components/OrderingAnswer.jsx'), 'utf8');
  // Entri snapshot v3 hanya punya `orderItems`. Kalau daftar dibangun dari
  // `items`, urutan benar ikut tampil ke peserta.
  assert.match(
    src,
    /cleanOrderingItems\(question\?\.orderItems \?\? question\?\.items\)/,
    'daftar harus dibangun dari orderItems lebih dulu'
  );
});
