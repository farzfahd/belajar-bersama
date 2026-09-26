/* eslint-disable no-console */
// Test Security Rules dengan Firebase Emulator (Firestore).
// Jalankan:  npm run test:rules  (intern: firebase emulators:exec --only firestore ...)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteField,
  where,
  writeBatch
} from 'firebase/firestore';


const PROJECT_ID = 'demo-learning-berdua';
// Memanggil ctx.firestore() berkali-kali pada context sama memicu
// "Firestore has already been started..." di rules-unit-testing 3.0.4.
// Satu instance per context, dipakai ulang.
const fsDb = (() => {
  const cache = new WeakMap();
  return (c) => {
    if (!cache.has(c)) cache.set(c, c.firestore());
    return cache.get(c);
  };
})();

let testEnv;
let failed = 0;
let total = 0;

function authenticated(uid, opts = {}) {
  return testEnv.authenticatedContext(uid, { email_verified: true, ...opts });
}
const unauthed = () => testEnv.unauthenticatedContext();

function it(name, fn) {
  total += 1;
  return Promise.resolve()
    .then(fn)
    .then(
      () => console.log(`[OK]   ${name}`),
      (err) => {
        failed += 1;
        console.log(`[FAIL] ${name}\n       -> ${err.message?.split('\n')[0] || err}`);
      }
    );
}

// ---- sekumpulan data awal bahan tes (ditulis dengan rules off) ----
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = new Date();

    const set = (path, data) => setDoc(doc(db, ...path.split('/')), data);

    await set('users/alice', {
      displayName: 'Alice',
      avatar: '',
      color: '#2fd6e8',
      spaceId: 'space1',
      schemaVersion: 1
    });
    await set('users/bob', {
      displayName: 'Bob',
      avatar: '',
      color: '#a48bfb',
      spaceId: 'space1',
      schemaVersion: 1
    });

    await set('spaces/space1', {
      name: 'Ruang A',
      memberIds: ['alice', 'bob'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });

    const note = (o) => ({
      title: o.title,
      body: o.body || '',
      topicId: 'topic1',
      tags: [],
      description: '',
      status: 'draft',
      difficulty: 'beginner',
      visibility: 'private',
      ownerId: 'alice',
      commentCount: 0,
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
      ...o
    });

    await set('spaces/space1/notes/n_shared', note({ title: 'Shared', visibility: 'shared' }));
    await set('spaces/space1/notes/n_priv', note({ title: 'Private' }));
    await set('spaces/space1/notes/n_deleted_shared', note({ title: 'Del', visibility: 'shared', deletedAt: new Date() }));
    await set('spaces/space1/notes/n_todel', note({ title: 'Todel' }));
    await set('spaces/space1/notes/n_extra', note({ title: 'Extra', visibility: 'shared' }));
    await set('spaces/space1/notes/n_priv2', note({ title: 'Private 2' }));

    // state catatan: n_priv -> private, n_shared -> shared
    await set('spaces/space1/noteStates/n_priv_alice', {
      noteId: 'n_priv',
      uid: 'alice',
      noteVisibility: 'private',
      bookmarked: true,
      understood: false,
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('spaces/space1/noteStates/n_shared_alice', {
      noteId: 'n_shared',
      uid: 'alice',
      noteVisibility: 'shared',
      bookmarked: true,
      understood: false,
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });

    await set('spaces/space1/topics/topic1', {
      title: 'Matematika',
      description: '',
      icon: '📐',
      color: '#2fd6e8',
      parentId: null,
      level: 0,
      order: 0,
      status: 'learning',
      difficulty: 'beginner',
      createdBy: 'alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });

    await set('spaces/space1/resources/r_shared', {
      title: 'Wiki Bayes',
      author: '',
      type: 'website',
      url: 'https://en.wikipedia.org/wiki/Bayes',
      topicId: 'topic1',
      difficulty: 'beginner',
      estimatedMinutes: 10,
      tags: [],
      description: '',
      visibility: 'shared',
      addedBy: 'alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('spaces/space1/resources/r_priv', {
      title: 'Priv',
      author: '',
      type: 'pdf',
      url: 'https://example.org/x.pdf',
      topicId: 'topic1',
      difficulty: 'beginner',
      estimatedMinutes: 5,
      tags: [],
      description: '',
      visibility: 'private',
      addedBy: 'alice',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });

    await set('spaces/space3', {
      name: 'Ruang Join',
      memberIds: ['eve'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('users/eve', {
      displayName: 'Eve',
      avatar: '',
      color: '#39e0a4',
      spaceId: 'space3',
      schemaVersion: 1
    });

    for (const [uid, name, color] of [
      ['dave', 'Dave', '#4f8bd6'],
      ['frank', 'Frank', '#c47b4a'],
      ['grace', 'Grace', '#8a72c4'],
      ['zoe', 'Zoe', '#4f9b78'],
      ['wati', 'Wati', '#b36b9a'],
      ['xenia', 'Xenia', '#7c8b55'],
      ['stale', 'Stale', '#8a8a8a']
    ]) {
      await set(`users/${uid}`, {
        displayName: name,
        avatar: '',
        color,
        spaceId: null,
        schemaVersion: 1
      });
    }
    await set('users/stale', {
      displayName: 'Stale',
      avatar: '',
      color: '#8a8a8a',
      spaceId: 'missing-space',
      schemaVersion: 1
    });

    await set('invites/invite_ok_12345678901234567890', {
      code: 'invite_ok_12345678901234567890',
      spaceId: 'space3',
      spaceName: 'Ruang Join',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: false,
      usedBy: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      schemaVersion: 1
    });
    await set('invites/invite_expired_12345678901234567890', {
      code: 'invite_expired_12345678901234567890',
      spaceId: 'space4',
      spaceName: 'Ruang Kedaluwarsa',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: false,
      usedBy: null,
      usedAt: null,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      schemaVersion: 1
    });
    await set('invites/invite_used_12345678901234567890', {
      code: 'invite_used_12345678901234567890',
      spaceId: 'space3',
      spaceName: 'Ruang Join',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: true,
      usedBy: 'dave',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      schemaVersion: 1
    });
    await set('invites/invite_other_space_12345678901234567890', {
      code: 'invite_other_space_12345678901234567890',
      spaceId: 'space5',
      spaceName: 'Ruang Salah',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: false,
      usedBy: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      schemaVersion: 1
    });
    await set('spaces/space4', {
      name: 'Ruang Kedaluwarsa',
      memberIds: ['eve'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('spaces/space5', {
      name: 'Ruang Salah',
      memberIds: ['eve'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('spaces/space6', {
      name: 'Ruang Replay',
      memberIds: ['eve'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('invites/invite_replay_12345678901234567890', {
      code: 'invite_replay_12345678901234567890',
      spaceId: 'space6',
      spaceName: 'Ruang Replay',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: false,
      usedBy: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      schemaVersion: 1
    });

    // Bahan uji CP-INVITE (buat kode undangan).
    // Nama ruang sengaja berspasi ganda: client wajib mengirim nama APA ADANYA
    // supaya sama dengan dokumen ini (rules membandingkan kesamaan persis).
    await set('spaces/space_unik', {
      name: 'Ruang  Bersama  Uji',
      memberIds: ['hana'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('users/hana', {
      displayName: 'Hana',
      avatar: '',
      color: '#4f9b78',
      spaceId: 'space_unik',
      schemaVersion: 1
    });
    // Nama melebihi batas skema (60): hanya mungkin bila dokumen diubah di luar
    // aplikasi. Dipakai membuktikan invite untuk ruang ini HARUS ditolak rules
    // (baik dikirim verbatim maupun setelah dipotong) → service menolak lokal.
    await set('spaces/space_panjang', {
      name: 'Nama Ruang Yang Sengaja Dibuat Sangat Panjang Melebihi Batas Skema Aplikasi',
      memberIds: ['ivan'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('users/ivan', {
      displayName: 'Ivan',
      avatar: '',
      color: '#7c8b55',
      spaceId: 'space_panjang',
      schemaVersion: 1
    });
    // Ruang sudah penuh (2 anggota) → tidak boleh ada invite lagi.
    await set('spaces/space_penuh', {
      name: 'Ruang Penuh',
      memberIds: ['zoe', 'wati'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });

    // Bahan uji CP0 (keluar dari ruang): pemilik lina, partner budi.
    // Fixture terpisah agar uji leave tidak mengubah ruang lain (space1, dst).
    await set('spaces/space_leave', {
      name: 'Ruang Leave',
      memberIds: ['lina', 'budi'],
      createdAt: serverTimestamp(),
      schemaVersion: 1
    });
    await set('users/lina', {
      displayName: 'Lina',
      avatar: '',
      color: '#4f9b78',
      spaceId: 'space_leave',
      schemaVersion: 1
    });
    await set('users/budi', {
      displayName: 'Budi',
      avatar: '',
      color: '#c47b4a',
      spaceId: 'space_leave',
      schemaVersion: 1
    });
    // Konten shared di ruang itu: wajib TETAP ADA setelah partner keluar.
    await set('spaces/space_leave/notes/n_leave', {
      title: 'Catatan Shared',
      body: 'Tetap milik ruang setelah partner keluar.',
      topicId: '',
      tags: [],
      description: '',
      status: 'draft',
      difficulty: 'beginner',
      visibility: 'shared',
      ownerId: 'lina',
      commentCount: 0,
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1
    });
  });
}

async function main() {
  const rules = readFileSync('firestore.rules', 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules }
  });
  // WAJIB: hapus data sisa run sebelumnya. testEnv.cleanup() di akhir hanya
  // membuang konteks/app, TIDAK menghapus dokumen, sehingga tanpa ini suite
  // hanya lulus di emulator yang benar-benar kosong: dokumen sisa (mis.
  // users/zoe, spaces/z2, invites terpakai) membuat assertSucceeds gagal.
  await testEnv.clearFirestore();
  await seed();

  const alice = authenticated('alice');
  const bob = authenticated('bob');
  const anon = unauthed();

  // ============ 1. User tanpa login ============
  await it('user tanpa login ditolak membaca apa pun', async () => {
    await assertFails(getDoc(doc(fsDb(anon), 'spaces/space1')));
    await assertFails(getDoc(doc(fsDb(anon), 'spaces/space1/notes/n_shared')));
    await assertFails(getDoc(doc(fsDb(anon), 'users/alice')));
  });
  await it('user tanpa login ditolak menulis', async () => {
    await assertFails(setDoc(doc(fsDb(anon), 'users/x'), { displayName: 'x', avatar: '', color: '#111', spaceId: null, schemaVersion: 1 }));
  });
  await it('profil sendiri dapat dibuat dengan field terbatas', async () => {
    const newbie = authenticated('newbie');
    await assertSucceeds(setDoc(doc(fsDb(newbie), 'users/newbie'), {
      displayName: 'Newbie', avatar: '', color: '#4f8bd6', spaceId: null, schemaVersion: 1
    }));
    await assertFails(setDoc(doc(fsDb(newbie), 'users/empty-name'), {
      displayName: '', avatar: '', color: '#4f8bd6', spaceId: null, schemaVersion: 1
    }));
  });
  await it('profil wajib ada sebelum membuat space', async () => {
    const carol = authenticated('carol');
    await assertFails(setDoc(doc(fsDb(carol), 'spaces/no-profile'), {
      name: 'Tanpa profil', memberIds: ['carol'], createdAt: serverTimestamp(), schemaVersion: 1
    }));
  });
  await it('profil sendiri tidak bisa dihapus', async () => {
    const aliceAgain = authenticated('alice');
    await assertFails(deleteDoc(doc(fsDb(aliceAgain), 'users/alice')));
  });
  await it('tautan profil ke space yang hilang dapat dipulihkan', async () => {
    const stale = authenticated('stale');
    await assertSucceeds(updateDoc(doc(fsDb(stale), 'users/stale'), { spaceId: null }));
  });
  await it('profile tidak bisa menaut ke space yang bukananggota', async () => {
    const xenia = authenticated('xenia');
    await assertFails(updateDoc(doc(fsDb(xenia), 'users/xenia'), { spaceId: 'space1' }));
  });

  // ============ 2. Keanggotaan space ============
  await it('anggota membaca space', async () => {
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1')));
  });
  await it('akun ketiga (non-anggota) ditolak membaca/akses space', async () => {
    const carol = authenticated('carol');
    await assertFails(getDoc(doc(fsDb(carol), 'spaces/space1')));
    await assertFails(getDoc(doc(fsDb(carol), 'spaces/space1/topics/topic1')));
    await assertFails(getDoc(doc(fsDb(carol), 'users/alice')));
    await assertFails(setDoc(doc(fsDb(carol), 'spaces/space1/topics/t' + Date.now()), {
      title: 'Hack', description: '', icon: '', color: '#000', parentId: null, level: 0,
      order: 99, status: 'learning', difficulty: 'beginner', createdBy: 'carol',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1
    }));
  });

  // ============ 3. Visibility note ============
  await it('partner BISA membaca note shared', async () => {
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/notes/n_shared')));
  });
  await it('note private: partner DITOLAK membacanya langsung (getDoc)', async () => {
    // Privasi ditegakkan rules, bukan disembunyikan di UI: memanggil
    // SDK Firestore langsung (mis. dari console browser) ikut ditolak.
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/notes/n_priv')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/notes/n_priv')));
  });
  await it('note shared yang di-soft-delete: partner DITOLAK, owner boleh', async () => {
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/notes/n_deleted_shared')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/notes/n_deleted_shared')));
  });
  await it('LIST notes: query polos ditolak; dual-listener hanya mengembalikan yang boleh', async () => {
    // Tanpa where-clause, rules tidak bisa dibuktikan -> DENY (bukan disaring).
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/notes')));
    await assertFails(getDocs(collection(fsDb(alice), 'spaces/space1/notes')));

    // Branch 1: shared & belum di-soft-delete.
    const sharedBranch = (db) =>
      query(collection(db, 'spaces/space1/notes'), where('visibility', '==', 'shared'), where('deletedAt', '==', null));
    const bobShared = await getDocs(sharedBranch(fsDb(bob)));
    assert.deepEqual(bobShared.docs.map((d) => d.id), ['n_extra', 'n_shared']);
    const aliceShared = await getDocs(sharedBranch(fsDb(alice)));
    assert.deepEqual(aliceShared.docs.map((d) => d.id), ['n_extra', 'n_shared']);

    // Branch 2: milik sendiri (termasuk private & isi Sampah).
    const ownBranch = (db) => query(collection(db, 'spaces/space1/notes'), where('ownerId', '==', 'alice'));
    const aliceOwn = await getDocs(ownBranch(fsDb(alice)));
    assert.deepEqual(
      aliceOwn.docs.map((d) => d.id).sort(),
      ['n_deleted_shared', 'n_extra', 'n_priv', 'n_priv2', 'n_shared', 'n_todel']
    );
    const bobOwn = await getDocs(query(collection(fsDb(bob), 'spaces/space1/notes'), where('ownerId', '==', 'bob')));
    assert.deepEqual(bobOwn.docs.map((d) => d.id), []);

    // Non-anggota tetap ditolak meski query-nya benar.
    const carol = authenticated('carol');
    await assertFails(getDocs(sharedBranch(fsDb(carol))));
  });
  await it('partner ditolak update/hapus note milik alice (private maupun shared)', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/notes/n_shared'), { title: 'Bob edit' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/notes/n_shared')));
  });
  await it('owner bisa soft-delete note miliknya', async () => {
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/notes/n_todel'), { deletedAt: new Date() }));
  });
  await it('noteReports hanya bisa dibuat pembaca note shared dan dibaca pelapor/pemilik', async () => {
    const report = {
      noteId: 'n_shared', reporterId: 'bob', type: 'error', message: 'Ada rumus yang keliru.',
      createdAt: serverTimestamp(), schemaVersion: 1
    };
    await assertSucceeds(setDoc(doc(fsDb(bob), 'spaces/space1/noteReports/report_bob'), report));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/noteReports/report_bob')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/noteReports/report_bob')));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/noteReports/report_alice'), {
      ...report, reporterId: 'bob'
    }));
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/noteReports/report_private'), {
      ...report, noteId: 'n_priv'
    }));
    const carol = authenticated('carol');
    await assertFails(setDoc(doc(fsDb(carol), 'spaces/space1/noteReports/report_carol'), {
      ...report, reporterId: 'carol'
    }));
  });

  // ============ 4. Validasi pembuatan note ============
  const validNote = {
    title: 'Note valid',
    body: '',
    topicId: 'topic1',
    tags: [],
    description: '',
    status: 'draft',
    difficulty: 'beginner',
    visibility: 'shared',
    ownerId: 'alice',
    commentCount: 0,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1
  };
  await it('ownerId harus = diri sendiri saat create', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/notes/ok_own'), { ...validNote }));
    const hijack = { ...validNote, id: 'no' };
    void hijack;
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_owner'), { ...validNote, ownerId: 'bob' }));
  });
  await it('field immutable (ownerId, createdAt) tidak bisa diubah', async () => {
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/notes/ok_own'), { ownerId: 'bob' }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/notes/ok_own'), { createdAt: new Date() }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/notes/ok_own'), { title: 'Ganti judul' }));
  });
  await it('validasi panjang/tipe field note ditolak', async () => {
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_long'), { ...validNote, title: 'x'.repeat(201) }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_body'), { ...validNote, body: 'x'.repeat(100001) }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_enum'), { ...validNote, status: 'nonsense' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_tags'), { ...validNote, tags: ['duplikat', 'duplikat'] }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/notes/bad_comment'), { ...validNote, commentCount: 5 }));
  });

  // ============ 5. Topics ============
  const validTopic = {
    title: 'Topik baru',
    description: '',
    icon: '📘',
    color: '#2fd6e8',
    parentId: 'topic1',
    level: 1,
    order: 1,
    status: 'learning',
    difficulty: 'intermediate',
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1
  };
  await it('kedua anggota boleh CRUD topic; createdBy/createdAt immutable', async () => {
    await assertSucceeds(setDoc(doc(fsDb(bob), 'spaces/space1/topics/t2'), { ...validTopic, createdBy: 'bob' }));
    await assertSucceeds(updateDoc(doc(fsDb(bob), 'spaces/space1/topics/t2'), { title: 'Diubah bob' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/topics/t2'), { createdBy: 'alice' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/topics/t2'), { createdAt: new Date() }));
    await assertSucceeds(deleteDoc(doc(fsDb(bob), 'spaces/space1/topics/t2')));
  });
  await it('level tanpa parent (level 0) & level tanpa induk (>=1) ditolak', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t0'), { ...validTopic, level: 0, parentId: null, order: 9 }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/bad_lvl'), { ...validTopic, level: 0, parentId: 'topic1' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/bad_parent'), { ...validTopic, level: 1, parentId: null }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/bad_lvl2'), { ...validTopic, level: 3 }));
  });
  await it('induk topik harus ADA dan persis satu level di atas (validParent)', async () => {
    // topic1 = level 0, jadi level 1 (parentId topic1) & level 0 (null) valid.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t_lvl1_ok'),
      { ...validTopic, level: 1, parentId: 'topic1', createdBy: 'alice' }));
    // level 1 tapi induknya level 1 juga (bukan satu level di atas) -> tolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t_skip_level'),
      { ...validTopic, level: 1, parentId: 't_lvl1_ok', createdBy: 'alice' }));
    // level 2 dengan induk level 0 (lompat level) -> tolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t_skip_up'),
      { ...validTopic, level: 2, parentId: 'topic1', createdBy: 'alice' }));
    // induk tidak ada -> tolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t_no_parent'),
      { ...validTopic, level: 1, parentId: 'hantu', createdBy: 'alice' }));
    // topik jadi induk dirinya sendiri -> tolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topics/t_self'),
      { ...validTopic, level: 1, parentId: 't_self', createdBy: 'alice' }));
    // UPDATE juga divalidasi: memindahkan topic ke induk yang tidak ada -> tolak
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/topics/t_lvl1_ok'), { parentId: 'hantu' }));
    // ...ke induk yang benar (pindah sibling) -> boleh
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/topics/t_lvl1_ok'),
      { parentId: 't0', level: 1, order: 0 }));
  });
  await it('batch template 3 level (parent dibuat di batch yang sama) tetap boleh', async () => {
    const batch = writeBatch(fsDb(alice));
    const col = collection(fsDb(alice), 'spaces/space1/topics');
    const mathId = doc(col).id;
    const probId = doc(col).id;
    const bayesId = doc(col).id;
    const mk = (id, data) => batch.set(doc(col, id),
      { ...validTopic, createdBy: 'alice', ...data });
    mk(mathId, { title: 'Math', level: 0, parentId: null, order: 0 });
    mk(probId, { title: 'Prob', level: 1, parentId: mathId, order: 0 });
    mk(bayesId, { title: 'Bayes', level: 2, parentId: probId, order: 0 });
    await assertSucceeds(batch.commit());
  });

  // ============ 6. noteStates ============
  // noteVisibility = salinan visibilitas note; rules memverifikasi ulang
  // nilainya, jadi tidak bisa dipalsukan client.
  const stateFor = (noteId, uid, o = {}) => ({
    noteId,
    uid,
    noteVisibility: noteId.startsWith('n_priv') ? 'private' : 'shared',
    bookmarked: false,
    understood: false,
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });
  await it('user TIDAK bisa menulis state milik user lain', async () => {
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_shared_bob'), stateFor('n_shared', 'bob')));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_extra_alice'), stateFor('n_extra', 'alice')));
  });
  await it('update/delete state hanya pemilik stateId', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_shared_alice'), { bookmarked: true }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_shared_alice'), { bookmarked: true }));
    await assertSucceeds(setDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_shared_bob'), stateFor('n_shared', 'bob')));
    await assertFails(deleteDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_shared_bob')));
    await assertSucceeds(deleteDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_shared_bob')));
  });
  await it('tidak bisa membuat state di note yang tidak terlihat (private)', async () => {
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_priv_bob'), stateFor('n_priv', 'bob')));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_priv2_alice'), stateFor('n_priv2', 'alice')));
  });
  await it('noteVisibility tidak bisa dipalsukan (harus cocok dengan note)', async () => {
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_shared_bob_palsu'),
      stateFor('n_shared', 'bob', { noteVisibility: 'private' })));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_shared_alice'),
      { noteVisibility: 'private' }));
  });
  await it('state pada note PRIVATE partner TIDAK bisa dibaca', async () => {
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_priv_alice')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_priv_alice')));
  });
  await it('state pada note shared boleh dibaca kedua anggota', async () => {
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_shared_alice')));
  });
  await it('LIST noteStates: dual-listener (uid sendiri + noteVisibility shared)', async () => {
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/noteStates')));
    const own = await getDocs(query(collection(fsDb(bob), 'spaces/space1/noteStates'), where('uid', '==', 'bob')));
    assert.deepEqual(own.docs.map((d) => d.id), []);
    const shared = await getDocs(query(collection(fsDb(bob), 'spaces/space1/noteStates'), where('noteVisibility', '==', 'shared')));
    assert.deepEqual(shared.docs.map((d) => d.id).sort(), ['n_extra_alice', 'n_shared_alice']);
    const aliceOwn = await getDocs(query(collection(fsDb(alice), 'spaces/space1/noteStates'), where('uid', '==', 'alice')));
    assert.deepEqual(
      aliceOwn.docs.map((d) => d.id).sort(),
      ['n_extra_alice', 'n_priv2_alice', 'n_priv_alice', 'n_shared_alice']
    );
  });
  // Diuji setelah tes LIST di atas karena tes ini mengubah visibility state.
  await it('noteVisibility boleh disinkronkan saat owner mengubah visibilitas nota', async () => {
    // nota private + state private milik alice
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/notes/n_flip'),
      { ...validNote, title: 'Flip', visibility: 'private' }));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_flip_alice'),
      stateFor('n_flip', 'alice', { noteVisibility: 'private' })));
    // partner tidak boleh membaca state pada nota private
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_flip_alice')));
    // owner menjadikan nota shared
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/notes/n_flip'), { visibility: 'shared' }));
    // state lama (masih 'private') tetap tertutup untuk partner
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_flip_alice')));
    // owner boleh menyinkronkan salinannya -> toggle bookmark tidak ditolak selamanya
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_flip_alice'),
      { noteVisibility: 'shared', bookmarked: true }));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/noteStates/n_flip_alice')));
    // nilai yang tidak cocok dengan nota asli tetap ditolak
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/noteStates/n_flip_alice'),
      { noteVisibility: 'private' }));
  });

  // ============ 7. resourceStates ============
  const rstateFor = (resourceId, uid, o = {}) => ({
    resourceId,
    uid,
    resourceVisibility: resourceId === 'r_priv' ? 'private' : 'shared',
    status: 'reading',
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });
  await it('resourceStates: pola sama seperti noteStates', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_shared_alice'),
      rstateFor('r_shared', 'alice')));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_shared_bob'),
      rstateFor('r_shared', 'bob')));
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_priv_bob'),
      rstateFor('r_priv', 'bob')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_shared_alice')));
  });
  await it('resourceVisibility tidak bisa dipalsukan', async () => {
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_shared_bob_palsu'),
      rstateFor('r_shared', 'bob', { resourceVisibility: 'private' })));
  });
  await it('status pada resource PRIVATE partner TIDAK bisa dibaca', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_priv_alice'),
      rstateFor('r_priv', 'alice')));
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_priv_alice')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_priv_alice')));
  });
  await it('LIST resourceStates: dual-listener (uid sendiri + resourceVisibility shared)', async () => {
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/resourceStates')));
    const own = await getDocs(query(collection(fsDb(bob), 'spaces/space1/resourceStates'), where('uid', '==', 'bob')));
    assert.deepEqual(own.docs.map((d) => d.id), []);
    const shared = await getDocs(query(collection(fsDb(bob), 'spaces/space1/resourceStates'), where('resourceVisibility', '==', 'shared')));
    assert.deepEqual(shared.docs.map((d) => d.id), ['r_shared_alice']);
  });

  // ============ 8. Resources ============
  const validResource = {
    title: 'Res valid',
    author: '',
    type: 'website',
    url: 'https://example.org',
    topicId: 'topic1',
    difficulty: 'beginner',
    estimatedMinutes: 5,
    tags: [],
    description: '',
    visibility: 'shared',
    addedBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1
  };
  await it('resource private: partner DITOLAK membacanya langsung', async () => {
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/resources/r_priv')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/resources/r_priv')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/resources/r_shared')));
  });
  await it('LIST resources: query polos ditolak; dual-listener hanya yang boleh', async () => {
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/resources')));
    await assertFails(getDocs(collection(fsDb(alice), 'spaces/space1/resources')));
    const bobShared = await getDocs(query(collection(fsDb(bob), 'spaces/space1/resources'), where('visibility', '==', 'shared')));
    assert.deepEqual(bobShared.docs.map((d) => d.id), ['r_shared']);
    const bobOwn = await getDocs(query(collection(fsDb(bob), 'spaces/space1/resources'), where('addedBy', '==', 'bob')));
    assert.deepEqual(bobOwn.docs.map((d) => d.id), []);
    const aliceOwn = await getDocs(query(collection(fsDb(alice), 'spaces/space1/resources'), where('addedBy', '==', 'alice')));
    assert.deepEqual(aliceOwn.docs.map((d) => d.id).sort(), ['r_priv', 'r_shared']);
  });
  await it('create/edit/hapus resource hanya addedBy (owner)', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/resources/r_shared'), { title: 'x' }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/resources/r_shared'), { title: 'oke' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/resources/r_shared')));
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/resources/r_bob_owned'), { ...validResource, addedBy: 'alice' }));
  });
  await it('URL resource wajib http/https', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resources/ok_url'), validResource));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/bad_js'), { ...validResource, url: 'javascript:alert(1)' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/bad_data'), { ...validResource, url: 'data:text/html,x' }));
  });
  await it('URL resource harus punya host (selaras dgn isHttpUrl client)', async () => {
    // host kosong / mulai dengan karakter non-host -> ditolak rules & client
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_nohost'), { ...validResource, url: 'https://' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_port_only'), { ...validResource, url: 'https://:80' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_slash'), { ...validResource, url: 'https:///path' }));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_space'), { ...validResource, url: 'https://ex ample.org' }));
    // host sah tetap boleh: punycode, IP, port, path, query, dan huruf besar
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_idn'),
      { ...validResource, url: 'https://xn--maana-pta.com/paper?x=1' }));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_ip'),
      { ...validResource, url: 'http://192.168.1.5:8080/a' }));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resources/u_upper'),
      { ...validResource, url: 'HTTPS://Example.ORG/Docs' }));
    // update ikut divalidasi
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/resources/ok_url'), { url: 'https://:80' }));
  });
  await it('resourceVisibility boleh disinkronkan saat owner mengubah visibilitas resource', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resources/r_flip'),
      { ...validResource, title: 'Flip', visibility: 'private' }));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_flip_alice'),
      rstateFor('r_flip', 'alice', { resourceVisibility: 'private' })));
    // partner tidak boleh membaca status pada resource private
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_flip_alice')));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/resources/r_flip'), { visibility: 'shared' }));
    // state lama masih 'private' -> tetap tertutup untuk partner
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_flip_alice')));
    // owner boleh menyinkronkan salinannya (ubah status tidak ditolak selamanya)
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_flip_alice'),
      { resourceVisibility: 'shared', status: 'completed' }));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/resourceStates/r_flip_alice')));
    // nilai yang tidak cocok dengan resource asli tetap ditolak
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/resourceStates/r_flip_alice'),
      { resourceVisibility: 'private' }));
  });

  // ============ 9. Spasi & join via invite ============
  await it('invite tidak bisa di-list', async () => {
    await assertFails(getDocs(query(collection(fsDb(alice), 'invites'))));
    await assertFails(getDocs(query(collection(fsDb(bob), 'invites'))));
  });
  await it('invite bisa di-get user terverifikasi; non-login ditolak', async () => {
    await assertSucceeds(getDoc(doc(fsDb(alice), 'invites/invite_ok_12345678901234567890')));
    await assertFails(getDoc(doc(fsDb(anon), 'invites/invite_ok_12345678901234567890')));
  });
  await it('join valid menulis anggota, konsumsi invite, dan menautkan profil', async () => {
    const dave = authenticated('dave');
    const batch = writeBatch(fsDb(dave));
    batch.update(doc(fsDb(dave), 'spaces/space3'), {
      memberIds: ['eve', 'dave'],
      _joinCode: 'invite_ok_12345678901234567890'
    });
    batch.update(doc(fsDb(dave), 'invites/invite_ok_12345678901234567890'), {
      used: true,
      usedBy: 'dave',
      usedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(doc(fsDb(dave), 'users/dave'), { spaceId: 'space3' }));
  });
  await it('invite yang sama tidak bisa dipakai dua kali', async () => {
    const frank = authenticated('frank');
    const firstBatch = writeBatch(fsDb(frank));
    firstBatch.update(doc(fsDb(frank), 'spaces/space6'), {
      memberIds: ['eve', 'frank'],
      _joinCode: 'invite_replay_12345678901234567890'
    });
    firstBatch.update(doc(fsDb(frank), 'invites/invite_replay_12345678901234567890'), {
      used: true,
      usedBy: 'frank',
      usedAt: serverTimestamp()
    });
    await assertSucceeds(firstBatch.commit());
    await assertSucceeds(updateDoc(doc(fsDb(frank), 'users/frank'), { spaceId: 'space6' }));

    const grace = authenticated('grace');
    await assertFails(updateDoc(doc(fsDb(grace), 'spaces/space6'), {
      memberIds: ['eve', 'frank', 'grace'],
      _joinCode: 'invite_replay_12345678901234567890'
    }));
  });
  await it('join dengan invite kedaluwarsa ditolak', async () => {
    const grace = authenticated('grace');
    await assertFails(updateDoc(doc(fsDb(grace), 'spaces/space4'), {
      memberIds: ['eve', 'grace'],
      _joinCode: 'invite_expired_12345678901234567890'
    }));
  });
  await it('join dengan invite untuk space lain ditolak', async () => {
    const grace = authenticated('grace');
    await assertFails(updateDoc(doc(fsDb(grace), 'spaces/space4'), {
      memberIds: ['eve', 'grace'],
      _joinCode: 'invite_other_space_12345678901234567890'
    }));
  });
  await it('invite hanya bisa dibuat untuk ruang dengan satu anggota', async () => {
    const eve = authenticated('eve');
    const valid = {
      code: 'invite_new_12345678901234567890',
      spaceId: 'space4',
      spaceName: 'Ruang Kedaluwarsa',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      used: false,
      usedBy: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      schemaVersion: 1
    };
    await assertSucceeds(setDoc(doc(fsDb(eve), 'invites/invite_new_12345678901234567890'), valid));
    await assertFails(setDoc(doc(fsDb(eve), 'invites/invite_full_12345678901234567890'), {
      ...valid,
      code: 'invite_full_12345678901234567890',
      spaceId: 'space1',
      spaceName: 'Ruang A'
    }));
    await assertFails(deleteDoc(doc(fsDb(eve), 'invites/invite_new_12345678901234567890')));
  });

  // ============ 9b. CP-INVITE: pembuatan kode undangan ============
  // Bug produksi yang diperbaiki: `expiresAt` dulu = Date.now() (jam PERANGKAT)
  // + 24 jam apa adanya, sementara rule membatasinya dengan jam SERVER
  // (`expiresAt <= request.time + 24 jam`, firestore.rules:939) → margin nol,
  // jadi perangkat yang jamnya lebih cepat sedikit selalu ditolak
  // permission-denied walau emulator (jam host sama) selalu lolos.
  // Perbaikan ada di client (spaceService + utils/invite.js) — rules TIDAK diubah.
  const INVITE_CAP = 24 * 60 * 60 * 1000; // plafon rule (= INVITE_TTL_MS)
  const inviteCode = (tag) => `inv_${tag}`.padEnd(24, '0');
  const inviteData = (o = {}) => ({
    code: 'inv_placeholder0000000',
    spaceId: 'space_unik',
    spaceName: 'Ruang  Bersama  Uji',
    createdBy: 'hana',
    createdAt: serverTimestamp(),
    used: false,
    usedBy: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + INVITE_CAP - 5 * 60 * 1000),
    schemaVersion: 1,
    ...o
  });
  const writeInvite = (ctx, tag, o = {}) => {
    const code = inviteCode(tag);
    return setDoc(doc(fsDb(ctx), `invites/${code}`), inviteData({ code, ...o }));
  };

  await it('CP-INVITE: owner ruang 1 anggota boleh membuat invite (nama ruang apa adanya)', async () => {
    const hana = authenticated('hana');
    // Nama ruang berspasi ganda dikirim verbatim → sama dengan dokumen ruang.
    await assertSucceeds(writeInvite(hana, 'ok'));
  });

  await it('CP-INVITE: expiresAt dari jam perangkat yang lebih cepat dari server ditolak; payload bermargin lolos', async () => {
    const hana = authenticated('hana');
    // Perilaku LAMA (jam perangkat + 24 jam apa adanya) saat jam perangkat
    // lebih cepat 1 menit → melewati plafon jam server → DENY.
    await assertFails(writeInvite(hana, 'skew_buruk', {
      expiresAt: new Date(Date.now() + INVITE_CAP + 60 * 1000)
    }));
    // Payload BARU: basis waktu server + margin 5 menit (skew 5 menit aman).
    await assertSucceeds(writeInvite(hana, 'skew_server', {
      expiresAt: new Date(Date.now() + INVITE_CAP - 5 * 60 * 1000)
    }));
    // Fallback jam perangkat dengan margin 1 jam.
    await assertSucceeds(writeInvite(hana, 'skew_fallback', {
      expiresAt: new Date(Date.now() + INVITE_CAP - 60 * 60 * 1000)
    }));
    // Invite yang waktunya sudah lewat tetap ditolak.
    await assertFails(writeInvite(hana, 'kedaluwarsa', {
      expiresAt: new Date(Date.now() - 60 * 1000)
    }));
  });

  await it('CP-INVITE: ruang penuh / non-member / anonim tidak boleh membuat invite', async () => {
    const zoe = authenticated('zoe');
    await assertFails(writeInvite(zoe, 'penuh', {
      spaceId: 'space_penuh',
      spaceName: 'Ruang Penuh',
      createdBy: 'zoe'
    }));
    // Isolasi syarat ukuran: alice ANGGOTA space1 (2 anggota) — semua syarat lain
    // terpenuhi (nama & createdBy cocok) → satu-satunya penolak adalah
    // `memberIds.size() == 1` (firestore.rules:937).
    const alice = authenticated('alice');
    await assertFails(writeInvite(alice, 'penuh_anggota', {
      spaceId: 'space1',
      spaceName: 'Ruang A',
      createdBy: 'alice'
    }));
    const carol = authenticated('carol');
    await assertFails(writeInvite(carol, 'nonmember', { createdBy: 'carol' }));
    await assertFails(writeInvite(anon, 'anonim', { createdBy: 'anon' }));
  });

  await it('CP-INVITE: createdBy harus pembuatnya & invite tidak boleh dibuat sudah terpakai', async () => {
    const hana = authenticated('hana');
    // createdBy milik orang lain (ivan) = DENY (ownership).
    await assertFails(writeInvite(hana, 'ownermismatch', { createdBy: 'ivan' }));
    // used:true sejak pembuatan = DENY (invite sekali pakai, wajib unused).
    await assertFails(writeInvite(hana, 'langsungpakai', {
      used: true,
      usedBy: 'ivan',
      usedAt: new Date()
    }));
  });

  await it('CP-INVITE: dokumen invite wajib berada di invites/{code} yang cocok', async () => {
    const hana = authenticated('hana');
    const data = inviteData({ code: inviteCode('kode_lain') });
    await assertFails(setDoc(doc(fsDb(hana), `invites/${inviteCode('dokumen_lain')}`), data));
  });

  await it('CP-INVITE: nama ruang harus sama persis dengan dokumen ruang', async () => {
    const hana = authenticated('hana');
    // Versi "dirapikan/dipotong" (perilaku lama: trim + slice(0,60)) → DENY.
    await assertFails(writeInvite(hana, 'nama_diubah', { spaceName: 'Ruang Bersama Uji' }));
    await assertFails(writeInvite(hana, 'nama_dipotong', { spaceName: 'Ruang  Bersama  Uji'.slice(0, 5) }));
    // Ruang dengan nama 75 karakter (di luar skema aplikasi): DUA-DUANYA
    // ditolak rules — verbatim (melebihi 60) maupun dipotong (mismatch).
    // Karena itu service menolak lebih awal dengan pesan yang bisa ditindaklanjuti.
    const ivan = authenticated('ivan');
    const panjang = 'Nama Ruang Yang Sengaja Dibuat Sangat Panjang Melebihi Batas Skema Aplikasi';
    await assertFails(writeInvite(ivan, 'nama_panjang', {
      spaceId: 'space_panjang',
      spaceName: panjang,
      createdBy: 'ivan'
    }));
    await assertFails(writeInvite(ivan, 'nama_panjang_potong', {
      spaceId: 'space_panjang',
      spaceName: panjang.slice(0, 60),
      createdBy: 'ivan'
    }));
  });

  await it('CP-INVITE: invite yang baru dibuat tetap bisa dipakai join (regresi)', async () => {
    const hana = authenticated('hana');
    const code = inviteCode('untuk_join');
    await assertSucceeds(writeInvite(hana, 'untuk_join'));

    const xenia = authenticated('xenia');
    const batch = writeBatch(fsDb(xenia));
    batch.update(doc(fsDb(xenia), 'spaces/space_unik'), {
      memberIds: ['hana', 'xenia'],
      _joinCode: code
    });
    batch.update(doc(fsDb(xenia), `invites/${code}`), {
      used: true,
      usedBy: 'xenia',
      usedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(doc(fsDb(xenia), 'users/xenia'), { spaceId: 'space_unik' }));
    // Sekali pakai: undangan yang sama tidak bisa dipakai lagi.
    const zoe = authenticated('zoe');
    await assertFails(updateDoc(doc(fsDb(zoe), 'spaces/space_unik'), {
      memberIds: ['hana', 'xenia', 'zoe'],
      _joinCode: code
    }));
  });

  // ---------- CP0: keluar dari ruang belajar ----------
  // Helper batch yang hanya menyentuh memberIds (untuk uji negatif & positif).
  const leaveOnly = (ctx, memberIds) => {
    const b = writeBatch(fsDb(ctx));
    b.update(doc(fsDb(ctx), 'spaces/space_leave'), { memberIds });
    return b;
  };

  await it('CP0: owner tidak boleh keluar dengan cara biasa', async () => {
    const lina = authenticated('lina');
    // Pemilik (indeks 0) melepas diri → post-state menyisakan partner, bukan
    // pemilik lama (newM[0] == oldM[0] gagal) → ditolak rules.
    await assertFails(leaveOnly(lina, ['budi']).commit());
    // Keluar sampai menyisakan 0 anggota juga ditolak (ruang wajib tetap ada).
    await assertFails(leaveOnly(lina, []).commit());
  });

  await it('CP0: non-member & tamu tidak boleh mengubah memberIds', async () => {
    const carol = authenticated('carol');
    await assertFails(leaveOnly(carol, ['lina']).commit());
    await assertFails(leaveOnly(anon, ['lina']).commit());
  });

  await it('CP0: partner ditolak mengubah memberIds secara sembarangan', async () => {
    const budi = authenticated('budi');
    // anggota ketiga / membuang pemilik / menukar urutan (mengaku owner)
    await assertFails(leaveOnly(budi, ['lina', 'budi', 'zoe']).commit());
    await assertFails(leaveOnly(budi, ['budi']).commit());
    await assertFails(leaveOnly(budi, ['budi', 'lina']).commit());
    // memberIds dikosongkan → validSpace menolak
    await assertFails(leaveOnly(budi, []).commit());
    // keluar sambil mengubah nama ruang → mergedOnly(['memberIds']) menolak
    const mixed = writeBatch(fsDb(budi));
    mixed.update(doc(fsDb(budi), 'spaces/space_leave'), { memberIds: ['lina'], name: 'Diambil alih' });
    await assertFails(mixed.commit());
  });

  await it('CP0: profil tidak bisa dipindah/di-null selagi masih anggota', async () => {
    const budi = authenticated('budi');
    // memindahkan diri ke ruang lain lewat write ilegal → ditolak
    await assertFails(updateDoc(doc(fsDb(budi), 'users/budi'), { spaceId: 'space3' }));
    // melepas tautan TANPA keluar ruang (memberIds tidak ikut berubah) → ditolak
    await assertFails(updateDoc(doc(fsDb(budi), 'users/budi'), { spaceId: null }));
  });

  await it('CP0: partner keluar — batch atomik; ruang & konten shared tetap aman', async () => {
    const budi = authenticated('budi');
    const batch = leaveOnly(budi, ['lina']);
    batch.update(doc(fsDb(budi), 'users/budi'), { spaceId: null });
    await assertSucceeds(batch.commit());

    const lina = authenticated('lina');
    const spaceSnap = await getDoc(doc(fsDb(lina), 'spaces/space_leave'));
    assert.equal(spaceSnap.exists(), true, 'ruang TIDAK dihapus');
    assert.deepEqual(spaceSnap.data().memberIds, ['lina'], 'memberIds 2 → 1, pemilik tetap');

    const profile = await getDoc(doc(fsDb(budi), 'users/budi'));
    assert.equal(profile.data().spaceId, null, 'users/{uid}.spaceId direset');

    // Konten shared tidak terhapus dan tetap terbaca pemilik…
    const note = await getDoc(doc(fsDb(lina), 'spaces/space_leave/notes/n_leave'));
    assert.equal(note.exists(), true, 'konten shared tetap ada');
    // …sementara partner lama kehilangan akses ke ruang & data lama.
    await assertFails(getDoc(doc(fsDb(budi), 'spaces/space_leave')));
    await assertFails(getDoc(doc(fsDb(budi), 'spaces/space_leave/notes/n_leave')));
    await assertFails(getDoc(doc(fsDb(budi), 'users/lina')));
  });

  await it('CP0: leave kedua kali ditolak rules (client menangani idempoten)', async () => {
    const budi = authenticated('budi');
    await assertFails(leaveOnly(budi, ['lina']).commit());
    // Profil sudah null; menulis null lagi = no-change → diizinkan (retry aman).
    await assertSucceeds(updateDoc(doc(fsDb(budi), 'users/budi'), { spaceId: null }));
  });

  await it('CP0: profil yang menunjuk ruang tanpa keanggotaan bisa dilepas (pemulihan)', async () => {
    // Meniru leave terputus: profil masih menunjuk ruang, keanggotaan sudah
    // tidak ada. Aturan baru mengizinkan pelepasan tautan sendiri di kondisi ini.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/lina2'), {
        displayName: 'Lina2',
        avatar: '',
        color: '#4f9b78',
        spaceId: 'space_leave',
        schemaVersion: 1
      });
    });
    const lina2 = authenticated('lina2');
    // Perilaku ownsSpaceLink YANG SUDAH ADA: metadata ruang masih terbaca
    // selama tautan profil menunjuk ke sana — tetapi ISI ruang tetap tertutup
    // (subkoleksi memakai isMember, bukan tautan profil).
    await assertSucceeds(getDoc(doc(fsDb(lina2), 'spaces/space_leave')));
    await assertFails(getDoc(doc(fsDb(lina2), 'spaces/space_leave/notes/n_leave')));
    // Pelepasan tautan sendiri diizinkan HANYA karena sudah bukan anggota…
    await assertSucceeds(updateDoc(doc(fsDb(lina2), 'users/lina2'), { spaceId: null }));
    // …dan setelah tautan lepas, ruang ikut tertutup sepenuhnya.
    await assertFails(getDoc(doc(fsDb(lina2), 'spaces/space_leave')));
  });

  await it('CP0: setelah keluar, partner bisa bergabung kembali dengan undangan baru', async () => {
    const lina = authenticated('lina');
    // Ruang kini 1 anggota → pemilik boleh membuat undangan baru.
    await assertSucceeds(writeInvite(lina, 'rejoin', {
      spaceId: 'space_leave',
      spaceName: 'Ruang Leave',
      createdBy: 'lina'
    }));

    const budi = authenticated('budi');
    const code = inviteCode('rejoin');
    const join = writeBatch(fsDb(budi));
    join.update(doc(fsDb(budi), 'spaces/space_leave'), {
      memberIds: ['lina', 'budi'],
      _joinCode: code
    });
    join.update(doc(fsDb(budi), `invites/${code}`), {
      used: true,
      usedBy: 'budi',
      usedAt: serverTimestamp()
    });
    await assertSucceeds(join.commit());
    await assertSucceeds(updateDoc(doc(fsDb(budi), 'users/budi'), { spaceId: 'space_leave' }));

    const spaceSnap = await getDoc(doc(fsDb(lina), 'spaces/space_leave'));
    assert.deepEqual(spaceSnap.data().memberIds, ['lina', 'budi'], 'rejoin mengembalikan 2 anggota');

    // Undangan yang sudah dipakai tetap tidak bisa dipakai ulang oleh siapa pun.
    const zoe = authenticated('zoe');
    const replay = writeBatch(fsDb(zoe));
    replay.update(doc(fsDb(zoe), 'spaces/space_leave'), {
      memberIds: ['lina', 'budi', 'zoe'],
      _joinCode: code
    });
    replay.update(doc(fsDb(zoe), `invites/${code}`), {
      used: true,
      usedBy: 'zoe',
      usedAt: serverTimestamp()
    });
    await assertFails(replay.commit());
    const inviteSnap = await getDoc(doc(fsDb(lina), `invites/${code}`));
    assert.equal(inviteSnap.data().used, true);
  });

  await it('memberIds ruang penuh tidak bisa diubah client', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1'), { memberIds: ['alice', 'bob', 'carol'] }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1'), { memberIds: ['bob', 'alice'] }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1'), { name: 'Nama baru' }));
  });
  await it('_joinCode hanya boleh dihapus anggota (tidak boleh diisi ulang)', async () => {
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1'), { _joinCode: deleteField() }));
    const bobNow = authenticated('bob');
    await assertSucceeds(updateDoc(doc(fsDb(bobNow), 'spaces/space1'), { _joinCode: deleteField() }));
    const aliceNow = authenticated('alice');
    await assertFails(updateDoc(doc(fsDb(aliceNow), 'spaces/space1'), { _joinCode: 'invite_ok_12345678901234567890' }));
  });

  // ============ 10. Buat space & profil ============
  await it('profil sendiri bisa dibaca user yang belum terverifikasi (M11)', async () => {
    // M11: Gate/VerifyScreen memakai ensureProfile(user.uid) → getDoc
    // users/{uid} yang dulu di-deny karena verified() belum true → toast
    // "Akses ditolak" sesaat. Rule kini: profil SENDIRI cukup signedIn();
    // profil teman satu ruang tetap wajib verified().
    const unver = authenticated('zoe', { email_verified: false });
    await assertSucceeds(getDoc(doc(fsDb(unver), 'users/zoe')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'users/alice')));
    await assertFails(getDoc(doc(fsDb(unver), 'users/alice')));
  });
  await it('create space butuh email terverifikasi', async () => {
    const unver = authenticated('zoe', { email_verified: false });
    await assertFails(setDoc(doc(fsDb(unver), 'spaces/z1'), {
      name: 'S', memberIds: ['zoe'], createdAt: serverTimestamp(), schemaVersion: 1
    }));
     const ver = authenticated('zoe');
     await assertSucceeds(setDoc(doc(fsDb(ver), 'spaces/z2'), {
       name: 'S', memberIds: ['zoe'], createdAt: serverTimestamp(), schemaVersion: 1
     }));
     await assertSucceeds(updateDoc(doc(fsDb(ver), 'users/zoe'), { spaceId: 'z2' }));
   });
   await it(' pembuatan space wajib satu anggota diri sendiri', async () => {
     const grace = authenticated('grace');
     await assertFails(setDoc(doc(fsDb(grace), 'spaces/bad-members'), {
       name: 'Duplikat', memberIds: ['grace', 'grace'], createdAt: serverTimestamp(), schemaVersion: 1
     }));
     await assertFails(setDoc(doc(fsDb(grace), 'spaces/bad-members-2'), {
       name: 'Banyak', memberIds: ['grace', 'eve'], createdAt: serverTimestamp(), schemaVersion: 1
     }));
   });
  await it('user yang sudah punya space tidak bisa buat space lagi', async () => {
    const aliceAgain = authenticated('alice');
    await assertFails(setDoc(doc(fsDb(aliceAgain), 'spaces/ai1'), {
      name: 'Lagi', memberIds: ['alice'], createdAt: serverTimestamp(), schemaVersion: 1
    }));
  });
  await it('profil hanya bisa diedit pemilik; spaceId hanya ke space milik sendiri', async () => {
    await assertFails(updateDoc(doc(fsDb(alice), 'users/bob'), { displayName: 'Hacked' }));
    await assertSucceeds(updateDoc(doc(fsDb(bob), 'users/bob'), { displayName: 'Bobby' }));
    // alice sudah punya space1 → tidak boleh pindah
    await assertFails(updateDoc(doc(fsDb(alice), 'users/alice'), { spaceId: 'space3' }));
  });
  await it('buat space + taut profil (pola createSpace app: tulis terpisah) berhasil', async () => {
    // Profil wati belum punya space → boleh dibuatkan space baru & ditautkan.
    // DUA tulis TERPISAH (setDoc space → updateDoc users), persis pola
    // createSpace() di app. BUKAN batch: rules `get(spaces/w1)` di dalam batch
    // yang sama gagal dibaca emulator (Service call error) — karena itu app
    // memisahkan tulisnya.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/wati'), {
        displayName: 'Wati', avatar: '', color: '#2fd6e8', spaceId: null, schemaVersion: 1
      });
    });
    const wati = authenticated('wati');
    const spaceRef = doc(fsDb(wati), 'spaces/w1');
    await assertSucceeds(setDoc(spaceRef, {
      name: 'Ruang Wati', memberIds: ['wati'], createdAt: serverTimestamp(), schemaVersion: 1
    }));
    await assertSucceeds(updateDoc(doc(fsDb(wati), 'users/wati'), { spaceId: 'w1' }));
  });
  await it('cek keberadaan ruang milik sendiri saat belum ada diizinkan (pola createSpace)', async () => {
    // createSpace() memanggil getDoc(spaces/space_<uid>) dulu. Sebelum
    // ruang ada, isMemberOf() = false; tanpa exception ini user baru
    // terkunci di onboarding (regresi cp privacy).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/baru'), {
        displayName: 'Baru', avatar: '', color: '#2fd6e8', spaceId: null, schemaVersion: 1
      });
    });
    const baru = authenticated('baru');
    await assertSucceeds(getDoc(doc(fsDb(baru), 'spaces/space_baru')));
  });
  await it('user lain tidak boleh memprediksi id ruang orang lain', async () => {
    const orangLain = authenticated('orang_lain');
    await assertFails(getDoc(doc(fsDb(orangLain), 'spaces/space_baru')));
  });
  await it('ruang milik sendiri yang sudah ada: anggota boleh baca, non-anggota ditolak', async () => {
    const baru = authenticated('baru');
    await assertSucceeds(setDoc(doc(fsDb(baru), 'spaces/space_baru'), {
      name: 'Ruang Baru', memberIds: ['baru'], createdAt: serverTimestamp(), schemaVersion: 1
    }));
    await assertSucceeds(getDoc(doc(fsDb(baru), 'spaces/space_baru')));
    const pendatang = authenticated('pendatang');
    await assertFails(getDoc(doc(fsDb(pendatang), 'spaces/space_baru')));
    // id milik sendiri yang SUDAH ada -> jalur pendingSpace tidak berlaku
    await assertFails(getDoc(doc(fsDb(authenticated('space_baru')), 'spaces/space_baru')));
  });
  await it('update profil utk user tanpa profil ditolak (bukan error evaluasi)', async () => {
    const xenia = authenticated('xenia');
    await assertFails(updateDoc(doc(fsDb(xenia), 'users/xenia'), { spaceId: 'x1' }));
  });

  // ==========================================================
  // CP3 (baru): questions, quizAttempts, topicProgress, tasks, dailyPlans
  // ==========================================================
  // Pakai konteks modul yang sudah ada (alice/bob) supaya tidak menambah
  // instance Firestore baru. Carol belum jadi anggota space1.
  const carolCP3 = authenticated('carol');

  const questionData = (o = {}) => ({
    prompt: 'Berapa 1 + 1?',
    options: ['1', '2', '3', '4'],
    answerIndex: 1,
    topicId: 'topic1',
    difficulty: 'beginner',
    visibility: 'private',
    tags: [],
    explanation: '',
    commentCount: 0,
    deletedAt: null,
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  const attemptData = (o = {}) => ({
    uid: 'alice',
    topicId: 'topic1',
    questionIds: ['q1'],
    total: 2,
    correct: 1,
    score: 50,
    startedAt: serverTimestamp(),
    finishedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  const progressData = (o = {}) => ({
    topicId: 'topic1',
    uid: 'alice',
    status: 'learning',
    score: 0,
    attempts: 0,
    lastStudiedAt: null,
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  const taskData = (o = {}) => ({
    title: 'Bacalah PDF Bayes',
    detail: '',
    topicId: 'topic1',
    assigneeId: null,
    status: 'todo',
    priority: 'normal',
    dueAt: null,
    doneAt: null,
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  const planData = (o = {}) => ({
    uid: 'alice',
    date: '2026-09-26',
    items: { topic1: { kind: 'topic', done: false, title: 'Matematika' } },
    note: '',
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  // ---------- questions ----------
  await it('CP3/Q: anggota membuat soal (private/shared) & field tak valid ditolak', async () => {
    
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_priv'), questionData()));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_shared'),
      questionData({ visibility: 'shared' })));
    // Opsi dinamis 2..20 & validasi single choice
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_2opsi'),
      questionData({ options: ['Ya', 'Tidak'], answerIndex: 0 })));
    const twentyOpts = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_20opsi'),
      questionData({ options: twentyOpts, answerIndex: 19 })));
    // 1 opsi ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_1opsi'),
      questionData({ options: ['Hanya satu'], answerIndex: 0 })));
    // 21 opsi ditolak
    const twentyOneOpts = Array.from({ length: 21 }, (_, i) => `Opsi ${i + 1}`);
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_21opsi'),
      questionData({ options: twentyOneOpts, answerIndex: 0 })));
    // answerIndex out of range ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ans_out'),
      questionData({ options: ['A', 'B'], answerIndex: 2 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ans_neg'),
      questionData({ options: ['A', 'B'], answerIndex: -1 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ansstr'),
      questionData({ answerIndex: '1' })));
    // Opsi duplikat ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_dup_opts'),
      questionData({ options: ['Sama', 'Sama', 'Beda'] })));
    // Multiple select tests
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_mult_ok'),
      questionData({ type: 'multiple', options: ['A', 'B', 'C'], correctIndices: [0, 2] })));
    // Multiple select: duplicate correctIndices ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_mult_dup_idx'),
      questionData({ type: 'multiple', options: ['A', 'B', 'C'], correctIndices: [1, 1] })));
    // Multiple select: correctIndex out of range ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_mult_out_idx'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [5] })));
    // Prompt kosong ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_kosong'),
      questionData({ prompt: '' })));
    // Topik palsu ditolak
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_topikPalsu'),
      questionData({ topicId: 'tidak_ada' })));
  });

  await it('CP3/Q: privasi soal ditegakkan rules (shared terbaca, private & deleted tidak)', async () => {
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/questions/q_ok_shared')));
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/questions/q_ok_priv')));
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/questions/q_ok_shared')));
    // Query polos tidak bisa dibuktikan rules -> ditolak (pola dual-listener).
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/questions')));
    // Cabang 1: shared + belum dihapus. WAJIB dua filter, karena aturan
    // `visibility == 'shared' && deletedAt == null` hanya bisa dibuktikan
    // query yang menyertakan keduanya (sama seperti notes).
    const sharedBranch = query(collection(fsDb(bob), 'spaces/space1/questions'),
      where('visibility', '==', 'shared'), where('deletedAt', '==', null));
    const shared = await getDocs(sharedBranch);
    assert.equal(shared.docs.length, 1);
    assert.equal(shared.docs[0].id, 'q_ok_shared');
    // Cabang 2: milik sendiri.
    const own = await getDocs(query(collection(fsDb(bob), 'spaces/space1/questions'),
      where('createdBy', '==', 'bob')));
    assert.equal(own.docs.length, 0);
    // soal shared yang di-soft-delete: partner tidak boleh, owner tetap (Sampah).
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_del'),
      questionData({ visibility: 'shared', deletedAt: new Date() })));
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/questions/q_del')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/questions/q_del')));
    // Soft-delete tidak boleh membuat dokumen shared aktif muncul lagi.
    const sharedAfterDelete = await getDocs(sharedBranch);
    assert.equal(sharedAfterDelete.docs.length, 1);
  });

  await it('CP3/Q: update/hapus soal hanya owner; createdBy immutable', async () => {
    
    
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_priv'),
      { prompt: 'Soal diubah', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_priv'),
      { createdBy: 'bob' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/questions/q_ok_priv'),
      { prompt: 'Dibajak' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/questions/q_ok_priv')));
    await assertSucceeds(deleteDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_priv')));
  });

  await it('CP3/Q: createdBy harus diri sendiri saat create', async () => {
    
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/questions/q_paksa'),
      questionData({ createdBy: 'alice' })));
  });

  // ---------- CP1-A: validasi struktur bank soal per tipe ----------
  await it('CP1-A: single choice — batas 2/20 opsi & answerIndex dalam rentang', async () => {
    const opts20 = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    // 20 opsi + kunci terakhir = ALLOW (batas atas).
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_max'),
      questionData({ options: opts20, answerIndex: 19 })));
    // answerIndex -1 / >= options.size() / bukan int = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_neg'),
      questionData({ options: ['A', 'B'], answerIndex: -1 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_over'),
      questionData({ options: ['A', 'B'], answerIndex: 2 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_str'),
      questionData({ options: ['A', 'B'], answerIndex: '0' })));
    // Opsi kosong / bukan string / duplikat = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_blank'),
      questionData({ options: ['', 'B'], answerIndex: 0 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_nonstr'),
      questionData({ options: [1, 'B'], answerIndex: 0 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_dup'),
      questionData({ options: ['Sama', 'Sama'], answerIndex: 0 })));
    // type tak dikenal / single tanpa answerIndex = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_badtype'),
      questionData({ type: 'pilihan_ganda' })));
    const { answerIndex: _tanpaKunci, ...singleTanpaKunci } = questionData({ options: ['A', 'B'] });
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_nokey'),
      singleTanpaKunci));
  });

  await it('CP1-A: multiple — correctIndices 1..size, unik, SEMUA dalam rentang', async () => {
    // 2 opsi + 1 kunci = ALLOW (batas bawah).
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_min'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [1] })));
    // 20 opsi + kunci di batas atas = ALLOW.
    const opts20 = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_max'),
      questionData({ type: 'multiple', options: opts20, correctIndices: [0, 19] })));
    // 5 opsi + kunci terakhir = ALLOW; indeks 5 (>= size) = DENY.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_edge'),
      questionData({ type: 'multiple', options: ['A', 'B', 'C', 'D', 'E'], correctIndices: [4] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_edge_over'),
      questionData({ type: 'multiple', options: ['A', 'B', 'C', 'D', 'E'], correctIndices: [0, 5] })));
    // correctIndices kosong = DENY (minimal 1 kunci).
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_empty'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [] })));
    // duplikat = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_dup'),
      questionData({ type: 'multiple', options: ['A', 'B', 'C'], correctIndices: [1, 1] })));
    // indeks di luar rentang pada posisi mana pun = DENY (dulu hanya indeks 0 dicek).
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_out_first'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [99] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_out_second'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [0, 99] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_neg'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [-1, 0] })));
    // kunci bukan int (string) = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_str'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: ['1'] })));
    // correctIndices lebih banyak dari opsi = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_toomany'),
      questionData({ type: 'multiple', options: ['A', 'B'], correctIndices: [0, 1, 0] })));
    // multiple tanpa correctIndices = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_mult_nokey'),
      questionData({ type: 'multiple', options: ['A', 'B'] })));
  });

  await it('CP1-A: boolean/short_answer/essay — struktur kunci sah & tidak sah', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_bool'),
      questionData({ type: 'boolean', correctBoolean: false })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_bool_str'),
      questionData({ type: 'boolean', correctBoolean: 'true' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_bool_missing'),
      questionData({ type: 'boolean' })));

    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_short'),
      questionData({ type: 'short_answer', acceptedAnswers: ['2', 'dua'] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_short_empty'),
      questionData({ type: 'short_answer', acceptedAnswers: [] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_short_blank'),
      questionData({ type: 'short_answer', acceptedAnswers: [''] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_short_num'),
      questionData({ type: 'short_answer', acceptedAnswers: [2] })));

    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_essay'),
      questionData({ type: 'essay', sampleAnswer: 'Jawaban contoh yang panjang.' })));
    // sampleAnswer opsional (data lama / soal esai polos tetap sah).
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_essay_plain'),
      questionData({ type: 'essay' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_essay_num'),
      questionData({ type: 'essay', sampleAnswer: 42 })));
  });

  await it('CP1-A: matching/ordering/numerical — struktur sah & tidak sah', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_match'),
      questionData({
        type: 'matching',
        pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }]
      })));
    // kurang dari 2 pasangan = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_match_1pair'),
      questionData({ type: 'matching', pairs: [{ left: '1', right: 'satu' }] })));
    // left/right kosong atau bukan map = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_match_blank'),
      questionData({
        type: 'matching',
        pairs: [{ left: '', right: 'satu' }, { left: '2', right: 'dua' }]
      })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_match_notmap'),
      questionData({ type: 'matching', pairs: ['satu', 'dua'] })));

    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_order'),
      questionData({ type: 'ordering', items: ['Pertama', 'Kedua', 'Ketiga'] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_order_1item'),
      questionData({ type: 'ordering', items: ['Hanya satu'] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_order_blank'),
      questionData({ type: 'ordering', items: ['Satu', ''] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_order_dup'),
      questionData({ type: 'ordering', items: ['Sama', 'Sama'] })));

    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_num'),
      questionData({ type: 'numerical', correctValue: 2, tolerance: 0.5 })));
    // correctValue wajib angka; tolerance negatif = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_num_str'),
      questionData({ type: 'numerical', correctValue: '2' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_num_tol_neg'),
      questionData({ type: 'numerical', correctValue: 2, tolerance: -1 })));
  });

  await it('CP1-A: code/case_study — struktur sah & tidak sah', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_code'),
      questionData({
        type: 'code',
        starterCode: 'function f() {}',
        expectedOutput: '1',
        sampleSolution: 'function f() { return 1; }'
      })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_code_num'),
      questionData({ type: 'code', starterCode: 123 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_code_missing'),
      questionData({ type: 'code' })));

    // subQuestions kosong sah (form belum punya editor sub-soal & grading.js
    // memperlakukan daftar kosong sebagai soal otomatis).
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case'),
      questionData({ type: 'case_study', caseText: 'Sebuah kasus...', subQuestions: [] })));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case_sub'),
      questionData({
        type: 'case_study',
        caseText: 'Sebuah kasus...',
        subQuestions: [{ type: 'boolean', correctBoolean: true }]
      })));
    // caseText kosong / bukan string = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case_empty'),
      questionData({ type: 'case_study', caseText: '', subQuestions: [] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case_num'),
      questionData({ type: 'case_study', caseText: 5, subQuestions: [] })));
    // subQuestions > 10 atau elemen pertama bukan map = DENY.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case_overflow'),
      questionData({
        type: 'case_study',
        caseText: 'Kasus',
        subQuestions: Array.from({ length: 11 }, () => ({ type: 'essay' }))
      })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_case_badsub'),
      questionData({ type: 'case_study', caseText: 'Kasus', subQuestions: ['bukan-map'] })));
  });

  // ---------- CP1-A: keamanan bank soal ----------
  await it('CP1-A: non-anggota & tamu ditolak baca/tulis/ubah/hapus soal', async () => {
    // carol bukan anggota space1 (lihat komentar carolCP3 di blok CP3).
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/questions/qa_single_max')));
    await assertFails(setDoc(doc(fsDb(carolCP3), 'spaces/space1/questions/qa_intruder'),
      questionData({ createdBy: 'carol' })));
    await assertFails(updateDoc(doc(fsDb(carolCP3), 'spaces/space1/questions/qa_single_max'),
      { prompt: 'Dibajak', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(fsDb(carolCP3), 'spaces/space1/questions/qa_single_max')));
    // tamu tanpa login tidak boleh apa pun.
    await assertFails(getDoc(doc(fsDb(anon), 'spaces/space1/questions/qa_single_max')));
    await assertFails(setDoc(doc(fsDb(anon), 'spaces/space1/questions/qa_anon'),
      questionData({ createdBy: 'anon' })));
  });

  await it('CP1-A: soal private tidak bocor ke partner; shared terbaca tapi tetap milik owner', async () => {
    // Private: hanya owner.
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_single_max')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_single_max')));
    // Shared: partner boleh membaca…
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_shared_new'),
      questionData({ visibility: 'shared' })));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_shared_new')));
    // …tapi tidak boleh mengubah/menghapus (ownership tetap di creator).
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_shared_new'),
      { prompt: 'Dibajak', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_shared_new'),
      { createdBy: 'bob' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_shared_new')));
    // Owner tetap boleh mengubah & menghapus, dan createdBy/createdAt immutable.
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_shared_new'),
      { prompt: 'Soal shared diubah', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_shared_new'),
      { createdBy: 'bob' }));
    await assertSucceeds(deleteDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_shared_new')));
  });

  // ---------- quizAttempts ----------
  await it('CP3/A: attempt hanya bisa ditulis untuk diri sendiri & dibaca partner', async () => {
    
    
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a1'), attemptData()));
    // attempt boleh ditulis sekali, tidak boleh diubah/dihapus (skor historis).
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a1'), { score: 100 }));
    await assertFails(deleteDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a1')));
    // partner boleh membaca skor (sinkron live antar partner).
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/quizAttempts/a1')));
    // tapi tidak boleh menulis dengan uid orang lain.
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/quizAttempts/a_palsu'),
      attemptData({ uid: 'alice' })));
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/quizAttempts/a1')));
  });

  await it('CP3/A: angka attempt tidak konsisten ditolak', async () => {
    
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a_correct'),
      attemptData({ correct: 3, total: 2 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a_score'),
      attemptData({ score: 101 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a_kosong'),
      attemptData({ questionIds: [] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizAttempts/a_nilai'),
      attemptData({ total: 0 })));
  });

  // ---------- topicProgress ----------
  await it('CP3/P: progress per topik per user, id wajib <topicId>_<uid>', async () => {
    
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice'), progressData()));
    // id tidak cocok dengan topicId_uid -> ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/bukan'), progressData()));
    // uid harus diri sendiri.
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/topicProgress/topic1_bob'),
      progressData({ uid: 'alice' })));
    // topik harus ada.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/hantu_hantu'),
      progressData({ topicId: 'tidak_ada' })));
    await assertFails(setDoc(doc(fsDb(carolCP3), 'spaces/space1/topicProgress/topic1_carol'),
      progressData({ uid: 'carol' })));
  });

  await it('CP3/P: progress partner terbaca (sinkron) tapi hanya owner yang bisa ubah', async () => {
    
    
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/topicProgress/topic1_alice')));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/topicProgress/topic1_alice'),
      { status: 'completed' }));
    // status & skor konsisten: score > 0 mensyaratkan attempts > 0.
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice'),
      { score: 80, attempts: 0, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice'),
      { status: 'completed', score: 80, attempts: 2, lastStudiedAt: new Date(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice'),
      { status: 'belum' }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice'),
      { topicId: 'topic_lain' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/topicProgress/topic1_alice')));
    await assertSucceeds(deleteDoc(doc(fsDb(alice), 'spaces/space1/topicProgress/topic1_alice')));
  });

  // ---------- tasks ----------
  await it('CP3/T: buat tugas & tipe assigneeId divalidasi ketat', async () => {
    
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_pelig'), taskData()));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_assign'),
      taskData({ assigneeId: 'bob' })));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_umum'),
      taskData({ topicId: '' })));
    // Regresi: nilai assigneeId non-string harus ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_angka'),
      taskData({ assigneeId: 123 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_bool'),
      taskData({ assigneeId: true })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_kosong'),
      taskData({ assigneeId: '' })));
    // Topik yang diisi harus ada; status done wajib punya doneAt.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_topikPalsu'),
      taskData({ topicId: 'tidak_ada' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_doneTanpaWaktu'),
      taskData({ status: 'done' })));
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_done'),
      taskData({ status: 'done', doneAt: new Date() })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_statusAneh'),
      taskData({ status: 'batal' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_creatorPalsu'),
      taskData({ createdBy: 'bob' })));
  });

  await it('CP3/T: assignee boleh menutup tugas (status=done)', async () => {
    await assertSucceeds(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'), {
      status: 'done', doneAt: new Date(), updatedAt: serverTimestamp()
    }));
  });

  await it('CP3/T: assignee tidak boleh mengubah isi/prioritas/assignee', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'),
      { title: 'Dicuri' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'),
      { priority: 'high' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'),
      { assigneeId: 'carol' }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'),
      { dueAt: new Date() }));
  });

  await it('CP3/T: status done tidak boleh dibuka lagi tanpa waktu selesai', async () => {
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'), { status: 'todo' }));
  });

  await it('CP3/T: membuka kembali tugas selesai harus mengosongkan doneAt', async () => {
    // t_assign sudah `done` + doneAt terisi (dari tes sebelumnya).
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'), { status: 'todo' }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_assign'), { status: 'todo' }));
    // Boleh asal doneAt ikut dikosongkan.
    await assertSucceeds(updateDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_assign'),
      { status: 'todo', doneAt: null, updatedAt: serverTimestamp() }));
  });

  await it('CP3/T: bukan assignee maupun creator tidak boleh mengubah', async () => {
    await assertFails(updateDoc(doc(fsDb(carolCP3), 'spaces/space1/tasks/t_assign'),
      { status: 'doing', updatedAt: serverTimestamp() }));
  });

  await it('CP3/T: creator bebas ubah semua field; hapus hanya creator', async () => {
    
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_pelig'), {
      title: 'Judul baru', priority: 'high', dueAt: new Date(), updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_pelig'),
      { createdBy: 'bob' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/tasks/t_pelig')));
    await assertSucceeds(deleteDoc(doc(fsDb(alice), 'spaces/space1/tasks/t_pelig')));
  });

  // ---------- dailyPlans ----------
  await it('CP3/D: rencana harian privat per user (partner tidak bisa baca)', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/alice_2026-09-26'), planData()));
    // id wajib <uid>_<tanggal>.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/aneh'), planData()));
    // tanggal harus format YYYY-MM-DD.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/alice_26-09-2026'),
      planData({ date: '26-09-2026' })));
    // Partner tidak boleh menyentuh rencana milik orang lain.
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/dailyPlans/alice_2026-09-26')));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/dailyPlans/alice_2026-09-26'),
      { note: 'diubah' }));
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/dailyPlans/alice_2026-09-26')));
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/dailyPlans/alice_2026-09-26')));
    // list harus difilter uid (aturan read hanya terbukti untuk where uid).
    const bobPlans = () => query(collection(fsDb(bob), 'spaces/space1/dailyPlans'),
      where('uid', '==', 'bob'));
    const listBob = await getDocs(bobPlans());
    assert.equal(listBob.docs.length, 0);
    await assertSucceeds(setDoc(doc(fsDb(bob), 'spaces/space1/dailyPlans/bob_2026-09-26'),
      planData({ uid: 'bob' })));
    const listBob2 = await getDocs(bobPlans());
    assert.equal(listBob2.docs.length, 1);
    // uid immutable: tidak bisa "mengambil" rencana milik orang lain.
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/dailyPlans/alice_2026-09-26'),
      { uid: 'bob' }));
  });

  await it('CP3/D: batas jumlah item rencana & field tak valid ditolak', async () => {
    
    const banyak = {};
    for (let i = 0; i < 31; i += 1) banyak[`t${i}`] = { kind: 'topic', done: false, title: `T${i}` };
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/alice_2026-09-27'),
      planData({ date: '2026-09-27', items: banyak })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/alice_2026-09-28'),
      planData({ date: '2026-09-28', items: 'bukan-map' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/dailyPlans/alice_2026-09-29'),
      planData({ date: '2026-09-29', note: 42 })));
  });

  await testEnv.cleanup();
  console.log(failed === 0 ? `\nALL ${total} TESTS PASSED` : `\n${failed}/${total} TESTS FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Setup tes gagal:', err.stack || err);
  process.exit(1);
});
