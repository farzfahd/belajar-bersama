// Tes logika murni penjodohhan (matching). Fokus: aturan satu-ke-satu, safety
// rematch/unmatch, dan yang paling penting di attempt: pasangan benar tidak
// boleh bocor lewat urutan kolom kanan.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  MATCHING_MIN_PAIRS,
  addSlot,
  answerFromState,
  assignPair,
  assignedRightIndex,
  createMatchingState,
  createMatchingStateFromDraft,
  isValidPairDraft,
  leftIndexUsingRight,
  matchingCompletion,
  matchingStateForEditor,
  matchingStateFromAnswer,
  removeSlot,
  serializePairDraft,
  serializePairs,
  setLeftText,
  setRightText,
  shuffleWithSeed,
  unassignPair
} from '../src/features/questions/utils/matchingPairs.js';
import { buildQuestionSnapshot } from '../src/features/quizzes/utils/attemptEngine.js';

const PAIRS = [
  { left: 'Ibu kota Indonesia', right: 'Jakarta' },
  { left: 'Ibu kota Turki', right: 'Ankara' },
  { left: 'Ibu kota Jepang', right: 'Tokyo' }
];

describe('matching builder - state awal', () => {
  it('pasangan tersimpan langsung tersambung dan urut', () => {
    const s = createMatchingState(PAIRS);
    assert.deepEqual(s.lefts, PAIRS.map((p) => p.left));
    assert.deepEqual(s.rights, PAIRS.map((p) => p.right));
    assert.deepEqual(s.assigned, [0, 1, 2]);
    assert.deepEqual(serializePairs(s), PAIRS);
  });

  it('soal baru dapat dua baris kosong supaya langsung bisa diketik', () => {
    const s = createMatchingState([]);
    assert.equal(s.lefts.length, 2);
    assert.equal(s.rights.length, 2);
    assert.deepEqual(s.assigned, [null, null]);
    assert.deepEqual(serializePairs(s), []);
    assert.equal(matchingCompletion(s).complete, false);
  });

  it('pasangan setengah di luar tidak ikut terbawa', () => {
    const s = createMatchingState([...PAIRS, { left: 'x', right: '' }, { left: '', right: 'y' }]);
    assert.deepEqual(s.assigned, [0, 1, 2]);
  });
});

describe('matching builder - satu-ke-satu', () => {
  it('sambungkan kiri ke kanan', () => {
    let s = createMatchingState([]);
    s = setLeftText(s, 0, 'A');
    s = setRightText(s, 0, 'satu');
    s = setLeftText(s, 1, 'B');
    s = setRightText(s, 1, 'dua');
    s = assignPair(s, 0, 0);
    s = assignPair(s, 1, 1);
    assert.deepEqual(serializePairs(s), [{ left: 'A', right: 'satu' }, { left: 'B', right: 'dua' }]);
    assert.equal(matchingCompletion(s).complete, true);
  });

  it('satu item kanan tidak bisa dipakai dua kali: yang lama dilepas', () => {
    let s = createMatchingState(PAIRS);
    s = assignPair(s, 2, 0);
    assert.equal(assignedRightIndex(s, 2), 0);
    assert.equal(assignedRightIndex(s, 0), -1, 'kiri lama harus lepas');
    assert.equal(leftIndexUsingRight(s, 0), 2);
  });

  it('rematch: kiri yang sama pindah pasangan tanpa menimpa yang lain', () => {
    let s = createMatchingState(PAIRS);
    s = assignPair(s, 0, 2);
    assert.equal(assignedRightIndex(s, 0), 2);
    assert.equal(leftIndexUsingRight(s, 2), 0);
    assert.equal(assignedRightIndex(s, 1), 1, 'pasangan Turki tidak boleh ikut berubah');
    assert.equal(assignedRightIndex(s, 2), -1, 'kunci Jakarta jadi bebas');
    // Memindahkan satu pasangan selalu melepas satu kemiripan yang lain:
    // hanya boleh menyambung 1-1, jadi total tersambung turun ke 2.
    assert.equal(matchingCompletion(s).connected, 2);
    assert.deepEqual(serializePairs(s), [
      { left: 'Ibu kota Indonesia', right: 'Tokyo' },
      { left: 'Ibu kota Turki', right: 'Ankara' }
    ]);
  });

  it('unmatch melepas sambungan tanpa menghapus teks', () => {
    let s = createMatchingState(PAIRS);
    s = unassignPair(s, 1);
    assert.equal(assignedRightIndex(s, 1), -1);
    assert.deepEqual(s.lefts, PAIRS.map((p) => p.left));
    assert.equal(matchingCompletion(s).connected, 2);
  });

  it('teks yang diketik tapi belum disambung tidak ikut tersimpan', () => {
    let s = createMatchingState([]);
    s = setLeftText(s, 0, 'A');
    s = setRightText(s, 0, 'satu');
    s = setLeftText(s, 1, 'B');
    s = setRightText(s, 1, 'dua');
    s = assignPair(s, 0, 0);
    assert.deepEqual(serializePairs(s), [{ left: 'A', right: 'satu' }]);
    const c = matchingCompletion(s);
    assert.equal(c.connected, 1);
    assert.equal(c.filled, 2, 'dua baris sudah ada teksnya');
    assert.equal(c.complete, false);
  });

  it('tolak sambung ke baris yang teksnya masih kosong', () => {
    const s = createMatchingState([]);
    assert.equal(assignPair(s, 0, 1), s);
    assert.deepEqual(serializePairs(s), []);
  });

  it('hapus baris menurunkan indeks sambungan di belakang', () => {
    let s = createMatchingState(PAIRS);
    s = removeSlot(s, 0);
    assert.deepEqual(s.lefts, PAIRS.slice(1).map((p) => p.left));
    assert.equal(assignedRightIndex(s, 0), 0, 'Ankara tetap di Ankara');
    assert.equal(assignedRightIndex(s, 1), 1);
    assert.deepEqual(serializePairs(s), PAIRS.slice(1));
  });

  it('tambah baris tidak merusak sambungan yang sudah ada', () => {
    let s = createMatchingState(PAIRS);
    s = addSlot(s);
    assert.equal(s.lefts.length, 4);
    assert.equal(assignedRightIndex(s, 2), 2);
    assert.equal(matchingCompletion(s).connected, 3);
  });

  it('butuh minimal dua pasangan tersambung', () => {
    let s = createMatchingState([{ left: 'A', right: 'a' }]);
    assert.equal(matchingCompletion(s).complete, false);
    s = addSlot(s);
    s = setLeftText(s, 1, 'B');
    s = setRightText(s, 1, 'b');
    s = assignPair(s, 1, 1);
    assert.equal(matchingCompletion(s).connected, MATCHING_MIN_PAIRS);
    assert.equal(matchingCompletion(s).complete, true);
  });
});

describe('matching attempt - tidak membocorkan kunci', () => {
  it('kolom kanan diacak dan tidak sama dengan urutan kolom kiri', () => {
    const s = matchingStateFromAnswer(PAIRS, {}, 'q1-a1');
    assert.deepEqual(s.lefts, PAIRS.map((p) => p.left));
    assert.notDeepEqual(s.rights, PAIRS.map((p) => p.right));
    assert.deepEqual(s.rights.slice().sort(), PAIRS.map((p) => p.right).sort());
    assert.deepEqual(s.assigned, [null, null, null], 'tidak ada pasangan yang terpasang');
  });

  it('acak stabil: seed sama menghasilkan urutan sama', () => {
    const a = matchingStateFromAnswer(PAIRS, {}, 'q1-a1').rights;
    const b = matchingStateFromAnswer(PAIRS, {}, 'q1-a1').rights;
    assert.deepEqual(a, b);
  });

  it('seed berbeda mengacak berbeda (tidak selalu kebetulan sama)', () => {
    const seeds = ['q1-a1', 'q1-a2', 'q2-a1', 'x', 'y', 'z'];
    const seen = new Set(seeds.map((seed) => matchingStateFromAnswer(PAIRS, {}, seed).rights.join('|')));
    assert.ok(seen.size > 1, 'seed harus memengaruhi urutan');
    assert.equal(shuffleWithSeed([1, 2, 3], 1).length, 3);
  });

  it('jawaban lama dibaca balik dengan benar walau kunci teracak', () => {
    const answer = { 'Ibu kota Turki': 'Ankara', 'Ibu kota Jepang': 'Tokyo' };
    const s = matchingStateFromAnswer(PAIRS, answer, 'q1-a1');
    assert.deepEqual(answerFromState(s), answer);
    assert.equal(matchingCompletion(s).connected, 2);
  });

  it('sambungan setelah connecting menghasilkan peta jawaban yang valid', () => {
    let s = matchingStateFromAnswer(PAIRS, {}, 'q1-a1');
    s = assignPair(s, 0, s.rights.indexOf('Tokyo'));
    s = assignPair(s, 1, s.rights.indexOf('Ankara'));
    s = assignPair(s, 2, s.rights.indexOf('Jakarta'));
    assert.deepEqual(answerFromState(s), {
      'Ibu kota Indonesia': 'Tokyo',
      'Ibu kota Turki': 'Ankara',
      'Ibu kota Jepang': 'Jakarta'
    });
    assert.equal(matchingCompletion(s).complete, true);
  });

  it('satu-ke-satu juga berlaku di attempt saat reassign', () => {
    let s = matchingStateFromAnswer(PAIRS, {}, 'q1-a1');
    s = assignPair(s, 0, s.rights.indexOf('Tokyo'));
    s = assignPair(s, 1, s.rights.indexOf('Tokyo'));
    assert.equal(assignedRightIndex(s, 0), -1);
    assert.deepEqual(Object.keys(answerFromState(s)), ['Ibu kota Turki']);
  });

  it('state kosong tidak bikin error', () => {
    const s = matchingStateFromAnswer([], {}, 'q');
    assert.deepEqual(s.lefts, []);
    assert.deepEqual(serializePairs(s), []);
    assert.equal(matchingCompletion(s).complete, false);
  });
});

// ---------------------------------------------------------------------------
// PERSISTENSI DRAFT EDITOR: `pairs` (answer key) vs `pairDraft` (draft).
// Bug yang diperbaiki: "Lepas pasangan" menghapus baris secara permanen karena
// `pairs` tidak punya tempat untuk baris yang belum tersambung.
// ---------------------------------------------------------------------------
describe('matching draft - pairs tetap answer key', () => {
  // 1. Semua row paired -> serializePairs tidak berubah.
  it('1. semua baris tersambung: serializePairs tidak berubah', () => {
    const s = createMatchingState(PAIRS);
    assert.deepEqual(serializePairs(s), PAIRS);
    assert.deepEqual(serializePairDraft(s), {
      lefts: PAIRS.map((p) => p.left),
      rights: PAIRS.map((p) => p.right),
      assigned: [0, 1, 2]
    });
  });

  // 2. Satu row unpaired -> serializePairs hanya pasangan lengkap.
  it('2. satu baris belum dipasangkan: pairs hanya memuat pasangan lengkap', () => {
    const s = unassignPair(createMatchingState(PAIRS), 1);
    assert.deepEqual(serializePairs(s), [
      { left: 'Ibu kota Indonesia', right: 'Jakarta' },
      { left: 'Ibu kota Jepang', right: 'Tokyo' }
    ]);
    // Tidak ada `right: ''` yang ikut - itu akan merusak `pairs.every` di
    // grading.js dan ditolak `validMatchingPair` di firestore.rules.
    assert.equal(serializePairs(s).some((p) => !p.left || !p.right), false);
  });

  // 3. Unpaired row tetap berada di pairDraft.
  it('3. baris belum dipasangkan tetap ada di pairDraft', () => {
    const s = unassignPair(createMatchingState(PAIRS), 1);
    const draft = serializePairDraft(s);
    assert.equal(draft.lefts.length, 3, 'baris tidak boleh hilang');
    assert.equal(draft.lefts[1], 'Ibu kota Turki');
    assert.equal(draft.rights[1], 'Ankara', 'teks item kanan tetap ada');
    assert.equal(draft.assigned[1], null, 'baris jadi belum dipasangkan');
  });

  // 4. Unpaired row survive serialize -> deserialize.
  it('4. unpair bertahan melewati serialize lalu deserialize', () => {
    const s = unassignPair(createMatchingState(PAIRS), 1);
    const restored = createMatchingStateFromDraft(serializePairDraft(s));
    assert.deepEqual(restored, s, 'state setelah reload harus sama persis');
    assert.equal(assignedRightIndex(restored, 1), -1);
    assert.equal(matchingCompletion(restored).connected, 2);
    assert.equal(matchingCompletion(restored).total, 3);
  });

  // 5. Text pada unpaired row survive persistence.
  it('5. teks baris belum dipasangkan bertahan utuh', () => {
    let s = createMatchingState([]);
    s = setLeftText(s, 0, '  Indonesia  ');
    s = setRightText(s, 0, 'Jakarta');
    s = setLeftText(s, 1, 'Jepang');
    s = setRightText(s, 1, 'Tokyo');
    s = assignPair(s, 0, 0);
    s = assignPair(s, 1, 1);
    s = unassignPair(s, 1);

    const restored = createMatchingStateFromDraft(serializePairDraft(s));
    assert.equal(restored.lefts[1], 'Jepang');
    assert.equal(restored.rights[1], 'Tokyo');
    // Draft sengaja tidak mem-trim teks: baris setengah diketik harus pulih
    // persis seperti terakhir diketik.
    assert.equal(restored.lefts[0], '  Indonesia  ');
  });

  // 6. Reopen/reload tidak mengembalikan pasangan lama.
  it('6. reload tidakmenhirikan kembali pasangan yang sudah dilepas', () => {
    const s = unassignPair(createMatchingState(PAIRS), 1);
    const draft = serializePairDraft(s);
    // reopen = dokumen dibaca lagi
    const reopened = matchingStateForEditor(draft, serializePairs(s));
    assert.equal(assignedRightIndex(reopened, 1), -1, 'pasangan lama tidak boleh kembali');
    // reload = dokumen dibaca lagi dengan draft yang sama
    const reloaded = matchingStateForEditor(draft, serializePairs(s));
    assert.equal(assignedRightIndex(reloaded, 1), -1);
    assert.deepEqual(serializePairs(reopened), serializePairs(s));
  });

  // 7. Unpair -> pair again -> state dan pairs benar.
  it('7. pasang ulang mengembalikan baris ke answer key', () => {
    let s = unassignPair(createMatchingState(PAIRS), 1);
    s = assignPair(s, 1, 1); // 'Ankara' kembali ke baris Turki
    assert.deepEqual(serializePairs(s), PAIRS);
    assert.deepEqual(serializePairDraft(s).assigned, [0, 1, 2]);
    // Pasangan itu harus bertahan setelah reload
    const reloaded = createMatchingStateFromDraft(serializePairDraft(s));
    assert.deepEqual(serializePairs(reloaded), PAIRS);
  });

  // 8. Multiple unpaired rows.
  it('8. beberapa baris sekaligus belum dipasangkan tetap tersimpan', () => {
    let s = createMatchingState([
      ...PAIRS,
      { left: 'Ibu kota Italia', right: 'Roma' },
      { left: 'Ibu kota Kanada', right: 'Ottawa' }
    ]);
    s = unassignPair(s, 0);
    s = unassignPair(s, 3);
    s = unassignPair(s, 4);

    const draft = serializePairDraft(s);
    assert.deepEqual(draft.assigned, [null, 1, 2, null, null]);
    assert.deepEqual(serializePairs(s), [
      { left: 'Ibu kota Turki', right: 'Ankara' },
      { left: 'Ibu kota Jepang', right: 'Tokyo' }
    ]);

    const restored = createMatchingStateFromDraft(draft);
    assert.deepEqual(restored, s);
    assert.equal(matchingCompletion(restored).total, 5);
    assert.equal(matchingCompletion(restored).connected, 2);
  });

  // 9. Old question tanpa pairDraft tetap kompatibel.
  it('9. soal lama tanpa pairDraft tetap terbuka dan bisa diedit', () => {
    const s = matchingStateForEditor(undefined, PAIRS);
    assert.deepEqual(s.lefts, PAIRS.map((p) => p.left));
    assert.deepEqual(s.assigned, [0, 1, 2]);
    // null (draft kosong di form) diperlakukan sama dengan tidak ada
    assert.deepEqual(matchingStateForEditor(null, PAIRS), s);
    // Draft rusak juga jatuh ke pairs, bukan dipakai apa adanya
    assert.deepEqual(matchingStateForEditor({ lefts: 'x' }, PAIRS), s);
    assert.deepEqual(matchingStateForEditor({ lefts: ['a'], rights: ['b', 'c'], assigned: [0] }, PAIRS), s);
  });

  // 10. Keamanan: pairDraft tidak boleh masuk snapshot peserta.
  it('10. pairDraft tidak pernah ikut ke snapshot attempt', () => {
    const pairs = [
      { left: 'Indonesia', right: 'Jakarta' },
      { left: 'Jepang', right: 'Tokyo' }
    ];
    const pairDraft = { lefts: ['Indonesia', 'Jepang'], rights: ['Jakarta', 'Tokyo'], assigned: [0, 1] };
    const [entry] = buildQuestionSnapshot({ questionIds: ['q1'] }, { q1: { id: 'q1', type: 'matching', prompt: 'P', pairs, pairDraft } }, 'seed');

    assert.equal(entry.pairDraft, undefined, 'pairDraft tidak boleh ada di snapshot');
    assert.equal('pairDraft' in entry, false);
    assert.deepEqual(entry.pairs, pairs, 'answer key tetap ikut supaya bisa dinilai');
    // Tidak boleh ada Assigned mapping tersembunyi di snapshot
    assert.equal('assigned' in entry, false);
    assert.equal(JSON.stringify(entry).includes('assigned'), false);
  });
});

describe('matching draft - validitas & keamanan draft', () => {
  it('draft dengan assigned di luar jangkauan dilepas, bukan dipakai', () => {
    const s = createMatchingStateFromDraft({
      lefts: ['a', 'b'],
      rights: ['x', 'y'],
      assigned: [5, -1]
    });
    assert.deepEqual(s.assigned, [null, null]);
  });

  it('draft rusak (satu item kanan diklaim dua baris) melepas baris kedua', () => {
    const s = createMatchingStateFromDraft({
      lefts: ['a', 'b'],
      rights: ['x', 'y'],
      assigned: [0, 0]
    });
    assert.deepEqual(s.assigned, [0, null], 'satu-ke-satu harus dijaga saat muat');
    assert.equal(assignedRightIndex(s, 0), 0);
    assert.equal(assignedRightIndex(s, 1), -1);
  });

  it('draft kosong / bukan objek ditolak', () => {
    assert.equal(createMatchingStateFromDraft(undefined), null);
    assert.equal(createMatchingStateFromDraft(null), null);
    assert.equal(createMatchingStateFromDraft([]), null);
    assert.equal(createMatchingStateFromDraft({ lefts: [], rights: [], assigned: [] }), null);
    assert.equal(isValidPairDraft({ lefts: ['a'], rights: ['b'], assigned: [0] }), true);
    assert.equal(isValidPairDraft({ lefts: ['a'], rights: ['b', 'c'], assigned: [0] }), false);
  });

  it('rematch satu-ke-satu tetap benar setelah dipulihkan dari draft', () => {
    // 'x' dipindah dari baris 0 ke baris 1: baris 0 harus jadi belum dipasangkan.
    let s = createMatchingStateFromDraft({
      lefts: ['a', 'b'],
      rights: ['x', 'y'],
      assigned: [0, 1]
    });
    s = assignPair(s, 1, 0);
    assert.deepEqual(s.assigned, [null, 0]);
    const restored = createMatchingStateFromDraft(serializePairDraft(s));
    assert.deepEqual(restored.assigned, [null, 0]);
    assert.deepEqual(serializePairs(restored), [{ left: 'b', right: 'x' }]);
  });
});

