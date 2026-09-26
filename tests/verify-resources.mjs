import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

// PROBE SEMENTARA — verifikasi payload resourceService/resourceStates terhadap
// firestore.rules asli di emulator sandbox. Dijalankan lewat:
// npx firebase emulators:exec --project demo-res-cp24 --only firestore "node tests/verify-resources.mjs"

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, port] = emulatorHost.split(':');

const env = await initializeTestEnvironment({
  projectId: 'demo-res-cp24',
  firestore: { host, port: Number(port) }
});

let passed = 0;
const failures = [];
function ok(name) {
  passed++;
  console.log(`  ok  - ${name}`);
}
function bad(name, err) {
  failures.push(name);
  console.log(`  FAIL- ${name} -> ${err?.message || err}`);
}

const ua = 'alice_cp24';
const ub = 'bob_cp24';
const alice = env.authenticatedContext(ua, { email_verified: true });
const bob = env.authenticatedContext(ub, { email_verified: true });
const a = alice.firestore();
const b = bob.firestore();

async function main() {
  // ---- setup user + space ----
  try {
    await setDoc(doc(a, 'users', ua), { displayName: 'Alice', avatar: '', color: '#e0704f', spaceId: null, schemaVersion: 1 });
    await setDoc(doc(a, 'spaces', 's1'), { name: 'Ruang Uji', memberIds: [ua], createdAt: serverTimestamp(), schemaVersion: 1 });
    await updateDoc(doc(a, 'users', ua), { spaceId: 's1' });
    let label = 'setup: user + space';
    ok(label);
  } catch (e) {
    bad('setup: user + space', e);
  }

  // ---- payload PERSIS resourceDoc() dari resourceService ----
  const rp = {
    title: 'React Docs',
    url: 'https://react.dev',
    topicId: 'top1',
    author: 'Meta',
    type: 'website',
    estimatedMinutes: 30,
    tags: ['react', 'tutorial'],
    description: 'Dokumentasi resmi React.',
    visibility: 'shared',
    difficulty: 'beginner',
    addedBy: ua,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1
  };

  let label = 'create resource (payload resourceService)';
  try { await setDoc(doc(a, 'spaces/s1/resources/res1'), rp); ok(label); } catch (e) { bad(label, e); }

  // ---- gabung bob jadi anggota via invite (canJoin) ----
  let lj = 'setup: bob bergabung via invite';
  try {
    await setDoc(doc(a, 'invites', 'inv1'), { spaceId: 's1', createdBy: ua, used: false, expiresAt: new Date(Date.now() + 3600_000), schemaVersion: 1 });
    await updateDoc(doc(b, 'spaces/s1'), { memberIds: [ua, ub], _joinCode: 'inv1' });
    await updateDoc(doc(b, 'invites/inv1'), { used: true, usedBy: ub, usedAt: serverTimestamp() });
    ok(lj);
  } catch (e) { bad(lj, e); }

  // ---- read: partner bob bisa baca (read longgar isMember) ----
  label = 'partner baca resource shared';
  try { await getDoc(doc(b, 'spaces/s1/resources/res1')); ok(label); } catch (e) { bad(label, e); }

  // ---- write: bob TIDAK bisa edit/hapus resource alice ----
  label = 'partner tidak bisa update resource milik alice';
  try { await assertFails(updateDoc(doc(b, 'spaces/s1/resources/res1'), { ...rp, title: 'diubah bob' })); ok(label); } catch (e) { bad(label, e); }
  label = 'partner tidak bisa delete resource milik alice';
  try { await assertFails(deleteDoc(doc(b, 'spaces/s1/resources/res1'))); ok(label); } catch (e) { bad(label, e); }

  // ---- update oleh pemilik (status dll) ----
  label = 'pemilik update resource';
  try { await updateDoc(doc(a, 'spaces/s1/resources/res1'), { title: 'React Docs v2' }); ok(label); } catch (e) { bad(label, e); }

  // ---- URL tidak valid ditolak rules (validasi server) ----
  label = 'url javascript: ditolak';
  try { await assertFails(setDoc(doc(a, 'spaces/s1/resources/res_bad'), { ...rp, url: 'javascript:alert(1)' })); ok(label); } catch (e) { bad(label, e); }

  // ---- resourceStates ----
  const st = (uid, status, rid = 'res1') => ({
    resourceId: rid, uid, status, updatedAt: serverTimestamp(), schemaVersion: 1
  });
  label = 'alice set status sendiri (reading) pada resource shared';
  try { await setDoc(doc(a, 'spaces/s1/resourceStates/res1_' + ua), st(ua, 'reading')); ok(label); } catch (e) { bad(label, e); }
  label = 'bob set status sendiri (completed) pada resource shared';
  try { await setDoc(doc(b, 'spaces/s1/resourceStates/res1_' + ub), st(ub, 'completed')); ok(label); } catch (e) { bad(label, e); }
  label = 'bob tidak bisa menulis status milik alice';
  try { await assertFails(setDoc(doc(b, 'spaces/s1/resourceStates/res1_' + ua), st(ua, 'reading'))); ok(label); } catch (e) { bad(label, e); }
  label = 'bob bisa baca status milik alice (read isMember)';
  try { await getDoc(doc(b, 'spaces/s1/resourceStates/res1_' + ua)); ok(label); } catch (e) { bad(label, e); }

  // ---- resource private ----
  label = 'pemilik buat resource private';
  try { await setDoc(doc(a, 'spaces/s1/resources/res_priv'), { ...rp, visibility: 'private' }); ok(label); } catch (e) { bad(label, e); }
  label = 'bob TIDAK bisa set status pada resource private alice';
  try { await assertFails(setDoc(doc(b, 'spaces/s1/resourceStates/res_priv_' + ub), st(ub, 'reading', 'res_priv'))); ok(label); } catch (e) { bad(label, e); }
  label = 'alice set status pada resource privatenya sendiri';
  try { await setDoc(doc(a, 'spaces/s1/resourceStates/res_priv_' + ua), st(ua, 'not_started', 'res_priv')); ok(label); } catch (e) { bad(label, e); }

  // ---- status tidak valid ditolak ----
  label = 'status resourceState di luar enum ditolak';
  try { await assertFails(setDoc(doc(a, 'spaces/s1/resourceStates/res_priv_' + ua), { ...st(ua, 'reading', 'res_priv'), status: 'paused' })); ok(label); } catch (e) { bad(label, e); }

  // ---- delete oleh pemilik ----
  label = 'pemilik delete resource';
  try { await deleteDoc(doc(a, 'spaces/s1/resources/res1')); ok(label); } catch (e) { bad(label, e); }

  // ---- tags: unik & maks 20 ----
  label = 'tags duplikat ditolak';
  try { await assertFails(setDoc(doc(a, 'spaces/s1/resources/res_dup'), { ...rp, tags: ['a', 'a'] })); ok(label); } catch (e) { bad(label, e); }

  console.log(`\n${passed} lulus, ${failures.length} gagal`);
  if (failures.length) process.exitCode = 1;
}

await main();