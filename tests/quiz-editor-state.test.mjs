// Tes untuk alur "Buat Quiz → Quiz Editor" dan util urutan soal.
//
// Dua bagian:
//  1. Logika murni (bisa dijalankan tanpa browser) — util urutan & state editor.
//  2. Guard sumber — memastikan wiring di komponen benar-benar ada. Proyek ini
//     tidak punya jsdom/RTL, jadi render tidak bisa diuji; guard substring
//     dipilih untuk hal yang memang harus benar (tidak ada quizId hardcoded,
//     tombol panah + drag keduanya terpasang, retry tidak pernah membuat kuis).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  appendQuestionIds,
  buildEditorCards,
  buildQuizQuestionRows,
  cardKeyOf,
  cardMoveBounds,
  isDraftCardVisible,
  moveDraftCard,
  moveItemAt,
  moveQuestionIdAt,
  moveQuestionIdTo
} from '../src/features/quizzes/utils/quizQuestions.js';
import {
  CREATE_WITHOUT_ID_MESSAGE,
  EDITOR_MESSAGES,
  EDITOR_STATE,
  canRetryEditor,
  editorFailureMessage,
  isPermissionError,
  isValidQuizId,
  resolveQuizEditorState,
  shouldNavigateAfterCreate
} from '../src/features/quizzes/utils/quizEditorState.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ids = (n) => Array.from({ length: n }, (_, i) => `q${i + 1}`);
const q = (id) => ({ id, prompt: `Prompt ${id}`, type: 'single', points: 10 });

// ===================================================================
// URUTAN SOAL — util murni
// ===================================================================
describe('moveItemAt — satu langkah naik/turun (satu-satunya implementasi)', () => {
  it('naik = delta -1, turun = delta +1', () => {
    assert.deepEqual(moveItemAt(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
    assert.deepEqual(moveItemAt(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
    assert.deepEqual(moveItemAt(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
    assert.deepEqual(moveItemAt(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  });

  it('kepala/ekor/satu elemen/tipe salah mengembalikan array yang SAMA (tanpa write)', () => {
    const list = ['a', 'b'];
    assert.equal(moveItemAt(list, 0, -1), list, 'kepala tidak bisa naik');
    assert.equal(moveItemAt(list, 1, 1), list, 'ekor tidak bisa turun');
    const one = ['a'];
    assert.equal(moveItemAt(one, 0, -1), one);
    assert.equal(moveItemAt(one, 0, 1), one);
    assert.equal(moveItemAt(list, 9, -1), list, 'indeks di luar jangkauan');
    assert.equal(moveItemAt(list, -1, 1), list, 'indeks negatif');
    assert.equal(moveItemAt(null, 0, 1), null, 'input bukan array');
  });

  it('imutabel: input tidak pernah dimutasi', () => {
    const list = ['a', 'b', 'c'];
    moveItemAt(list, 0, 1);
    assert.deepEqual(list, ['a', 'b', 'c']);
  });

  it('berlaku juga untuk array objek (kartu baru yang belum punya id)', () => {
    const cards = [{ k: 1 }, { k: 2 }, { k: 3 }];
    const next = moveItemAt(cards, 2, -1);
    assert.deepEqual(next.map((c) => c.k), [1, 3, 2]);
    assert.equal(next[1], cards[2], 'elemen tidak dikloning');
  });

  it('moveQuestionIdAt memakai aturan yang sama persis', () => {
    const list = ['a', 'b', 'c'];
    assert.deepEqual(moveQuestionIdAt(list, 1, -1), moveItemAt(list, 1, -1));
    assert.equal(moveQuestionIdAt(list, 0, -1), list, 'identitas array tetap sama');
  });
});

describe('moveQuestionIdTo — drag jarak bebas', () => {
  it('memindahkan dari indeks awal ke akhir dan sebaliknya', () => {
    assert.deepEqual(moveQuestionIdTo(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'd', 'a']);
    assert.deepEqual(moveQuestionIdTo(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveQuestionIdTo(['a', 'b', 'c', 'd'], 1, 2), ['a', 'c', 'b', 'd']);
  });

  it('from === to / di luar jangkauan / <2 soal mengembalikan array yang SAMA', () => {
    const list = ['a', 'b', 'c'];
    assert.equal(moveQuestionIdTo(list, 1, 1), list);
    assert.equal(moveQuestionIdTo(list, -1, 2), list);
    assert.equal(moveQuestionIdTo(list, 0, 9), list);
    const one = ['a'];
    assert.equal(moveQuestionIdTo(one, 0, 0), one);
    const kosong = [];
    assert.equal(moveQuestionIdTo(kosong, 0, 0), kosong);
    assert.deepEqual(moveQuestionIdTo(kosong, 0, 0), []);
  });

  it('drag satu langkah hasilnya identik dengan tombol panah', () => {
    // Ini yang membuat drag "tambahan, bukan pengganti": keduanya memanggil
    // util yang sama, jadi tidak mungkin berbeda hasilnya.
    for (const delta of [-1, 1]) {
      const viaArrow = moveQuestionIdAt(ids(4), 1, delta);
      const viaDrag = moveQuestionIdTo(ids(4), 1, 1 + delta);
      assert.deepEqual(viaDrag, viaArrow, `delta ${delta}`);
    }
  });
});

describe('urutan soal bertahan setelah refresh', () => {
  it('baris dibangun HANYA dari questionIds, bukan urutan bank soal', () => {
    let persisted = ['q3', 'q1', 'q2'];
    // Bank soal kembali dengan urutan acak (listener baru setelah reload).
    const bank = [q('q1'), q('q2'), q('q3')];
    let rows = buildQuizQuestionRows(persisted, bank);
    assert.deepEqual(rows.map((r) => r.questionId), ['q3', 'q1', 'q2']);

    // Naik lewat tombol panah → satu write.
    persisted = moveQuestionIdAt(persisted, 2, -1);
    assert.deepEqual(persisted, ['q3', 'q2', 'q1']);

    // Turun lagi lewat tombol panah.
    persisted = moveQuestionIdAt(persisted, 1, 1);
    assert.deepEqual(persisted, ['q3', 'q1', 'q2']);

    // "Refresh": dokumen dibaca ulang, bank soal diacak urutannya.
    const bankAcak = [q('q2'), q('q3'), q('q1')];
    rows = buildQuizQuestionRows(persisted, bankAcak);
    assert.deepEqual(rows.map((r) => r.questionId), ['q3', 'q1', 'q2']);
    assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
  });

  it('drag jarak bebas juga bertahan setelah "refresh"', () => {
    const persisted = moveQuestionIdTo(['q1', 'q2', 'q3', 'q4'], 0, 3);
    assert.deepEqual(persisted, ['q2', 'q3', 'q4', 'q1']);
    const rows = buildQuizQuestionRows(persisted, [q('q1'), q('q2'), q('q3'), q('q4')]);
    assert.deepEqual(rows.map((r) => r.questionId), ['q2', 'q3', 'q4', 'q1']);
  });
});

// ===================================================================
// KARTU EDITOR — soal baru & Bank Soal SELALU DI BAWAH
// ===================================================================
describe('buildEditorCards — kartu baru append di belakang, bukan prepend', () => {
  const rowsOf = (list) => buildQuizQuestionRows(list, list.map(q));

  it('kartu baru tampil setelah semua soal tersimpan', () => {
    const cards = buildEditorCards(rowsOf(['q1', 'q2', 'q3']), [
      { questionId: 'new_1', realId: null, draft: {} }
    ]);
    assert.deepEqual(cards.map((c) => c.questionId), ['q1', 'q2', 'q3', 'new_1']);
  });

  it('kartu baru ditandai position null + draftIndex (tidak bisa dipetakan ke questionIds)', () => {
    const cards = buildEditorCards(rowsOf(['q1']), [
      { questionId: 'new_1', realId: null, draft: {} },
      { questionId: 'new_2', realId: null, draft: {} }
    ]);
    assert.equal(cards[0].position, 0);
    assert.equal(cards[1].position, null);
    assert.equal(cards[2].position, null);
    assert.equal(cards[1].draftIndex, 0);
    assert.equal(cards[2].draftIndex, 1);
  });

  it('"+ Soal Baru" =&gt; "Daftar soal" tetap urut dan soal baru tumbling di nomor terakhir', () => {
    const persisted = ['q1', 'q2'];
    const newCards = [];
    for (const n of [1, 2, 3]) {
      newCards.push({ questionId: `new_${n}`, realId: null, draft: {} });
    }
    const cards = buildEditorCards(rowsOf(persisted), newCards);
    assert.deepEqual(cards.map((c) => c.questionId), ['q1', 'q2', 'new_1', 'new_2', 'new_3']);
  });

  it('kartu baru TIDAK lompat posisi setelah autosave pertama (tetz tetap di bawah)', () => {
    // Sebelum create: kartu draft tampil di posisi 4.
    const before = buildEditorCards(rowsOf(['q1', 'q2', 'q3']), [
      { questionId: 'new_1', realId: null, draft: {} }
    ]);
    assert.deepEqual(before.map((c) => c.questionId), ['q1', 'q2', 'q3', 'new_1']);

    // Create berhasil: `appendQuestionIds` menaruh id baru di UJUNG questionIds,
    // dan entry draft disembunyikan begitu barisnya muncul di snapshot.
    const persisted = appendQuestionIds(['q1', 'q2', 'q3'], ['q4']);
    assert.deepEqual(persisted, ['q1', 'q2', 'q3', 'q4']);
    const after = buildEditorCards(rowsOf(persisted), [{ questionId: 'new_1', realId: 'q4', draft: {} }]);
    assert.deepEqual(after.map((c) => c.questionId), ['q1', 'q2', 'q3', 'q4']);
    assert.equal(after.length, 4, 'satu soal tidak boleh tampil dua kali');
  });

  it('Bank Soal juga append di belakang (satu util yang sama)', () => {
    const persisted = appendQuestionIds(['q1', 'q2'], ['q3', 'q4']);
    assert.deepEqual(persisted, ['q1', 'q2', 'q3', 'q4']);
    // Id yang sudah dipakai dilewati, tidak pernah jadi duplikat.
    assert.deepEqual(appendQuestionIds(persisted, ['q2', 'q5']), ['q1', 'q2', 'q3', 'q4', 'q5']);
  });

  it('soal yang hilang dari bank soal tidak hilang diam-diam dari daftar', () => {
    const rows = buildQuizQuestionRows(['q1', 'gone', 'q3'], [q('q1'), q('q3')]);
    const cards = buildEditorCards(rows, [{ questionId: 'new_1', realId: null, draft: {} }]);
    assert.deepEqual(cards.map((c) => c.questionId), ['q1', 'gone', 'q3', 'new_1']);
    assert.equal(cards[1].missing, true);
  });

  it('toleran terhadap input bukan array', () => {
    assert.deepEqual(buildEditorCards(null, null), []);
    assert.deepEqual(buildEditorCards(rowsOf(['q1']), undefined).map((c) => c.questionId), ['q1']);
  });
});

describe('cardKeyOf — kartu tidak remount setelah create', () => {
  it('kartu baru memakai id draft sebagai key, lalu key itu bertahan setelah id permanen masuk', () => {
    const draftRow = { position: null, questionId: 'new_1' };
    const savedRow = { position: 3, questionId: 'q4' };
    const draftKeyById = { q4: 'new_1' };

    assert.equal(cardKeyOf(draftRow, {}), 'new_1');
    // Tanpa alias, key berubah -> React remount -> state expanded hilang.
    assert.equal(cardKeyOf(savedRow, {}), 'q4');
    // Dengan alias, key sama persis -> React hanya memperbarui prop.
    assert.equal(cardKeyOf(savedRow, draftKeyById), 'new_1');
  });

  it('soal yang tidak pernah lewat kartu baru tetap memakai questionId', () => {
    assert.equal(cardKeyOf({ position: 0, questionId: 'q1' }, { q4: 'new_1' }), 'q1');
  });

  it('baris tanpa id tidak pernah jadi key kosong', () => {
    assert.equal(cardKeyOf({ position: null, questionId: null }, {}), '');
    assert.equal(cardKeyOf(null, {}), '');
  });
});

describe('cardMoveBounds — tidak ada tombol mati', () => {
  it('kartu tersimpan dibatasi questionIds', () => {
    const ctx = { questionIds: ['q1', 'q2', 'q3'], draftCount: 0 };
    assert.deepEqual(cardMoveBounds({ position: 0 }, ctx), { up: false, down: true });
    assert.deepEqual(cardMoveBounds({ position: 1 }, ctx), { up: true, down: true });
    assert.deepEqual(cardMoveBounds({ position: 2 }, ctx), { up: true, down: false });
  });

  it('kartu baru dibatasi blok kartu baru yang sedang tampil', () => {
    const ctx = { questionIds: ['q1', 'q2'], draftCount: 2 };
    assert.deepEqual(cardMoveBounds({ position: null, draftIndex: 0 }, ctx), { up: false, down: true });
    assert.deepEqual(cardMoveBounds({ position: null, draftIndex: 1 }, ctx), { up: true, down: false });
  });

  it('kartu baru sendirian tidak punya tombol hidup, dan indeks ngawur tidak menandai hidup', () => {
    const ctx = { questionIds: ['q1'], draftCount: 1 };
    assert.deepEqual(cardMoveBounds({ position: null, draftIndex: 0 }, ctx), { up: false, down: false });
    assert.deepEqual(cardMoveBounds({ position: null, draftIndex: 9 }, ctx), { up: false, down: false });
    assert.deepEqual(cardMoveBounds({ position: null, draftIndex: -1 }, ctx), { up: false, down: false });
  });
});

describe('moveDraftCard — geser kartu baru hanya di dalam bloknya', () => {
  const cards = (list) => list.map((c) => c.questionId);

  it('naik / turun menukar dua kartu baru', () => {
    const list = [
      { questionId: 'new_1', realId: null },
      { questionId: 'new_2', realId: null },
      { questionId: 'new_3', realId: null }
    ];
    assert.deepEqual(cards(moveDraftCard(list, 'new_2', -1)), ['new_2', 'new_1', 'new_3']);
    assert.deepEqual(cards(moveDraftCard(list, 'new_2', 1)), ['new_1', 'new_3', 'new_2']);
  });

  it('batas blok mengembalikan array yang SAMA (tidak ada write sia-sia)', () => {
    const list = [
      { questionId: 'new_1', realId: null },
      { questionId: 'new_2', realId: null }
    ];
    assert.equal(moveDraftCard(list, 'new_1', -1), list);
    assert.equal(moveDraftCard(list, 'new_2', 1), list);
    assert.equal(moveDraftCard(list, 'new_9', 1), list, 'kartu yang tidak ada tidak boleh digeser');
  });

  it('entri yang sedang disembunyikan tidak pernah ikut bergerak atau salah indeks', () => {
    // `new_1` sudah tertaut tapi barisnya belum tiba di snapshot: tidak dirender.
    const list = [
      { questionId: 'new_1', realId: 'q9' },
      { questionId: 'new_2', realId: null },
      { questionId: 'new_3', realId: null }
    ];
    const present = new Set(['q9']);
    const next = moveDraftCard(list, 'new_3', -1, present);
    assert.deepEqual(cards(next), ['new_1', 'new_3', 'new_2'], 'new_1 tetap di slotnya');
    // `draftIndex` di `buildEditorCards` juga mengabaikan entri tersembunyi,
    // jadi indeks tombol panah dan indeks yang digeser selalu sama.
    const rendered = buildEditorCards(buildQuizQuestionRows(['q1', 'q9'], [q('q1'), q('q9')]), list);
    assert.deepEqual(rendered.map((c) => c.questionId), ['q1', 'q9', 'new_2', 'new_3']);
    assert.equal(rendered[3].draftIndex, 1);
  });

  it('imutabel: input tidak pernah dimutasi', () => {
    const list = [
      { questionId: 'new_1', realId: null },
      { questionId: 'new_2', realId: null }
    ];
    const snapshot = JSON.stringify(list);
    moveDraftCard(list, 'new_1', 1);
    assert.equal(JSON.stringify(list), snapshot);
  });
});

describe('isDraftCardVisible — aturan hide dipakai bersama', () => {
  it('disembunyikan hanya kalau id permanennya sudah ada di snapshot', () => {
    const present = new Set(['q4']);
    assert.equal(isDraftCardVisible({ questionId: 'new_1', realId: null }, present), true);
    assert.equal(isDraftCardVisible({ questionId: 'new_1' }, present), true);
    assert.equal(isDraftCardVisible({ questionId: 'new_1', realId: 'q4' }, present), false);
    assert.equal(isDraftCardVisible({ questionId: 'new_1', realId: 'q5' }, present), true);
  });
});

// ===================================================================
// STATE & ERROR HANDLING EDITOR
// ===================================================================
describe('isValidQuizId / shouldNavigateAfterCreate', () => {
  it('id dokumen yang valid diterima', () => {
    assert.equal(isValidQuizId('abc123'), true);
    assert.equal(shouldNavigateAfterCreate('abc123'), true);
  });

  it('undefined / null / kosong / spasi / path ditolak (tak ada /quiz/undefined)', () => {
    for (const bad of [undefined, null, '', '   ', 42, 'a/b', 'a/b/c']) {
      assert.equal(isValidQuizId(bad), false, `harus ditolak: ${String(bad)}`);
      assert.equal(shouldNavigateAfterCreate(bad), false);
    }
  });

  it('pesan tanpa id menyuruh buka daftar kuis, bukan membuat kuis baru', () => {
    assert.match(CREATE_WITHOUT_ID_MESSAGE, /jangan buat kuis kedua/i);
    assert.match(CREATE_WITHOUT_ID_MESSAGE, /daftar kuis/i);
  });
});

describe('isPermissionError', () => {
  it('kode akses ditolak dikenali (termasuk App Check)', () => {
    for (const code of [
      'permission-denied',
      'unauthenticated',
      'insufficient-permission',
      'app-check/not-enabled',
      'app-check/not-allowed',
      'auth/invalid-appcheck-token'
    ]) {
      assert.equal(isPermissionError(code), true, code);
    }
  });

  it('kode lain (jaringan) BUKAN permission denied', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'internal', 'not-found', '', null, undefined]) {
      assert.equal(isPermissionError(code), false, String(code));
    }
  });
});

describe('resolveQuizEditorState', () => {
  it('loading mengalahkan semua yang lain (tak ada editor kosong saat loading)', () => {
    assert.equal(
      resolveQuizEditorState({ loading: true, error: 'boom', errorCode: 'permission-denied', quiz: null }),
      EDITOR_STATE.loading
    );
  });

  it('error permission → state permission', () => {
    assert.equal(
      resolveQuizEditorState({ loading: false, error: 'ditolak', errorCode: 'permission-denied' }),
      EDITOR_STATE.permission
    );
  });

  it('error lain (jaringan) → state error', () => {
    assert.equal(
      resolveQuizEditorState({ loading: false, error: 'timeout', errorCode: 'unavailable' }),
      EDITOR_STATE.error
    );
    // error tanpa kode (mis. error string dari toErrorMessage) tetap error.
    assert.equal(resolveQuizEditorState({ loading: false, error: 'boom' }), EDITOR_STATE.error);
  });

  it('tanpa error dan tanpa dokumen → not found, BUKAN editor kosong', () => {
    assert.equal(resolveQuizEditorState({ loading: false, quiz: null }), EDITOR_STATE.notFound);
    assert.equal(resolveQuizEditorState({ loading: false, data: null }), EDITOR_STATE.notFound);
  });

  it('dokumen ada → ready', () => {
    assert.equal(resolveQuizEditorState({ loading: false, quiz: { id: 'a' } }), EDITOR_STATE.ready);
  });

  it('argumen kosong tidak melempar (default aman)', () => {
    assert.equal(resolveQuizEditorState(), EDITOR_STATE.notFound);
    assert.equal(resolveQuizEditorState({}), EDITOR_STATE.notFound);
  });
});

describe('canRetryEditor', () => {
  it('error & permission bisa diulang', () => {
    assert.equal(canRetryEditor(EDITOR_STATE.error), true);
    assert.equal(canRetryEditor(EDITOR_STATE.permission), true);
  });

  it('loading & notFound TIDAK (mengulang tidak akan mengubah apa pun)', () => {
    assert.equal(canRetryEditor(EDITOR_STATE.loading), false);
    assert.equal(canRetryEditor(EDITOR_STATE.notFound), false);
    assert.equal(canRetryEditor(EDITOR_STATE.ready), false);
    assert.equal(canRetryEditor(undefined), false);
  });
});

describe('editorFailureMessage', () => {
  it('setiap state punya judul + deskripsi Bahasa Indonesia', () => {
    for (const state of [EDITOR_STATE.notFound, EDITOR_STATE.permission, EDITOR_STATE.error]) {
      const m = EDITOR_MESSAGES[state];
      assert.ok(m.title && m.title.length > 0, state);
      assert.ok(m.description && m.description.length > 20, state);
    }
  });

  it('datang dari "Buat Quiz" Identity, jangan buat kuis kedua', () => {
    for (const state of [EDITOR_STATE.error, EDITOR_STATE.permission]) {
      const m = editorFailureMessage(state, { justCreated: true });
      assert.match(m.description, /jangan membuat kuis kedua/i, state);
    }
  });

  it('dibuka dari daftar kuis → cukup ulangi, tanpa membuat kuis baru', () => {
    for (const state of [EDITOR_STATE.error, EDITOR_STATE.permission]) {
      const m = editorFailureMessage(state, { justCreated: false });
      assert.match(m.description, /tanpa membuat kuis baru/i, state);
      assert.doesNotMatch(m.description, /jangan membuat kuis kedua/i, state);
    }
  });

  it('notFound memakai teks dasar apa adanya (tidak menyebut pembuatan)', () => {
    const m = editorFailureMessage(EDITOR_STATE.notFound, { justCreated: true });
    assert.equal(m.title, EDITOR_MESSAGES[EDITOR_STATE.notFound].title);
    assert.equal(m.description, EDITOR_MESSAGES[EDITOR_STATE.notFound].description);
  });

  it('state tak dikenal jatuh ke pesan error, tidak pernah undefined', () => {
    const m = editorFailureMessage('entah', {});
    assert.equal(m.title, EDITOR_MESSAGES[EDITOR_STATE.error].title);
  });
});

// ===================================================================
// GUARD SUMBER — wiring di komponen (tanpa jsdom, render tidak bisa diuji)
// ===================================================================
describe('guard sumber: tombol panah + drag keduanya terpasang', () => {
  const card = read('src/features/quizzes/components/QuestionCard.jsx');
  const page = read('src/features/quizzes/components/QuizEditorPage.jsx');

  it('QuestionCard masih memakai drag-and-drop HTML5 native', () => {
    assert.match(card, /\bdraggable\b/);
    assert.match(card, /onDragStart=/);
    assert.match(card, /onDrop=/);
    assert.match(card, /dataTransfer\.setData/);
    assert.match(card, /onMove\?\./, 'drop harus memanggil onMove');
  });

  it('QuestionCard punya tombol panah naik/turun yang memanggil onMoveStep', () => {
    assert.match(card, /IconArrowUp/);
    assert.match(card, /IconArrowDown/);
    assert.match(card, /onClick=\{\(\) => onMoveStep\?\.\(-1\)\}/, 'tombol naik');
    assert.match(card, /onClick=\{\(\) => onMoveStep\?\.\(1\)\}/, 'tombol turun');
    assert.match(card, /aria-label=\{`Naikkan soal nomor/);
    assert.match(card, /aria-label=\{`Turunkan soal nomor/);
  });

  it('tombol panah mati di batas daftar (tidak ada tombol mati di tengah)', () => {
    assert.match(card, /disabled=\{!canMoveUp\}/);
    assert.match(card, /disabled=\{!canMoveDown\}/);
  });

  it('editor meneruskan batas + handler panah ke setiap kartu', () => {
    assert.match(page, /canMoveUp=\{bounds\.up\}/);
    assert.match(page, /canMoveDown=\{bounds\.down\}/);
    assert.match(page, /onMoveStep=\{isOwner \? \(delta\) => handleMoveStep\(row, delta\) : undefined\}/);
    assert.match(page, /onMove=\{isOwner \? handleReorder : undefined\}/);
  });

  it('kedua jalur memakai util yang sama, tanpa logika urutan sendiri', () => {
    // handleMoveStep → moveQuestionIdAt; handleReorder → moveQuestionIdTo.
    assert.match(page, /mutateIds\(moveQuestionIdAt\(quiz\.questionIds, row\.position, delta\)\)/);
    assert.match(page, /mutateIds\(moveQuestionIdTo\(quiz\.questionIds, fromCard\.position, toCard\.position\)\)/);
    // splice manual di dalam handler reorder = tanda logika kedua yang menumpuk.
    const reorder = page.slice(page.indexOf('const handleReorder'), page.indexOf('const handleMoveStep'));
    assert.doesNotMatch(reorder, /splice\(/, 'handleReorder tidak boleh punya splice sendiri');
  });

  it('indeks kartu (yang bisa berisi kartu baru) dipetakan ke position di questionIds', () => {
    assert.match(page, /fromCard\.position == null \|\| toCard\.position == null/);
    assert.match(page, /questionId=\{row\.position == null \? null : row\.questionId\}/);
  });
});

describe('guard sumber: alur create → editor', () => {
  const page = read('src/features/quizzes/components/QuizEditorPage.jsx');
  const list = read('src/features/quizzes/components/QuizListPage.jsx');
  const router = read('src/app/router.jsx');
  const route = read('src/features/quizzes/components/QuizRoutePage.jsx');
  const form = read('src/features/quizzes/components/QuizFormModal.jsx');
  const service = read('src/features/quizzes/services/quizService.js');

  it('createQuiz mengembalikan id dokumen yang sebenarnya', () => {
    assert.match(service, /export async function createQuiz\(spaceId, input\)/);
    assert.match(service, /return ref\.id;/, 'create harus mengembalikan ref.id');
  });

  it('form hanya memanggil onCreated setelah create benar-benar sukses', () => {
    const idx = form.indexOf('onCreated?.(id)');
    const catchIdx = form.indexOf('} catch (e) {');
    assert.ok(idx > 0, 'onCreated dipanggil');
    assert.ok(idx < catchIdx, 'onCreated harusnya SEBELUM catch (hanya jalur sukses)');
  });

  it('navigasi memakai id hasil create, bukan id yang ditulis manual', () => {
    assert.match(list, /navigate\(`\/quiz\/\$\{quizId\}`/);
    assert.match(list, /shouldNavigateAfterCreate\(quizId\)/);
    assert.match(list, /state: \{ justCreated: true \}/);
  });

  it('tidak ada quizId hardcoded di fitur quizzes', () => {
    for (const rel of [
      'src/features/quizzes/components/QuizEditorPage.jsx',
      'src/features/quizzes/components/QuizListPage.jsx',
      'src/features/quizzes/components/QuizFormModal.jsx'
    ]) {
      const src = read(rel);
      // Pola '/quiz/<literal>' selain template & '/quiz' daftar.
      const literals = src.match(/\/quiz\/[A-Za-z0-9_-]{6,}/g) || [];
      assert.deepEqual(literals, [], `${rel} punya path kuis hardcoded: ${literals}`);
    }
  });

  it('retry TIDAK pernah membuat kuis (editor tidak mengimpor createQuiz)', () => {
    assert.doesNotMatch(page, /createQuiz/);
  });

  it('editor punya state loading / loaded / notFound / permission / error / retry', () => {
    assert.match(page, /EDITOR_STATE\.loading/);
    assert.match(page, /editorState !== EDITOR_STATE\.ready/);
    assert.match(page, /canRetryEditor\(editorState\)/);
    assert.match(page, /Coba lagi/);
    assert.match(page, /Buka daftar kuis/);
    assert.match(page, /setReloadKey\(\(k\) => k \+ 1\)/, 'retry membaca ulang dokumen yang sama');
  });

  it('route /quiz/:quizId memilih tampilan dari kepemilikan kuis', () => {
    assert.match(router, /path="\/quiz\/:quizId"/);
    assert.match(router, /element=\{<QuizRoutePage \/>\}/);
    assert.doesNotMatch(router, /path="\/quiz\/:quizId" element=\{<QuizEditorPage/, 'editor tidak lagi dibuka langsung dari route');
    // Peserta tidak bisa memaksa masuk ke editor: percabangan ada di route page.
    assert.match(route, /quiz\.createdBy === user\?\.uid\) return <QuizEditorPage quiz=\{quiz\} \/>/);
    assert.match(route, /return <QuizParticipantPage quiz=\{quiz\} \/>/);
  });

  it('autosave kartu menulis ke ruang yang benar (spaceId diteruskan)', () => {
    const card = read('src/features/quizzes/components/QuestionCard.jsx');
    assert.match(card, /createQuestion\(spaceId, draft\)/);
    assert.match(card, /updateQuestion\(spaceId, persistedId, draft\)/);
    assert.match(page, /spaceId=\{spaceId\}/);
  });
});

describe('guard sumber: kartu soal sebagai unit yang jelas & tidak bergerak saat save', () => {
  const page = read('src/features/quizzes/components/QuizEditorPage.jsx');
  const card = read('src/features/quizzes/components/QuestionCard.jsx');

  it('kartu memakai kotak berbatas (bukan .card yang flatten)', () => {
    assert.doesNotMatch(card, /className="card py-3"/, 'kartu soal bukan elemen besar yang flatten');
    assert.match(card, /<li className="rounded-smc border border-line bg-panel/, 'kartu = border 1px + radius 6px + token existing');
  });

  it('penomoran memakai label mono uppercase "SOAL N"', () => {
    assert.match(card, /eyebrow shrink-0[^"]*text-ink">Soal \{index \+ 1\}/);
  });

  it('kartu tidak pakai shadow/gradient baru', () => {
    const li = (card.match(/<li className="([^"]*)"/) || [])[1] || '';
    assert.doesNotMatch(li, /shadow|gradient|glow/, `kartu harus tetap polos: ${li}`);
  });

  it('kartu memakai draft lokal sebagai sumber kebenaran setelah disentuh', () => {
    assert.match(card, /if \(locallyEditedRef\.current\) return;/, 'snapshot server tidak menimpa ketikan');
    assert.match(card, /if \(incomingKey === syncedKeyRef\.current\) return;/, 'snapshot identik tidak menyentuh state');
    assert.match(card, /locallyEditedRef\.current = true;/, 'patch menandai kartu sebagai sudah diedit');
  });

  it('id permanen disimpan di dalam kartu (create sekali, seterusnya update)', () => {
    assert.match(card, /const \[persistedId, setPersistedId\] = useState\(questionId\)/);
    assert.match(card, /setPersistedId\(newId\)/);
  });

  it('React key memakai cardKeyOf + draftKeyById (bukan questionId mentah)', () => {
    assert.match(page, /key=\{cardKeyOf\(row, draftKeyById\)\}/);
    assert.doesNotMatch(page, /key=\{row\.questionId\}/, 'key mentah = remount setelah create');
    assert.match(page, /setDraftKeyById\(\(prev\) => \(\{ \.\.\.prev, \[realId\]: cardKey \}\)\)/);
  });

  it('kartu baru disusun lewat buildEditorCards (append, bukan spread manual)', () => {
    assert.match(page, /buildEditorCards\(rows, newCards\)/);
    assert.doesNotMatch(page, /\.\.\.newCards\.map\(/, 'kartu baru tidak boleh disusun manual di halaman');
  });

  it('kartu baru punya realId null + batas panah lewat util yang sama', () => {
    assert.match(page, /realId: null/);
    assert.match(page, /moveDraftCard\(newCards, row\.questionId, delta, presentIds\)/);
    assert.match(page, /cardMoveBounds\(row, \{ questionIds: quiz\?\.questionIds, draftCount \}\)/);
    assert.doesNotMatch(page, /moveItemAt/, 'halaman tidak boleh punya logika geser kedua');
  });

  it('daftar soal punya jarak antar kartu yang jelas', () => {
    assert.match(page, /<ul className="space-y-3">/);
  });
});

describe('guard sumber: Bank Soal /questions tidak ikut berubah pola', () => {
  it('QuestionBankPage masih memakai QuestionFormModal', () => {
    const bank = read('src/features/questions/components/QuestionBankPage.jsx');
    assert.match(bank, /<QuestionFormModal/);
    assert.doesNotMatch(bank, /from '..\/..\/quizzes/, 'halaman bank soal tidak mengimpor fitur quizzes');
  });

  it('QuestionFormModal tidak mengimpor kartu editor kuis', () => {
    const modal = read('src/features/questions/components/QuestionFormModal.jsx');
    assert.doesNotMatch(modal, /quizzes\//);
  });
});
