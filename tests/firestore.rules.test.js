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
// Host/port emulator opsional lewat env (RULES_TEST_HOST/RULES_TEST_PORT).
// Dipakai agar suite tetap bisa dijalankan di port lain ketika emulator
// pengembangan sedang hidup di 8080. Default tetap 127.0.0.1:8080.
const EMU_HOST = process.env.RULES_TEST_HOST || '127.0.0.1';
const EMU_PORT = Number(process.env.RULES_TEST_PORT || 8080);
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

// `RulesTestContext` tidak mengekspos `uid`, padahal `createdBy` WAJIB sama
// dengan uid yang sedang bicara (lihat `allow create` di blok questions).
// Dipetakan di sini supaya `putQuestion` bisa mengisi `createdBy` dari aktor
// sebenarnya, bukan dari konstanta.
const uidOf = new WeakMap();

function authenticated(uid, opts = {}) {
  const ctx = testEnv.authenticatedContext(uid, { email_verified: true, ...opts });
  uidOf.set(ctx, uid);
  return ctx;
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
        console.log(`[FAIL] ${name}\n       -> ${String(err.message || err).split('\n').slice(0, 4).join('\n          ')}`);
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
    firestore: { rules, host: EMU_HOST, port: EMU_PORT }
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

  // ---------- M1: soalan publik (TANPA kunci) & kunci privat ----------
  //
  // PERUBAHAN KONTRAK (security migration M1): `questionData` TIDAK LAGI
  // menyertakan `answerIndex`. Kunci jawaban pindah ke dokumen terpisah
  // `questions/{qid}/key/{keyRevision}`. Test yang tadinya memeriksa validasi
  // kunci (rentang indeks, duplikat, bentuk pasangan, ...) dipindah ke
  // `keyData` di bawah dengan alasan keamanan yang SAMA - pemindahan lokasi
  // data tidak boleh berarti kehilangan satu pun pemeriksaan.
  const questionData = (o = {}) => ({
    prompt: 'Berapa 1 + 1?',
    options: ['1', '2', '3', '4'],

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
  // Dokumen kunci privat. TIDAK memuat material publik (prompt/options)
  // supaya tidak ada dua sumber kebenaran yang bisa berbeda.
  const keyData = (o = {}) => ({
    type: 'single',
    keyRevision: '1',
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    ...o
  });

  const qPath = (id) => `spaces/space1/questions/${id}`;
  const keyPath = (id, rev = '1') => `${qPath(id)}/key/${rev}`;

  // Tulis soalan publik dulu, baru kuncinya. Urutan ini WAJIB: `keyShapeValid`
  // membaca `options` dari dokumen soal publik untuk memastikan indeks kunci
  // benar-benar menunjuk opsi yang ada.
  //
  // `createdBy` diisi dari uid aktor, BUKAN dari default `questionData`
  // ('alice'). Sebelumnya `putQuestion(bob, ...)` menulis soal dengan
  // `createdBy: 'alice'`, jadi rules menolaknya karena bukan pemilik - dan tes
  // gagal dengan "evaluation error" yang sama sekali tidak menyebut
  // ketidakcocokan pemiliknya. `...o` tetap di belakang supaya kasus yang
  // memang sengaja menguji `createdBy` eksplisit (memalsukan pemilik) bisa
  // menimpanya.
  const putQuestion = (ctx, id, o = {}) =>
    setDoc(doc(fsDb(ctx), qPath(id)), questionData({ createdBy: uidOf.get(ctx), ...o }));
  const putKey = (ctx, qid, o = {}, rev = '1') =>
    setDoc(doc(fsDb(ctx), keyPath(qid, rev)), keyData({ ...o, keyRevision: rev }));

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
    // M1: dokumen soalan publik TANPA kunci apa pun = ALLOW.
    await assertSucceeds(putQuestion(alice, 'q_ok_priv'));
    await assertSucceeds(putQuestion(alice, 'q_ok_shared', { visibility: 'shared' }));
    // Opsi dinamis 2..20 tetap divalidasi di dokumen publik.
    await assertSucceeds(putQuestion(alice, 'q_2opsi', { options: ['Ya', 'Tidak'] }));
    const twentyOpts = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    await assertSucceeds(putQuestion(alice, 'q_20opsi', { options: twentyOpts }));
    // 1 opsi ditolak
    await assertFails(putQuestion(alice, 'q_1opsi', { options: ['Hanya satu'] }));
    // 21 opsi ditolak
    const twentyOneOpts = Array.from({ length: 21 }, (_, i) => `Opsi ${i + 1}`);
    await assertFails(putQuestion(alice, 'q_21opsi', { options: twentyOneOpts }));
    // Opsi duplikat ditolak
    await assertFails(putQuestion(alice, 'q_dup_opts', { options: ['Sama', 'Sama', 'Beda'] }));
    // Multiple select: dokumen publik tidak pernah boleh memuat correctIndices.
    await assertSucceeds(putQuestion(alice, 'q_mult_ok', { type: 'multiple', options: ['A', 'B', 'C'] }));
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

  // ---------- CP3/R: report soal (subkoleksi di bawah soal) ----------
  // Report disimpan sebagai `questions/{questionId}/reports/{reportId}` supaya
  // owner bisa listener POLOS (dokumen induk ada di path) tanpa query `in`.
  const reportPath = (qid, rid) => `spaces/space1/questions/${qid}/reports/${rid}`;
  const reportDoc = (over = {}) => ({
    questionId: 'q_ok_shared',
    reporterId: 'bob',
    type: 'wrong_answer',
    message: 'Kunci jawaban seharusnya opsi B.',
    createdAt: serverTimestamp(),
    schemaVersion: 1,
    ...over
  });

  await it('CP3/R: pelapor bisa melapor soal shared partner, dengan skema tervalidasi', async () => {
    await assertSucceeds(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_ok')), reportDoc()));

    // Jenis di luar daftar resmi.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_bad_type')),
      reportDoc({ type: 'ngelapor' })));
    // Pesan kosong / terlalu panjang.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_empty')),
      reportDoc({ message: '   ' })));
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_long')),
      reportDoc({ message: 'a'.repeat(2001) })));
    // Memalsukan pelapor.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_forge')),
      reportDoc({ reporterId: 'alice' })));
    // questionId harus sama dengan soal di path.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_mismatch')),
      reportDoc({ questionId: 'q_lain' })));
    // Skema salah.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_ver')),
      reportDoc({ schemaVersion: 2 })));
    // Bukan anggota ruang.
    await assertFails(setDoc(doc(fsDb(carolCP3), reportPath('q_ok_shared', 'r_carol')), reportDoc({
      reporterId: 'carol'
    })));
  });

  await it('CP3/R: melapor soal sendiri atau soal private partner DITOLAK', async () => {
    // Melapor soal sendiri tidak berguna (tidak ada yang membaca).
    await assertFails(setDoc(doc(fsDb(alice), reportPath('q_ok_shared', 'r_self')),
      reportDoc({ reporterId: 'alice' })));
    // Soal private partner tidak terlihat -> tidak boleh dilaporkan.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_priv', 'r_priv')),
      reportDoc({ questionId: 'q_ok_priv' })));
  });

  await it('CP3/R: jenis "other" tetap wajib punya keterangan (semua jenis wajib)', async () => {
    // Soal khusus tes ini, supaya hitungan report di `q_ok_shared` (dipakai
    // assertion lain) tetap satu.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_other'),
      questionData({ visibility: 'shared' })));
    // "Lainnya" yang dijelaskan -> sah, dan memakai id soal dari snapshot kuis.
    await assertSucceeds(setDoc(doc(fsDb(bob), reportPath('q_ok_other', 'r_other_ok')),
      reportDoc({ questionId: 'q_ok_other', type: 'other', message: 'Kunci dan opsinya sama-sama masuk akal.' })));
    // "Lainnya" tanpa keterangan -> ditolak, sama seperti jenis lain.
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_other', 'r_other_blank')),
      reportDoc({ questionId: 'q_ok_other', type: 'other', message: '' })));
    await assertFails(setDoc(doc(fsDb(bob), reportPath('q_ok_other', 'r_other_ws')),
      reportDoc({ questionId: 'q_ok_other', type: 'other', message: '\n\t ' })));
  });

  await it('CP3/R: report hanya dibaca pemilik soal & pelapor; non-member ditolak', async () => {
    const reports = (ctx) => collection(fsDb(ctx), 'spaces/space1/questions/q_ok_shared/reports');

    // Pemilik soal: listener polos berhasil dan melihat report partner.
    const asOwner = await getDocs(reports(alice));
    assert.equal(asOwner.docs.length, 1);
    assert.equal(asOwner.docs[0].id, 'r_ok');

    // Pelapor TIDAK boleh list - walau memfilter reporterId miliknya. Ini
    // konsekuensi_rules engine: `resource.data` di rule `list` membuat query
    // polos owner ikut tidak terbuktikan (lihat catatan di firestore.rules).
    await assertFails(getDocs(reports(bob)));
    await assertFails(getDocs(query(reports(bob), where('reporterId', '==', 'bob'))));

    // Pelapor tetap boleh MEMBACA reportnya sendiri lewat `get`.
    await assertSucceeds(getDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_ok'))));
    // Non-member ditolak lewat list maupun get.
    await assertFails(getDocs(query(reports(carolCP3), where('reporterId', '==', 'bob'))));
    await assertFails(getDoc(doc(fsDb(carolCP3), reportPath('q_ok_shared', 'r_ok'))));
  });

  await it('CP3/R: report bersifat abadi - update & delete ditolak untuk semua pihak', async () => {
    await assertFails(updateDoc(doc(fsDb(alice), reportPath('q_ok_shared', 'r_ok')),
      { message: 'diubah owner' }));
    await assertFails(updateDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_ok')),
      { message: 'diubah pelapor' }));
    await assertFails(deleteDoc(doc(fsDb(alice), reportPath('q_ok_shared', 'r_ok'))));
    await assertFails(deleteDoc(doc(fsDb(bob), reportPath('q_ok_shared', 'r_ok'))));
    // Masih utuh setelah semua percobaan.
    const asOwner = await getDocs(collection(fsDb(alice), 'spaces/space1/questions/q_ok_shared/reports'));
    assert.equal(asOwner.docs.length, 1);
  });

  // ---------- CP1-A: validasi struktur bank soal per tipe ----------
  // ---------- CP1-A: validasi kunci privat (M1) ----------
  //
  // M1: test di bawah tadinya menulis kunci INLINE di dokumen soal. Semua
  // pemeriksaan itu (rentang indeks, duplikat, keunikan item, bentuk pasangan,
  // batas 2..20) TETAP WAJIB ada setelah pemisahan kunci — kalau hilang, migrasi
  // ini justru MELEMAHKAN rules, bukan menguatkannya. Perbedaannya hanya LOKASI:
  // kini diperiksa di `questions/{qid}/key/{rev}`.
  await it('CP1-A: single - kunci privat sah & answerIndex dalam rentang opsi publik', async () => {
    const opts20 = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    await putQuestion(alice, 'qk_single_max', { options: opts20 });
    // 20 opsi + kunci terakhir = ALLOW (batas atas).
    await assertSucceeds(putKey(alice, 'qk_single_max', { answerIndex: 19 }));
    // answerIndex -1 / >= options.size() / bukan int = DENY.
    // Penegakan rentang ini kini harus membaca dokumen soal publik lewat `get()`,
    // karena `options` tidak lagi berada di dokumen yang sama dengan kunci.
    await assertFails(putKey(alice, 'qk_single_max', { answerIndex: -1 }, '2'));
    await assertFails(putKey(alice, 'qk_single_max', { answerIndex: 20 }, '3'));
    await assertFails(putKey(alice, 'qk_single_max', { answerIndex: '0' }, '4'));
    // Kunci WAJIB ada. Soal single tanpa kunci tidak boleh dianggap "sah".
    await assertFails(putKey(alice, 'qk_single_max', {}, '5'));

    // Opsi kosong / bukan string / duplikat tetap DENY di dokumen publik.
    await assertFails(putQuestion(alice, 'qk_single_blank', { options: ['', 'B'] }));
    await assertFails(putQuestion(alice, 'qk_single_nonstr', { options: [1, 'B'] }));
    await assertFails(putQuestion(alice, 'qk_single_dup', { options: ['Sama', 'Sama'] }));
    // type tak dikenal = DENY.
    await assertFails(putQuestion(alice, 'qk_single_badtype', { type: 'pilihan_ganda' }));
  });

  await it('CP1-A: multiple - correctIndices 1..size, unik, SEMUA dalam rentang', async () => {
    // 2 opsi + 1 kunci = ALLOW (batas bawah).
    await putQuestion(alice, 'qk_mult_min', { type: 'multiple', options: ['A', 'B'] });
    await assertSucceeds(putKey(alice, 'qk_mult_min', { type: 'multiple', correctIndices: [1] }));
    // 20 opsi + kunci di batas atas = ALLOW.
    const opts20 = Array.from({ length: 20 }, (_, i) => `Opsi ${i + 1}`);
    await putQuestion(alice, 'qk_mult_max', { type: 'multiple', options: opts20 });
    await assertSucceeds(putKey(alice, 'qk_mult_max', { type: 'multiple', correctIndices: [0, 19] }));
    // 5 opsi + kunci terakhir = ALLOW; indeks 5 (>= size) = DENY.
    await putQuestion(alice, 'qk_mult_edge', { type: 'multiple', options: ['A', 'B', 'C', 'D', 'E'] });
    await assertSucceeds(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [4] }));
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [0, 5] }, '3'));
    // correctIndices kosong = DENY (minimal 1 kunci).
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [] }, '6'));
    // duplikat = DENY.
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [1, 1] }, '7'));
    // indeks di luar rentang pada posisi mana pun = DENY (dulu hanya indeks 0 dicek).
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [99] }, '8'));
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [0, 99] }, '9'));
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [-1, 0] }, '2'));
    // kunci bukan int (string) = DENY.
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: ['1'] }, '4'));
    // correctIndices lebih banyak dari opsi = DENY.
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple', correctIndices: [0, 1, 0] }, '10'));
    // Kunci `multiple` tanpa correctIndices = DENY.
    await assertFails(putKey(alice, 'qk_mult_edge', { type: 'multiple' }, '5'));
  });

  await it('CP1-A: boolean/short_answer/essay - kunci privat sah & tidak sah', async () => {
    await putQuestion(alice, 'qk_bool', { type: 'boolean' });
    await assertSucceeds(putKey(alice, 'qk_bool', { type: 'boolean', correctBoolean: false }));
    await assertFails(putKey(alice, 'qk_bool', { type: 'boolean', correctBoolean: 'true' }, '4'));
    await assertFails(putKey(alice, 'qk_bool', { type: 'boolean' }, '11'));

    await putQuestion(alice, 'qk_short', { type: 'short_answer' });
    await assertSucceeds(putKey(alice, 'qk_short', { type: 'short_answer', acceptedAnswers: ['2', 'dua'] }));
    await assertFails(putKey(alice, 'qk_short', { type: 'short_answer', acceptedAnswers: [] }, '6'));
    await assertFails(putKey(alice, 'qk_short', { type: 'short_answer', acceptedAnswers: [''] }, '12'));
    await assertFails(putKey(alice, 'qk_short', { type: 'short_answer', acceptedAnswers: [2] }, '13'));

    await putQuestion(alice, 'qk_essay', { type: 'essay' });
    await assertSucceeds(putKey(alice, 'qk_essay', { type: 'essay', sampleAnswer: 'Jawaban contoh yang panjang.' }));
    // sampleAnswer OPSIONAL: esai tanpa contoh jawaban dinilai manual. Ini
    // perilaku yang diharapkan, jadi tidak boleh jadi alasan penolakan.
    await assertSucceeds(putKey(alice, 'qk_essay', { type: 'essay' }, '14'));
    await assertFails(putKey(alice, 'qk_essay', { type: 'essay', sampleAnswer: 42 }, '13'));
  });

  await it('CP1-A: matching/ordering - pemisahan publik/key dijaga di kedua sisi', async () => {
    // ---------- matching: publik `matchLeft`/`matchRight`, kunci `pairs` ----
    await putQuestion(alice, 'qk_match', {
      type: 'matching',
      matchLeft: ['1', '2'],
      matchRight: ['satu', 'dua']
    });
    await assertSucceeds(putKey(alice, 'qk_match', {
      type: 'matching', pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }]
    }));
    // Dokumen publik TIDAK BOLEH memakai `pairs` — itu kunci jawaban.
    await assertFails(putQuestion(alice, 'qk_match_inline', {
      type: 'matching',
      matchLeft: ['1', '2'],
      matchRight: ['satu', 'dua'],
      pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }]
    }));
    // Dua sisi harus sama panjang & unik.
    await assertFails(putQuestion(alice, 'qk_match_ragged', {
      type: 'matching', matchLeft: ['1', '2', '3'], matchRight: ['satu', 'dua']
    }));
    await assertFails(putQuestion(alice, 'qk_match_dup', {
      type: 'matching', matchLeft: ['1', '1'], matchRight: ['satu', 'dua']
    }));
    // Kunci: kurang dari 2 pasangan = DENY.
    await assertFails(putKey(alice, 'qk_match', {
      type: 'matching', pairs: [{ left: '1', right: 'satu' }]
    }, '15'));
    // left/right kosong atau bukan map = DENY.
    await assertFails(putKey(alice, 'qk_match', {
      type: 'matching', pairs: [{ left: '', right: 'satu' }, { left: '2', right: 'dua' }]
    }, '12'));
    await assertFails(putKey(alice, 'qk_match', {
      type: 'matching', pairs: ['satu', 'dua']
    }, '16'));

    // ---------- `pairDraft` (draft editor) ------------------------------
    // Syarat burdenednya Opsi B: field tambahan ini HARUS diterima rules tanpa
    // perubahan rules. Kalau rules menolak, autosave "Lepas pasangan" akan
    // selalu permission-denied dan seluruh perbaikan tidak berguna.
    // M1: `pairDraft` BUKAN field kunci, jadi tetap boleh di dokumen publik.
    // (Tetap DILARANG di snapshot attempt v3 - lihat test snapshot.)
    await assertSucceeds(putQuestion(alice, 'qk_match_draft', {
      type: 'matching',
      matchLeft: ['Indonesia', 'Jepang', 'Prancis'],
      matchRight: ['Jakarta', 'Tokyo', 'Paris'],
      // Baris 'Jepang' belum dipasangkan -> `assigned` berisi null
      pairDraft: {
        lefts: ['Indonesia', 'Jepang', 'Prancis'],
        rights: ['Jakarta', 'Tokyo', 'Paris'],
        assigned: [0, null, 2]
      }
    }));
    // Kolam 1 item DITOLAK. Ini bukan berlakunya aturan "draft harus boleh
    // disimpan separuh jadi": `questionTypeFields.js:150` sudah menolak
    // `pairs.length < 2` di sisi client, jadi menerima 1 item di rules hanya
    // akan membuat rules dan client berbeda pendapat tentang soal yang sama.
    // `pairDraft` tetap bebas di dokumen publik (lihat assertSucceeds di atas).
    await assertFails(putQuestion(alice, 'qk_match_draft_min', {
      type: 'matching',
      matchLeft: ['Indonesia'],
      matchRight: ['Jakarta'],
      pairDraft: { lefts: ['Indonesia'], rights: ['Jakarta'], assigned: [0] }
    }));
    // NAMUN `pairDraft` tidak bisa menggantikan answer key: `pairs` tetap wajib
    // >= 2 pasangan lengkap, apa pun isi draft-nya.
    await putQuestion(alice, 'qk_match_draft1', {
      type: 'matching', matchLeft: ['Indonesia', 'Jepang'], matchRight: ['Jakarta', 'Tokyo']
    });
    await assertFails(putKey(alice, 'qk_match_draft1', {
      type: 'matching',
      pairs: [{ left: 'Indonesia', right: 'Jakarta' }]
    }, '17'));

    // ---------- ordering: publik `orderItems`, kunci `items` ---------------
    await putQuestion(alice, 'qk_order', { type: 'ordering', orderItems: ['Pertama', 'Kedua', 'Ketiga'] });
    await assertSucceeds(putKey(alice, 'qk_order', { type: 'ordering', items: ['Pertama', 'Kedua', 'Ketiga'] }));
    // Dokumen publik TIDAK BOLEH memakai `items` (itu urutan benar).
    await assertFails(putQuestion(alice, 'qk_order_inline', {
      type: 'ordering', orderItems: ['Pertama', 'Kedua'], items: ['Pertama', 'Kedua']
    }));
    await assertFails(putQuestion(alice, 'qk_order_1item', { type: 'ordering', orderItems: ['Hanya satu'] }));
    await assertFails(putQuestion(alice, 'qk_order_blank', { type: 'ordering', orderItems: ['Satu', ''] }));
    await assertFails(putQuestion(alice, 'qk_order_dup', { type: 'ordering', orderItems: ['Sama', 'Sama'] }));
    await assertFails(putKey(alice, 'qk_order', { type: 'ordering', items: ['Hanya satu'] }, '18'));
    await assertFails(putKey(alice, 'qk_order', { type: 'ordering', items: ['Satu', ''] }, '12'));
    await assertFails(putKey(alice, 'qk_order', { type: 'ordering', items: ['Sama', 'Sama'] }, '7'));
  });

  await it('CP1-A: numerical - kunci privat sah & tidak sah', async () => {
    await putQuestion(alice, 'qk_num', { type: 'numerical' });
    await assertSucceeds(putKey(alice, 'qk_num', { type: 'numerical', correctValue: 2, tolerance: 0.5 }));
    // correctValue wajib angka; tolerance negatif = DENY.
    await assertFails(putKey(alice, 'qk_num', { type: 'numerical', correctValue: '2' }, '4'));
    await assertFails(putKey(alice, 'qk_num', { type: 'numerical', correctValue: 2, tolerance: -1 }, '19'));
    // Tanpa correctValue = DENY: soal numerik tanpa acuan tidak bisa dinilai.
    await assertFails(putKey(alice, 'qk_num', { type: 'numerical' }, '11'));
  });

  await it('CP1-A: code/case_study - kunci privat sah & tidak sah', async () => {
    await putQuestion(alice, 'qk_code', { type: 'code', starterCode: 'function f() {}' });
    await assertSucceeds(putKey(alice, 'qk_code', {
      type: 'code',
      expectedOutput: '1',
      sampleSolution: 'function f() { return 1; }'
    }));
    // starterCode PUBLIK wajib string.
    await assertFails(putQuestion(alice, 'qk_code_num', { type: 'code', starterCode: 123 }));
    await assertFails(putQuestion(alice, 'qk_code_missing', { type: 'code' }));
    // expectedOutput OPSIONAL di kunci (code bisa dinilai manual).
    await assertSucceeds(putKey(alice, 'qk_code', { type: 'code' }, '20'));
    // sampleSolution tidak boleh bocor ke dokumen publik.
    await assertFails(putQuestion(alice, 'qk_code_leak', {
      type: 'code', starterCode: 'x', sampleSolution: 'rahasia'
    }));

    // subQuestions kosong tetap sah: grading.js memperlakukan daftar kosong
    // sebagai soal otomatis (CP1-STEP4: form kini punya editor sub-soal).
    await putQuestion(alice, 'qk_case', { type: 'case_study', caseText: 'Sebuah kasus...', subQuestions: [] });
    await assertSucceeds(putKey(alice, 'qk_case', { type: 'case_study', subQuestions: [] }));
    // Sub-soal publik + kunci sub-soal terpisah.
    await putQuestion(alice, 'qk_case_sub', {
      type: 'case_study',
      caseText: 'Sebuah kasus...',
      subQuestions: [{ type: 'boolean' }]
    });
    await assertSucceeds(putKey(alice, 'qk_case_sub', {
      type: 'case_study', subQuestions: [{ type: 'boolean', correctBoolean: true }]
    }));
    // caseText kosong / bukan string = DENY (di dokumen publik).
    await assertFails(putQuestion(alice, 'qk_case_empty', { type: 'case_study', caseText: '', subQuestions: [] }));
    await assertFails(putQuestion(alice, 'qk_case_num', { type: 'case_study', caseText: 5, subQuestions: [] }));
    // subQuestions > 10 atau elemen pertama bukan map = DENY.
    await assertFails(putQuestion(alice, 'qk_case_overflow', {
      type: 'case_study',
      caseText: 'Kasus',
      subQuestions: Array.from({ length: 11 }, () => ({ type: 'boolean' }))
    }));
    await assertFails(putQuestion(alice, 'qk_case_badsub', {
      type: 'case_study', caseText: 'Kasus', subQuestions: ['bukan-map']
    }));
    // Sub-soal kunci tidak boleh membawa material publik: `prompt` di dokumen
    // kunci = dua sumber kebenaran.
    await assertFails(putKey(alice, 'qk_case_sub', {
      type: 'case_study', subQuestions: [{ type: 'boolean', correctBoolean: true, prompt: 'bocor' }]
    }, '21'));
  });
  // ---------- P2: privasi & integritas dokumen kunci ----------
  //
  // INI adalah lapisan otorisasi utama dari pemisahan kunci. Field-level secrecy
  // mustahil di Firestore: selama kunci berada di dokumen yang sama dengan
  // prompt, siapa pun yang boleh `get` dokumen itu juga bisa membacanya. Karena
  // itu kunci pindah ke subkoleksi terpisah, dan aturannya diuji di sini.
  await it('Q-KEY/P2: hanya author soal yang boleh membaca kuncinya', async () => {
    // Soal + kunci milik ALICE.
    await putQuestion(alice, 'qk_p2', { visibility: 'shared', options: ['1', '2', '3', '4'] });
    await assertSucceeds(putKey(alice, 'qk_p2', { answerIndex: 1 }));

    // (Q-KEY-1) Author boleh membaca kunci sendiri.
    await assertSucceeds(getDoc(doc(fsDb(alice), keyPath('qk_p2'))));
    await assertSucceeds(getDocs(collection(fsDb(alice), `${qPath('qk_p2')}/key`)));
    // (Q-KEY-2) Partner adalah anggota space, soal-nya pun SHARED - tapi kunci
    // tetap harus TERTUTUP. Inilah yang membedakan v3 dari "semua anggota boleh
    // baca": tanpa baris ini, partner tinggal get subkoleksi `key`.
    await assertFails(getDoc(doc(fsDb(bob), keyPath('qk_p2'))));
    await assertFails(getDocs(collection(fsDb(bob), `${qPath('qk_p2')}/key`)));
    // (Q-KEY-3) Non-member juga ditolak.
    await assertFails(getDoc(doc(fsDb(carolCP3), keyPath('qk_p2'))));
    // (Q-KEY-4) Anonim ditolak.
    await assertFails(getDoc(doc(fsDb(unauthed()), keyPath('qk_p2'))));
    // Partner tetap boleh membaca dokumen soal publiknya (hanya kuncinya yang
    // tertutup) - membuktikan penutupan tidak menutup semua akses.
    await assertSucceeds(getDoc(doc(fsDb(bob), qPath('qk_p2'))));
  });

  await it('Q-KEY/P2: hanya author yang boleh menulis kunci', async () => {
    await putQuestion(alice, 'qk_p2w', { visibility: 'shared', options: ['A', 'B'] });
    // (Q-KEY-5) Partner tidak boleh membuat kunci untuk soal orang lain.
    await assertFails(putKey(bob, 'qk_p2w', { answerIndex: 0 }));
    // (Q-KEY-7) Author boleh, dan kuncinya harus sah.
    await assertSucceeds(putKey(alice, 'qk_p2w', { answerIndex: 0 }));
    // (Q-KEY-6) Non-member tidak boleh.
    await assertFails(putKey(carolCP3, 'qk_p2w', { answerIndex: 1 }, '2'));
    // Anonim tidak boleh.
    await assertFails(putKey(unauthed(), 'qk_p2w', { answerIndex: 1 }, '3'));
    // Kunci tidak boleh dihapus: attempt lama menunjuk revisi ini, jadi menghapusnya
    // akan membuat attempt lama tidak bisa dinilai tanpa bisa dijelaskan.
    await assertFails(deleteDoc(doc(fsDb(alice), keyPath('qk_p2w'))));
    await assertFails(deleteDoc(doc(fsDb(bob), keyPath('qk_p2w'))));
  });

  await it('Q-KEY: revisi kunci immutable & bentuknya divalidasi', async () => {
    await putQuestion(alice, 'qk_rev', { visibility: 'shared', options: ['A', 'B', 'C'] });
    await assertSucceeds(putKey(alice, 'qk_rev', { answerIndex: 0 }));
    // (Q-KEY-9) Revisi yang sudah tertulis tidak boleh diubah isinya. Kalau boleh,
    // attempt lama yang menunjuk revisi ini bisa diam-diam dinilai dengan kunci
    // yang sudah diganti.
    await assertFails(updateDoc(doc(fsDb(alice), keyPath('qk_rev')), { answerIndex: 2 }));
    await assertFails(updateDoc(doc(fsDb(alice), keyPath('qk_rev')), { answerIndex: 0 })); // tetap DENY
    await assertFails(setDoc(doc(fsDb(alice), keyPath('qk_rev')), keyData({ answerIndex: 2 })));
    // Revisi BARU tetap boleh: itu cara yang benar untuk mengubah kunci.
    await assertSucceeds(putKey(alice, 'qk_rev', { answerIndex: 2 }, '2'));
    // Kunci lama masih utuh.
    const old = await getDoc(doc(fsDb(alice), keyPath('qk_rev')));
    assert.equal(old.exists(), true);
    assert.equal(old.data().answerIndex, 0);

    // (Q-KEY-8) Bentuk kunci tidak sah ditolak.
    //
    // CATATAN: `keyRevision: '9'` ditulis SEBELUM `...bad`, bukan sesudah. Kalau
    // ditulis sesudah, spread `bad` yang memuat `keyRevision: '99'` tertimpa
    // kembali jadi '9' dan kasus "tidak cocok dengan path" ini justru menulis
    // kunci yang SAH ke path revisi '9' - tesnya lulus karena menguji kebalikan
    // dari yang dimaksud.
    for (const [label, bad] of [
      ['tanpa field kunci', {}],
      ['tipe tidak dikenal', { type: 'mystery', answerIndex: 0 }],
      ['schemaVersion salah', { type: 'single', answerIndex: 0, schemaVersion: 2 }],
      ['keyRevision tidak cocok dengan path', { type: 'single', answerIndex: 0, keyRevision: '99' }],
      ['answerIndex bukan int', { type: 'single', answerIndex: '0' }],
      ['answerIndex di luar opsi', { type: 'single', answerIndex: 9 }],
      ['kunci membawa material publik', { type: 'single', answerIndex: 0, prompt: 'duplikat' }],
      ['kunci membawa options', { type: 'single', answerIndex: 0, options: ['A', 'B', 'C'] }]
    ]) {
      await assertFails(setDoc(doc(fsDb(alice), keyPath('qk_rev', '9')),
        keyData({ keyRevision: '9', ...bad })), label);
    }
  });

  await it('Q-KEY: kunci soal yang dihapus/berubah tidak membuka celah baru', async () => {
    // Kunci hanya boleh dibuat untuk soal yang benar-benar ada. Tanpa `exists()`,
    // `get()` pada dokumen yang tidak ada menghasilkan evaluation error.
    await assertFails(putKey(alice, 'qk_hantu', { answerIndex: 0 }));
    // Kunci untuk soal milik orang lain: dokumen soal harus milik pemanggil.
    await putQuestion(bob, 'qk_bob', { visibility: 'shared', options: ['A', 'B'] });
    await assertFails(putKey(alice, 'qk_bob', { answerIndex: 0 }));
  });
  // ---------- CP1-STEP4: studi kasus maksimal 1 tingkat ----------
  // ---------- CP1/CS: sub-soal publik + kunci sub-soal privat ----------
  //
  // M1: nesting satu tingkat tetap berlaku, tapi SEKARANG berlaku di dua dokumen
  // sekaligus: sub-soal publik (dokumen soal) dan sub-soal kunci (dokumen
  // kunci). Keduanya dicek rules secara terpisah.
  await it('CP1/CS: sub-soal satu tingkat sah untuk 7 tipe otomatis (publik + kunci)', async () => {
    // each: [suffix, publicSub, keySub]
    const cases = [
      ['bool', { type: 'boolean' }, { type: 'boolean', correctBoolean: false }],
      ['single', { type: 'single', options: ['A', 'B'] }, { type: 'single', answerIndex: 1 }],
      ['short', { type: 'short_answer' }, { type: 'short_answer', acceptedAnswers: ['ya'] }],
      ['match', { type: 'matching', matchLeft: ['1', '2'], matchRight: ['satu', 'dua'] },
        { type: 'matching', pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }] }],
      ['order', { type: 'ordering', orderItems: ['a', 'b'] }, { type: 'ordering', items: ['a', 'b'] }],
      ['num', { type: 'numerical' }, { type: 'numerical', correctValue: 3, tolerance: 1 }],
      ['multi', { type: 'multiple', options: ['A', 'B', 'C'] }, { type: 'multiple', correctIndices: [0, 2] }]
    ];
    for (const [suffix, pubSub, keySub] of cases) {
      const id = `qk_cs_${suffix}`;
      // Soalan publik: stem + sub-soal publik tanpa kunci.
      await assertSucceeds(putQuestion(alice, id, {
        type: 'case_study', caseText: 'Kasus', subQuestions: [pubSub]
      }));
      // Kunci privat: sub-soal kunci tanpa material publik.
      await assertSucceeds(putKey(alice, id, { type: 'case_study', subQuestions: [keySub] }));
    }
  });

  await it('CP1/CS: sub-soal publik tidak boleh membawa kunci', async () => {
    // Sub-soal publik mewarisi larangan yang sama dengan dokumen soal: tidak
    // boleh ada answerIndex/correctIndices/etc. di dalamnya.
    for (const [suffix, pubSub] of [
      ['bool', { type: 'boolean', correctBoolean: true }],
      ['single', { type: 'single', options: ['A', 'B'], answerIndex: 0 }],
      ['short', { type: 'short_answer', acceptedAnswers: ['x'] }],
      ['multi', { type: 'multiple', options: ['A', 'B'], correctIndices: [0] }],
      ['num', { type: 'numerical', correctValue: 1 }],
      ['match', { type: 'matching', matchLeft: ['1', '2'], matchRight: ['satu', 'dua'],
        pairs: [{ left: '1', right: 'satu' }, { left: '2', right: 'dua' }] }],
      ['order', { type: 'ordering', orderItems: ['a', 'b'], items: ['a', 'b'] }]
    ]) {
      await assertFails(putQuestion(alice, `qk_cs_leak_${suffix}`, {
        type: 'case_study', caseText: 'Kasus', subQuestions: [pubSub]
      }));
    }
  });

  await it('CP1/CS: sub-soal kunci tidak boleh membawa material publik', async () => {
    await putQuestion(alice, 'qk_cs_pub', {
      type: 'case_study', caseText: 'Kasus', subQuestions: [{ type: 'single', options: ['A', 'B'] }]
    });
    // `prompt`/`options` di dokumen kunci = dua sumber kebenaran.
    await assertFails(putKey(alice, 'qk_cs_pub', {
      type: 'case_study', subQuestions: [{ type: 'single', answerIndex: 0, prompt: 'bocor' }]
    }, '2'));
    // `matchLeft` di dokumen kunci = kumpulan publik bocor ke dokumen privat.
    await assertFails(putKey(alice, 'qk_cs_pub', {
      type: 'case_study', subQuestions: [{ type: 'single', answerIndex: 0, matchLeft: ['1'] }]
    }, '3'));
  });

  await it('CP1/CS: nested >1 tingkat DITOLAK rules (publik & kunci)', async () => {
    // Sub-soal PUBLIK yang membawa subQuestions sendiri = nesting tingkat 2.
    await assertFails(putQuestion(alice, 'qk_cs_nested', {
      type: 'case_study',
      caseText: 'Kasus',
      subQuestions: [{
        type: 'single',
        options: ['A', 'B'],
        subQuestions: [{ type: 'boolean' }]
      }]
    }));
    // Varian kunci `subQuestion` (singular) juga ditolak.
    await assertFails(putQuestion(alice, 'qk_cs_nested2', {
      type: 'case_study',
      caseText: 'Kasus',
      subQuestions: [{ type: 'boolean', subQuestion: { type: 'boolean' } }]
    }));
    // Tipe yang butuh manual / nesting tidak boleh jadi sub-soal PUBLIK.
    for (const [suffix, sub] of [
      ['essay', { type: 'essay' }],
      ['code', { type: 'code', starterCode: 'x' }],
      ['case', { type: 'case_study', caseText: 'x' }],
      ['unknown', { type: 'mystery' }],
      ['notype', {}]
    ]) {
      await assertFails(putQuestion(alice, `qk_cs_bad_${suffix}`, {
        type: 'case_study', caseText: 'Kasus', subQuestions: [sub]
      }));
    }
    // DAN tidak boleh jadi sub-soal KUNCI.
    await putQuestion(alice, 'qk_cs_badsub_pub', {
      type: 'case_study', caseText: 'Kasus', subQuestions: [{ type: 'boolean' }]
    });
    for (const [suffix, sub] of [
      ['essay', { type: 'essay', sampleAnswer: 'x' }],
      ['case', { type: 'case_study', subQuestions: [] }],
      ['unknown', { type: 'mystery' }]
    ]) {
      await assertFails(putKey(alice, 'qk_cs_badsub_pub', {
        type: 'case_study', subQuestions: [sub]
      }, `k_${suffix}`));
    }
    // Kunci bersarang dua tingkat juga ditolak.
    await assertFails(putKey(alice, 'qk_cs_badsub_pub', {
      type: 'case_study',
      subQuestions: [{ type: 'boolean', correctBoolean: true, subQuestions: [{ type: 'boolean' }] }]
    }, 'k_nested'));
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
    // Fixture sendiri: blok CP1-A yang di atas memakai id `qk_*`, jadi dokumen
    // yang diuji di sini dibuat eksplisit (tidak bergantung soal lain).
    await assertSucceeds(putQuestion(alice, 'qa_private_own', { visibility: 'private' }));
    // Private: hanya owner.
    await assertFails(getDoc(doc(fsDb(bob), 'spaces/space1/questions/qa_private_own')));
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/questions/qa_private_own')));
    // Shared: partner boleh membaca…
    await assertSucceeds(putQuestion(alice, 'qa_shared_new', { visibility: 'shared' }));
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

  // ---------- quizzes (CP1 foundation) ----------
  // CATATAN CP2: `questionCount` tidak lagi ada di settings — jumlah soal kuis
  // = panjang `questionIds`. Key-nya kini ditolak `hasOnly`.
  const quizSettings = (o = {}) => ({
    randomizeQuestionOrder: false,
    randomizeOptionOrder: false,
    timeLimitMinutes: 0,
    passingScorePercent: 70,
    maxAttempts: 3,
    showAnswerMode: 'after_all',
    showExplanation: true,
    allowRetry: true,
    ...o
  });

  const quizData = (o = {}) => ({
    title: 'Kuis Matematika',
    description: 'Bab 1',
    topicId: 'topic1',
    questionIds: ['q_ok_shared', 'q_2opsi'],
    settings: quizSettings(),
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    ...o
  });

  const quizIds = (n) => Array.from({ length: n }, (_, i) => `q${i + 1}`);

  await it('CP1/QUIZ: anggota membuat kuis valid; non-member & createdBy palsu ditolak', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok'), quizData()));
    // Kuis boleh bercampur soal: snapshot boleh menunjuk soal shared maupun
    // milik sendiri, dan questionIds TIDAK harus terurut.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_1soal'),
      quizData({ questionIds: ['q_ok_shared'] })));
    // createdBy harus pemanggil.
    await assertFails(setDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_paksa'),
      quizData({ createdBy: 'alice' })));
    // Anggota ruang lain (carol) tidak boleh membuat kuis di space1.
    await assertFails(setDoc(doc(fsDb(carolCP3), 'spaces/space1/quizzes/qu_asing'),
      quizData({ createdBy: 'carol' })));
    // Anonim juga ditolak.
    await assertFails(setDoc(doc(fsDb(unauthed()), 'spaces/space1/quizzes/qu_anon'),
      quizData({ createdBy: 'anon' })));
  });

  await it('CP1/QUIZ: kedua anggota boleh baca; non-member ditolak', async () => {
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_ok')));
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/quizzes/qu_ok')));
    await assertFails(getDoc(doc(fsDb(unauthed()), 'spaces/space1/quizzes/qu_ok')));
    // List polos untuk anggota sah (aturan read = isMember tanpa filter field).
    const listAlice = await getDocs(collection(fsDb(alice), 'spaces/space1/quizzes'));
    assert.equal(listAlice.docs.length, 2);
    await assertFails(getDocs(collection(fsDb(carolCP3), 'spaces/space1/quizzes')));
  });

  await it('CP1/QUIZ: hanya pembuat yang boleh update; createdBy & createdAt immutable', async () => {
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok'), {
      title: 'Kuis Matematika (revisi)',
      questionIds: ['q_2opsi', 'q_ok_shared', 'q_20opsi'],
      settings: quizSettings({ timeLimitMinutes: 15, showAnswerMode: 'after_each' }),
      updatedAt: serverTimestamp()
    }));
    // Partner boleh baca tapi tidak boleh mengubah / mengambil alih kuis.
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_ok'),
      { title: 'Dibajak', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_ok'), { createdBy: 'bob' }));
    // createdBy & createdAt tidak bisa diubah oleh pemiliknya sendiri.
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok'), { createdBy: 'bob' }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok'),
      { createdAt: new Date() }));
    // createdBy tidak boleh "diambil" walau field lain sah.
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_ok'),
      { createdBy: 'carol', title: 'Judul baru', updatedAt: serverTimestamp() }));
  });

  await it('CP1/QUIZ: snapshot questionIds — batas 50, duplikat & struktur salah ditolak', async () => {
    // 50 soal (batas atas) sah.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_50'),
      quizData({ questionIds: quizIds(50) })));
    // 51 soal ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_51'),
      quizData({ questionIds: quizIds(51) })));
    // 0 soal SAH: kuis dibuat sebagai draft lalu soal ditambahkan dari editor.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_draft'),
      quizData({ questionIds: [] })));
    // Menu ke draft kosong juga sah (mis. semua soal dikeluarkan dari kuis).
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_50'),
      { questionIds: [], updatedAt: serverTimestamp() }));
    // 51 soal ditolak.
    // Duplikat ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_dup'),
      quizData({ questionIds: ['q_ok_shared', 'q_ok_shared'] })));
    // Elemen non-string / kosong ditolak (indeks 0 diperiksa rules).
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_angka'),
      quizData({ questionIds: [1, 2, 3, 4] })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_kosongis'),
      quizData({ questionIds: [''] })));
    // questionIds bukan list ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_bukanlist'),
      quizData({ questionIds: 'q_ok_shared' })));
    // Batas yang sama berlaku saat update snapshot.
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_50'),
      { questionIds: quizIds(51) }));
    await assertFails(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_50'),
      { questionIds: ['a', 'a'] }));
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_50'),
      { questionIds: ['a', 'b'], updatedAt: serverTimestamp() }));
  });

  await it('CP1/QUIZ: manifest kunci (questionKeyRevisions) boleh ditulis & dibaca', async () => {
    // `questionKeyRevisions` = nomor revisi kunci yang dikunci kuis ini. Client
    // menulisnya setiap kali `questionIds` berubah (quizService
    // `updateQuizQuestionIds`), supaya attempt yang dimulai di kemudian hari
    // dinilai terhadap kunci versi yang sama.
    //
    // Yang TIDAK ada di sini: isi kunci. Yang disimpan cuma NOMOR revisi, dan
    // dokumen soal tetap bebas kunci - jadi manifest ini tidak melemahkan
    // pemisahan kunci sedikit pun.
    const manifest = { q_ok_shared: '2', q_2opsi: '1' };
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pin'),
      quizData({ questionKeyRevisions: manifest })));
    // Manifest boleh di-update (kuis menambah/mengurangi soal) oleh pembuatnya.
    await assertSucceeds(updateDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pin'), {
      questionIds: ['q_ok_shared'],
      questionKeyRevisions: { q_ok_shared: '2' },
      updatedAt: serverTimestamp()
    }));
    // Manifest kosong sah: kuis yang soal-soalnya belum punya revisi (kuis lama
    // sebelum fitur ini) tetap boleh disimpan tanpa pin.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pinkosong'),
      quizData({ questionKeyRevisions: {} })));
    // Manifest TIDAK boleh lebih banyak dari soal yang ada di kuis: pin untuk
    // soal yang sudah dikeluarkan tidak ada gunanya, dan rules tidak bisa
    // memeriksa isi map key satu per satu.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pinbesar'),
      quizData({
        questionIds: ['q_ok_shared'],
        questionKeyRevisions: { q_ok_shared: '1', q_2opsi: '1', q_ok_shared2: '1' }
      })));
    // Field bukan map ditolak.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pinbukanmap'),
      quizData({ questionKeyRevisions: ['q_ok_shared'] })));
    // Manifest tidak undermined kontrol akses kuis: non-member tetap tidak
    // boleh menulis kuis, dan partner boleh membaca (hanya nomor revisi).
    await assertFails(setDoc(doc(fsDb(carolCP3), 'spaces/space1/quizzes/qu_pin'),
      quizData({ questionKeyRevisions: manifest })));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_pin')));
    await assertFails(getDoc(doc(fsDb(carolCP3), 'spaces/space1/quizzes/qu_pin')));
  });

  await it('CP1/QUIZ: field dasar & struktur tidak valid ditolak', async () => {
    // Judul wajib & batas panjang.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_judulkosong'),
      quizData({ title: '' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_judulpanjang'),
      quizData({ title: 'x'.repeat(201) })));
    // Deskripsi wajib string & batas panjang.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_deskripsiAngka'),
      quizData({ description: 42 })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_deskripsiPanjang'),
      quizData({ description: 'y'.repeat(2001) })));
    // Topik wajib diisi dan harus benar-benar ada.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_topikKosong'),
      quizData({ topicId: '' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_topikHantu'),
      quizData({ topicId: 'tidak_ada' })));
    // createdBy harus pemanggil, createdAt wajib ada, schemaVersion dikunci.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_bikuncibuatan'),
      quizData({ createdBy: 'bob' })));
    const tanpaCreatedAt = quizData();
    delete tanpaCreatedAt.createdAt;
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_tanpaCreatedAt'), tanpaCreatedAt));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_skemaSalah'),
      quizData({ schemaVersion: 2 })));
  });

  await it('CP1/QUIZ: settings divalidasi per-field (tipe, rentang, enum, kunci asing)', async () => {
    // Batas atas yang sah diterima.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_setMaks'),
      quizData({ settings: quizSettings({
        timeLimitMinutes: 480, passingScorePercent: 100, maxAttempts: 20
      }) })));
    // CP2: `questionCount` bukan lagi field valid — rules menolak lewat hasOnly.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_countLama'),
      quizData({ settings: quizSettings({ questionCount: 5 }) })));
    // Rentang nilai dilanggar.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_waktuMaks'),
      quizData({ settings: quizSettings({ timeLimitMinutes: 481 }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_lulusAngka'),
      quizData({ settings: quizSettings({ passingScorePercent: 101 }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_coba0'),
      quizData({ settings: quizSettings({ maxAttempts: 0 }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_coba21'),
      quizData({ settings: quizSettings({ maxAttempts: 21 }) })));
    // Tipe salah: bool & int tidak boleh tertukar, mode harus dari enum.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_retryString'),
      quizData({ settings: quizSettings({ allowRetry: 'true' }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_acakAngka'),
      quizData({ settings: quizSettings({ randomizeQuestionOrder: 1 }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_modeNgawur'),
      quizData({ settings: quizSettings({ showAnswerMode: 'selalu' }) })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_pembahasanAngka'),
      quizData({ settings: quizSettings({ showExplanation: 1 }) })));
    // Kunci asing ditolak (settings dikunci hasOnly).
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_kunciAsing'),
      quizData({ settings: quizSettings({ autoSubmit: true }) })));
    // settings wajib ada & berupa map.
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_settingsAngka'),
      quizData({ settings: 7 })));
    const tanpaSettings = quizData();
    delete tanpaSettings.settings;
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_tanpaSettings'), tanpaSettings));
  });

  await it('CP1/QUIZ: hapus hanya pembuat; Question document tidak ikut terhapus', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_purge'), quizData()));
    // Partner boleh baca tapi tidak boleh menghapus.
    await assertFails(deleteDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_purge')));
    await assertFails(deleteDoc(doc(fsDb(carolCP3), 'spaces/space1/quizzes/qu_purge')));
    // Pembuat boleh menghapus kuisnya.
    await assertSucceeds(deleteDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_purge')));
    // Dokumen benar-benar hilang. CATATAN: getDoc TIDAK dipakai di sini sebagai
    // pembuktian — aturan read kuis hanya `isMember` (tidak bergantung
    // resource.data), jadi membaca dokumen yang sudah terhapus tetap succeed
    // dan hanya mengembalikan `exists() === false`.
    const setelahHapus = await getDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_purge'));
    assert.equal(setelahHapus.exists(), false);
    // Konsekuensi penting: soal yang dipakai kuis itu UTUH di bank soal.
    await assertSucceeds(getDoc(doc(fsDb(alice), 'spaces/space1/questions/q_ok_shared')));
    await assertSucceeds(getDoc(doc(fsDb(bob), 'spaces/space1/questions/q_ok_shared')));
  });

  // ==========================================================
  // CP2 — attempts v3 (nested di bawah quizzes/{quizId})
  // ==========================================================
  // Kuis induk wajib ada: validQuizAttempt menolak attempt pada quiz hantu.
  // CATATAN NAMA: prefiks `cp2` dipakai agar tidak bentrok dengan helper
  // `attemptData` milik blok legacy `quizAttempts` (CP3-era) di atas.
  //
  // PERUBAHAN KONTRAK (security migration): attempt yang boleh DIBUAT sekarang
  // hanya v3. v2 (skor ditulis client + snapshot menyalin kunci) tidak lagi
  // boleh dibuat, tapi attempt v2 yang sudah terlanjur ada tetap bisa dibaca dan
  // di-update sesuai aturan lamanya (grandfathered). Lihat blok test v2 di bawah.
  //
  // Snapshot v3 TIDAK boleh memuat kunci apa pun. Kunci dibaca server dari
  // `questions/{qid}/key/{keyRevision}`; peserta tidak pernah membaca-nya.

  // Snapshot v3: material publik saja. `keyRevision` WAJIB ada supaya server
  // tahu kunci mana yang dipakai (snapshotV3.js selalu mengisinya).
  const cp2Snap = (o = {}) => ({
    id: 'cp2q1',
    keyRevision: '1',
    type: 'single',
    prompt: 'Berapa 1 + 1?',
    points: 10,
    options: ['1', '2', '3', '4'],
    ...o
  });

  // Soal yang sudah hilang saat attempt dimulai (kasus tepi). Tetap perlu
  // `keyRevision` supaya attempt lama tidak berubah makna bila soal muncul lagi.
  const cp2SnapUnavailable = (o = {}) => ({
    id: 'cp2q_hilang',
    keyRevision: '1',
    type: 'unavailable',
    prompt: '',
    points: 0,
    available: false,
    ...o
  });

  // Entri jawaban v3. TIDAK memuat `isCorrect`/`pointsEarned`/`needsManualGrade`:
  // itu hasil penilaian server. Client hanya menulis `userAnswer`.
  const cp2Answer = (o = {}) => ({
    questionId: 'cp2q1',
    userAnswer: 1,
    ...o
  });

  // Attempt v3 saat dibuat: BELUM ada skor. Skor adalah field server.
  const cp2Attempt = (o = {}) => ({
    uid: 'alice',
    quizId: 'qu_cp2',
    startedAt: serverTimestamp(),
    questionSnapshot: [cp2Snap()],
    answers: [cp2Answer()],
    status: 'in_progress',
    schemaVersion: 3,
    ...o
  });

  const attemptPath = (id, quiz = 'qu_cp2') => `spaces/space1/quizzes/${quiz}/attempts/${id}`;

  // ---------- fixture: kuis milik bob berisi soal miliknya ----------
  //
  // PENTING untuk author exclusion (P2): alice TIDAK boleh mengerjakan kuis
  // yang memuat soal miliknya sendiri. Semua test attempt di bawah memakai
  // `qu_cp2` yang soal-soalnya dibuat oleh BOB, sehingga alice boleh mulai.
  await putQuestion(bob, 'cp2q1', { visibility: 'shared', options: ['1', '2', '3', '4'] });
  await putQuestion(bob, 'cp2q2', { visibility: 'shared', options: ['Ya', 'Tidak'] });
  await assertSucceeds(setDoc(doc(fsDb(bob), 'spaces/space1/quizzes/qu_cp2'),
    quizData({ createdBy: 'bob', questionIds: ['cp2q1', 'cp2q2'] })));

  await it('CP2/ATTEMPT: attempts privat — owner baca sendiri, user lain tidak bisa', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_privat')), cp2Attempt()));
    await assertSucceeds(getDoc(doc(fsDb(alice), attemptPath('at_privat'))));
    // Partner (anggota space) TIDAK boleh membaca attempt orang lain.
    await assertFails(getDoc(doc(fsDb(bob), attemptPath('at_privat'))));
    await assertFails(getDoc(doc(fsDb(carolCP3), attemptPath('at_privat'))));
    // List pun tidak menyingkapkan attempt partner.
    await assertFails(getDocs(collection(fsDb(bob), 'spaces/space1/quizzes/qu_cp2/attempts')));
  });

  await it('CP2/ATTEMPT: create v3 valid hanya untuk pemilik; uid/status palsu ditolak', async () => {
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_create')),
      cp2Attempt({
        questionSnapshot: [cp2Snap(), cp2Snap({ id: 'cp2q2', options: ['Ya', 'Tidak'] })],
        answers: [cp2Answer(), cp2Answer({ questionId: 'cp2q2' })]
      })));
    // uid harus pemanggil.
    await assertFails(setDoc(doc(fsDb(bob), attemptPath('at_uidPalsu')), cp2Attempt({ uid: 'alice' })));
    // Attempts hanya boleh dibuat dengan status in_progress.
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_langsungSelesai')),
      cp2Attempt({ status: 'completed' })));
    // quizId harus cocok dengan path, dan kuis harus benar-benar ada.
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_quizIdPalsu')),
      cp2Attempt({ quizId: 'qu_lain' })));
    await assertFails(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_hantu/attempts/at1'),
      cp2Attempt({ quizId: 'qu_hantu' })));
    // Jumlah answers harus sama dengan questionSnapshot.
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_answersKosong')), cp2Attempt({ answers: [] })));
    // Non-member tidak boleh membuat attempt.
    await assertFails(setDoc(doc(fsDb(carolCP3), attemptPath('at_carol')), cp2Attempt({ uid: 'carol' })));
  });

  await it('CP2/ATTEMPT: P2 author exclusion — soal sendiri tidak boleh dikerjakan', async () => {
    // `qu_milik_sendiri` memuat `q_ok_shared` yang dibuat oleh ALICE.
    await assertSucceeds(setDoc(doc(fsDb(alice), 'spaces/space1/quizzes/qu_milik_sendiri'),
      quizData({ questionIds: ['q_ok_shared'] })));
    // MEMBUAT attempt = dinilai soal sendiri = DENY.
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_author', 'qu_milik_sendiri')),
      cp2Attempt({ quizId: 'qu_milik_sendiri', questionSnapshot: [cp2Snap({ id: 'q_ok_shared' })] })));
    // Sebaliknya: `qu_cp2` memuat soal BOB, jadi alice BOLEH mulai.
    // Ini yang membuktikan aturan tidak menolak semua orang, hanya penulisnya.
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_bukan_author')),
      cp2Attempt({ questionSnapshot: [cp2Snap({ id: 'cp2q1' })] })));
  });

  await it('CP2/ATTEMPT: snapshot v3 bebas kunci — tiap field kunci DITOLAK', async () => {
    // Ini adalah heart dari pemisahan kunci: kalau satu saja field kunci ini
    // lolos ke snapshot, peserta bisa menilai sendiri memakai `grading.js` yang
    // memang ikut ter-bundle di client.
    const keyLeaks = [
      ['answerIndex', { answerIndex: 1 }],
      ['correctIndices', { correctIndices: [1] }],
      ['correctBoolean', { correctBoolean: true }],
      ['acceptedAnswers', { acceptedAnswers: ['2'] }],
      ['sampleAnswer', { sampleAnswer: 'jawaban' }],
      ['pairs', { pairs: [{ left: '1', right: 'satu' }] }],
      ['items', { items: ['a', 'b'] }],
      ['correctValue', { correctValue: 2 }],
      ['tolerance', { tolerance: 1 }],
      ['expectedOutput', { expectedOutput: '1' }],
      ['sampleSolution', { sampleSolution: 'rahasia' }],
      ['pairDraft', { pairDraft: { lefts: ['1'], rights: ['satu'], assigned: [0] } }],
      ['explanation', { explanation: 'kuncinya 2' }]
    ];
    for (const [i, [label, leak]] of keyLeaks.entries()) {
      try {
        await assertFails(setDoc(doc(fsDb(alice), attemptPath(`at_leak_${i}`)),
          cp2Attempt({ questionSnapshot: [cp2Snap(leak)] })));
      } catch (err) {
        throw new Error(`[${i}] ${label}: ${err.message}`);
      }
    }
    // `matching`/`ordering` tetap boleh — tapi HANYA dengan bentuk publiknya.
    // `matchLeft`/`matchRight`/`orderItems` = material, `pairs`/`items` = kunci.
    //
    // CATATAN: `options` TIDAK boleh di-set ke `undefined` untuk-soal matching.
    // Firestore SDK menolak nilai `undefined` sebelum rules sempat dievaluasi,
    // jadi testnya akan gagal karena alasan yang salah. Field-nya harus dihapus
    // dari objek, bukan diisi `undefined`.
    const snapWithoutOptions = (o) => {
      const { options: _buang, ...sisa } = cp2Snap(o);
      return sisa;
    };
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_snap_match_ok')),
      cp2Attempt({
        questionSnapshot: [snapWithoutOptions({ type: 'matching',
          matchLeft: ['1', '2'], matchRight: ['satu', 'dua'] })],
        answers: [cp2Answer()]
      })));
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_snap_order_ok')),
      cp2Attempt({
        questionSnapshot: [snapWithoutOptions({ type: 'ordering', orderItems: ['a', 'b'] })],
        answers: [cp2Answer()]
      })));
  });

  await it('CP2/ATTEMPT: snapshot v3 bentuk salah & user lain ditolak', async () => {
    // CATATAN: jangan pakai nilai `undefined` di fixture — Firestore SDK menolaknya
    // sebelum rules sempat dievaluasi, jadi testnya akan gagal karena alasan salah.
    const bad = [
      ['id saja, tanpa isi soal', { id: 'q_id_only', type: 'single', prompt: 'Tanpa opsi', points: 10 }],
      ['tipe tidak dikenal', cp2Snap({ type: 'mystery' })],
      ['tanpa id', cp2Snap({ id: '' })],
      ['prompt bukan string', cp2Snap({ prompt: 42 })],
      ['poin 0 untuk soal nyata', cp2Snap({ points: 0 })],
      ['poin melebihi batas', cp2Snap({ points: 101 })],
      // Tanpa `keyRevision`, server tidak tahu kunci mana yang dipakai.
      ['tanpa keyRevision', { id: 'q_ok_shared', type: 'single', prompt: 'x', points: 10, options: ['A', 'B'] }],
      ['keyRevision bukan angka', cp2Snap({ keyRevision: 'r1' })],
      ['entri unavailable menyamar sebagai soal utuh', cp2SnapUnavailable({ available: true })],
      ['entri unavailable membawa kunci', cp2SnapUnavailable({ answerIndex: 0 })],
      ['entri unavailable bukan 0 poin', cp2SnapUnavailable({ points: 10 })],
      ['entri unavailable membawa options', cp2SnapUnavailable({ options: ['A', 'B'] })],
      ['soal nyata menyamar available:false', cp2Snap({ available: false })]
    ];
    for (const [i, [label, entry]] of bad.entries()) {
      // Label dibungkus ke dalam error supaya kegagalan tahu fixture mana yang
      // bocor.
      try {
        await assertFails(
          setDoc(doc(fsDb(alice), attemptPath(`at_snap_${i}`)), cp2Attempt({ questionSnapshot: [entry] })
        ));
      } catch (err) {
        throw new Error(`[${i}] ${label}: ${err.message}`);
      }
    }
    // Bentuk yang valid DITERIMA, termasuk entri `unavailable` untuk soal yang
    // sudah hilang sebelum attempt dimulai.
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_snap_ok')),
      cp2Attempt({
        questionSnapshot: [cp2Snap(), cp2SnapUnavailable()],
        answers: [cp2Answer(), cp2Answer({ questionId: 'cp2q_hilang' })]
      })));
    // (c) Snapshot TIDAK BOLEH diubah user lain — partner maupun non-member.
    await assertFails(updateDoc(doc(fsDb(bob), attemptPath('at_snap_ok')),
      { questionSnapshot: [cp2Snap({ prompt: 'revisi' })] }));
    await assertFails(updateDoc(doc(fsDb(carolCP3), attemptPath('at_snap_ok')),
      { questionSnapshot: [cp2Snap({ prompt: 'revisi' })] }));
    // (d) Owners sendiri tidak boleh menyusun ulang snapshot (immutable).
    // CATATAN: nilai HARUS benar-benar berbeda — `changed()` tidak menghitung
    // key yang nilainya tidak berubah, jadi menulis nilai yang sama lolos
    // sebagai no-op.
    await assertFails(updateDoc(doc(fsDb(alice), attemptPath('at_snap_ok')),
      { questionSnapshot: [cp2Snap({ prompt: 'Berapa 1 + 1? (revisi)' })] }));
  });

  await it('CP2/ATTEMPT: score fields server-owned — client tidak boleh menulisnya', async () => {
    const p = attemptPath('at_score');
    await assertSucceeds(setDoc(doc(fsDb(alice), p), cp2Attempt()));
    // Klaim "nilai sempurna" harus ditolak,aunque nilainya terlihat benar.
    // Inilah celah yang ditutup migrasi ini: sebelumnya owner bisa menulis
    // skornya sendiri lalu menandai attempt selesai.
    for (const [field, value] of [
      ['score', 10],
      ['maxScore', 10],
      ['scorePercent', 100],
      ['passed', true],
      ['isAuthoritative', true],
      ['gradedAt', new Date()],
      ['scoreSource', 'server'],
      ['answersHash', 'abc123'],
      ['pendingManualCount', 0]
    ]) {
      await assertFails(updateDoc(doc(fsDb(alice), p), { [field]: value }));
    }
    // Tulisan gabungan "semua field nilai sekaligus" juga ditolak.
    await assertFails(updateDoc(doc(fsDb(alice), p), {
      score: 10, maxScore: 10, scorePercent: 100, passed: true,
      isAuthoritative: true, scoreSource: 'server', gradedAt: new Date()
    }));
  });

  await it('CP2/ATTEMPT: answers hanya boleh memuat jawaban peserta', async () => {
    const p = attemptPath('at_answers');
    await assertSucceeds(setDoc(doc(fsDb(alice), p), cp2Attempt()));
    // Menyimpan jawaban saat masih berjalan = ALLOW.
    await assertSucceeds(updateDoc(doc(fsDb(alice), p), { answers: [cp2Answer({ userAnswer: 2 })] }));
    // Metadata penilaian TIDAK boleh ikut ditulis peserta.
    //
    // CATATAN: destrukturnya `[label, extra]`, BUKAN `[i, extra]` dari
    // `.entries()`. Kalau `.entries()` dipakai, `extra` berisi ARRAY
    // `[label, objek]`, jadi `...extra` menyetop jadi properti '0' dan '1' -
    // field `isCorrect` dkk. sama sekali tidak pernah ditulis, dan setiap
    // assertFails di bawah jadi lulus karena alasan yang salah.
    for (const [label, extra] of [
      ['isCorrect', { isCorrect: true }],
      ['pointsEarned', { pointsEarned: 10 }],
      ['needsManualGrade', { needsManualGrade: false }],
      ['manualScore', { manualScore: 10 }],
      ['gradedBy', { gradedBy: 'alice' }],
      ['gradedAt', { gradedAt: new Date() }],
      // `fraction` sengaja TIDAK pernah disimpan di answers[] (grading.js tidak
      // menghasilkannya) — jadi tidak boleh ada.
      ['fraction', { fraction: 1 }],
      ['isAuthoritative', { isAuthoritative: true }]
    ]) {
      await assertFails(updateDoc(doc(fsDb(alice), p), {
        answers: [cp2Answer({ userAnswer: 2, ...extra })]
      }), label);
    }
    // Membawa kunci di dalam entri jawaban juga DENY.
    await assertFails(updateDoc(doc(fsDb(alice), p), {
      answers: [cp2Answer({ userAnswer: 2, correctIndices: [2] })]
    }));
  });

  await it('CP2/ATTEMPT: transisi status — peserta hanya boleh in_progress → pending_grading', async () => {
    const p = attemptPath('at_status');
    await assertSucceeds(setDoc(doc(fsDb(alice), p), cp2Attempt()));
    // Tetap in_progress sambil menyimpan jawaban = ALLOW.
    await assertSucceeds(updateDoc(doc(fsDb(alice), p), { answers: [cp2Answer({ userAnswer: 2 })] }));
    // Menyerahkan jawaban: set submittedAt + pending_grading = ALLOW.
    await assertSucceeds(updateDoc(doc(fsDb(alice), p), {
      submittedAt: serverTimestamp(),
      status: 'pending_grading'
    }));
    // Status akhir adalah keputusan server. Peserta tidak boleh menandainya
    // sendiri, karena itu akan menampilkan hasil tanpa nilai.
    for (const st of ['pending_manual_grade', 'graded', 'completed']) {
      await assertFails(updateDoc(doc(fsDb(alice), p), { status: st }));
    }
    // pending_grading tanpa submittedAt = DENY (server tidak akan menilai).
    await assertSucceeds(setDoc(doc(fsDb(alice), attemptPath('at_status2')), cp2Attempt()));
    await assertFails(updateDoc(doc(fsDb(alice), attemptPath('at_status2')), { status: 'pending_grading' }));
  });

  // Attempt yang sudah DIKIRIM dengan satu soal manual. Perlu dua langkah:
  // create selalu `in_progress`, lalu di-update ke `pending_grading` +
  // `submittedAt` oleh pemiliknya. Status `pending_manual_grade` datang dari
  // server (Functions), bukan dari client.
  const seedSubmitted = async (path) => {
    await assertSucceeds(setDoc(doc(fsDb(alice), path), cp2Attempt()));
    await assertSucceeds(updateDoc(doc(fsDb(alice), path), {
      submittedAt: serverTimestamp(),
      status: 'pending_grading'
    }));
    // Simulasikan hasil Functions: attempt dengan satu soal manual + nilai
    // otoritatif. Ditulis dengan rules off karena Admin SDK Producer nilai
    // seperti inilah (melewati rules).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), {
        ...cp2Attempt(),
        submittedAt: new Date(),
        status: 'pending_manual_grade',
        score: 0,
        maxScore: 10,
        scorePercent: 0,
        passed: false,
        isAuthoritative: false,
        scoreSource: 'server',
        gradedAt: new Date()
      });
    });
  };

  await it('CP2/ATTEMPT: partner boleh nilai manual — hanya field manual', async () => {
    const p = attemptPath('at_manual');
    await seedSubmitted(p);
    // CATATAN: `serverTimestamp()` TIDAK boleh dipakai di dalam array — SDK
    // menolaknya. Karena `gradedAt` berada di dalam entri `answers`, test memakai
    // timestamp konkret. Konsekuensi sama untuk kode produksi.
    const withScore = [cp2Answer({
      manualScore: 8, manualFeedback: 'Bagus', gradedBy: 'bob', gradedAt: new Date()
    })];
    // Partner (anggota space) boleh menulis nilai manual pada attempt terkirim.
    await assertSucceeds(updateDoc(doc(fsDb(bob), p), { answers: withScore }));
    // Non-member TIDAK boleh — bahkan pada field manual.
    await assertFails(updateDoc(doc(fsDb(carolCP3), p), { answers: withScore }));
    // Partner tidak boleh menyentuh field skor otoritatif.
    await assertFails(updateDoc(doc(fsDb(bob), p), { score: 100 }));
    await assertFails(updateDoc(doc(fsDb(bob), p), { questionSnapshot: [cp2Snap({ prompt: 'x' })] }));
    // CATATAN: nilai yang TIDAK berubah tidak dihitung `changed()`, jadi untuk
    // membuktikan field terlarang selalu dikunci, nilai baru harus benar-benar
    // berbeda dari yang tersimpan.
    await assertFails(updateDoc(doc(fsDb(bob), p), { maxScore: 999 }));
    await assertFails(updateDoc(doc(fsDb(bob), p), { scorePercent: 100 }));
    await assertFails(updateDoc(doc(fsDb(bob), p), { passed: true }));
    await assertFails(updateDoc(doc(fsDb(bob), p), { status: 'graded' }));
    await assertFails(updateDoc(doc(fsDb(bob), p), { gradedAt: new Date() }));
    // Partner tidak boleh menyamarkan perubahan `userAnswer` saat menulis nilai
    // manual (jawaban peserta harus tetap sama).
    await assertFails(updateDoc(doc(fsDb(bob), p), { answers: [cp2Answer({ userAnswer: 99, manualScore: 10 })] }));
    // Jumlah array answers harus sama.
    await assertFails(updateDoc(doc(fsDb(bob), p), { answers: [] }));
  });

  await it('CP2/ATTEMPT: partner tidak boleh menilai attempt yang belum dikirim', async () => {
    const p = attemptPath('at_baru');
    await assertSucceeds(setDoc(doc(fsDb(alice), p), cp2Attempt()));
    // Belum ada `submittedAt` → partner tidak boleh menilai.
    await assertFails(updateDoc(doc(fsDb(bob), p), { answers: [cp2Answer({ manualScore: 8 })] }));
  });

  await it('CP2/ATTEMPT: owner TIDAK boleh finalisasi skor (server yang berwenang)', async () => {
    const p = attemptPath('at_final');
    await seedSubmitted(p);
    // DULUYA test ini mengizinkan owner menutup attempt dengan skor. Sekarang
    // DENY: pemilik attempt tidak boleh menulis nilai, termasuk miliknya sendiri.
    // Score/maxScore/scorePercent/passed/isAuthoritative semuanya milik server.
    await assertFails(updateDoc(doc(fsDb(alice), p), {
      score: 8, maxScore: 10, scorePercent: 80, passed: true, status: 'graded'
    }));
    await assertFails(updateDoc(doc(fsDb(alice), p), { status: 'graded' }));
    await assertFails(updateDoc(doc(fsDb(alice), p), { status: 'completed' }));
    // Attempt adalah catatan historis: tidak boleh dihapus siapa pun.
    await assertFails(deleteDoc(doc(fsDb(alice), p)));
    await assertFails(deleteDoc(doc(fsDb(bob), p)));
  });

  // ---------- legacy v2 ----------
  //
  // "Legacy v2 adalah kompatibilitas historis, BUKAN jalur pembuatan baru."
  //
  // Attempt v2 yang sudah terlanjur ada harus tetap bisa dibaca (dipakai untuk
  // review hasil lama) dan boleh memakai aturan mainnya sendiri. Yang DITUTUP
  // adalah pembuatan v2 baru: kalau masih bisa dibuat, peserta bisa memilih
  // versi yang skornya ditulis client.
  const v2AttemptData = (o = {}) => ({
    uid: 'alice',
    quizId: 'qu_cp2',
    startedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    durationSeconds: 60,
    questionSnapshot: [{
      id: 'cp2q1',
      type: 'single',
      prompt: 'Berapa 1 + 1?',
      points: 10,
      options: ['1', '2', '3', '4'],
      answerIndex: 1
    }],
    answers: [{
      questionId: 'cp2q1',
      userAnswer: 1,
      isCorrect: true,
      pointsEarned: 10,
      needsManualGrade: false,
      manualScore: null,
      manualFeedback: '',
      gradedBy: null,
      gradedAt: null
    }],
    score: 10,
    maxScore: 10,
    scorePercent: 100,
    passed: true,
    status: 'completed',
    schemaVersion: 2,
    ...o
  });

  it('CP2/ATTEMPT v2: attempt legacy yang sudah ada tetap terbaca & bisa diubah', async () => {
    // Disemai dengan rules off = meniru attempt v2 yang sudah terlanjur ada di
    // production sebelum migrasi.
    const p = attemptPath('at_legacy');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), p), v2AttemptData());
    });
    // (1) READ: pemilik masih boleh membaca attempt lamanya.
    await assertSucceeds(getDoc(doc(fsDb(alice), p)));
    // Partner tetap tidak boleh — privasi attempt tidak berubah untuk data lama.
    await assertFails(getDoc(doc(fsDb(bob), p)));
    // (2) UPDATE: aturan v2 lama tetap berlaku (recompute oleh owner).
    // `answers` terkunci karena status sudah `completed`.
    await assertSucceeds(updateDoc(doc(fsDb(alice), p), {
      score: 8, maxScore: 10, scorePercent: 80, passed: true
    }));
    await assertFails(updateDoc(doc(fsDb(alice), p), {
      answers: [{
        questionId: 'cp2q1', userAnswer: 3, isCorrect: true, pointsEarned: 10,
        needsManualGrade: false, manualScore: null, manualFeedback: '',
        gradedBy: null, gradedAt: null
      }]
    }));
    // (3) Attempt legacy tetap tidak bisa dihapus.
    await assertFails(deleteDoc(doc(fsDb(alice), p)));
  });

  it('CP2/ATTEMPT v2: attempt legacy TIDAK boleh dibuat lewat jalur create', async () => {
    // Inilah yang menutup downgrade: peserta tidak bisa memilih versi lama
    // untuk menulis skor sendiri.
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_v2_baru')), v2AttemptData()));
    // schemaVersion 2 + snapshot berkunci = DENY (dua alasan sekaligus).
    await assertFails(setDoc(doc(fsDb(alice), attemptPath('at_v2_baru2')),
      v2AttemptData({ status: 'in_progress' })));
    // Dan attempts dengan schemaVersion lain juga ditolak.
    for (const sv of [1, 4]) {
      await assertFails(setDoc(doc(fsDb(alice), attemptPath(`at_sv_${sv}`)),
        cp2Attempt({ schemaVersion: sv })));
    }
    // Attempt v2 TIDAK boleh "naik kelas" jadi v3 lewat update: yang boleh
    // di-update cuma mengikuti versi yang sudah tersimpan.
    const p = attemptPath('at_v2_up');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), p), v2AttemptData());
    });
    await assertFails(updateDoc(doc(fsDb(alice), p), { schemaVersion: 3 }));
  });
  await testEnv.cleanup();
  console.log(failed === 0 ? `\nALL ${total} TESTS PASSED` : `\n${failed}/${total} TESTS FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Setup tes gagal:', err.stack || err);
  process.exit(1);
});
