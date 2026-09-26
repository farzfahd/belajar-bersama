// Unit test "Keluar dari Ruang Belajar" (CP0): kelayakan, owner vs partner,
// memberIds hasil leave, dan tujuan state/redirect. Tanpa emulator:
// npm run test:leave
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFTER_LEAVE_ROUTE,
  LEAVE_CONSEQUENCES,
  leaveEligibility,
  nextMemberIds
} from '../src/features/space/utils/leave.js';

const ownerSpace = { name: 'Ruang A', memberIds: ['alice', 'bob'] };

test('leave eligibility: partner (indeks 1) boleh keluar', () => {
  assert.deepEqual(
    leaveEligibility({ spaceId: 'space1', space: ownerSpace, uid: 'bob' }),
    { canLeave: true, reason: 'partner' }
  );
});

test('leave eligibility: owner (indeks 0) TIDAK boleh keluar cara biasa', () => {
  assert.deepEqual(
    leaveEligibility({ spaceId: 'space1', space: ownerSpace, uid: 'alice' }),
    { canLeave: false, reason: 'owner' }
  );
});

test('leave eligibility: bukan anggota & data belum siap ditolak (tanpa aksi)', () => {
  assert.equal(leaveEligibility({ spaceId: 'space1', space: ownerSpace, uid: 'carol' }).reason, 'not-member');
  assert.equal(leaveEligibility({ spaceId: 'space1', space: null, uid: 'bob' }).reason, 'not-ready');
  assert.equal(leaveEligibility({ spaceId: 'space1', space: {}, uid: 'bob' }).reason, 'not-ready');
  assert.equal(leaveEligibility({ spaceId: 'space1', space: { memberIds: [] }, uid: 'bob' }).reason, 'not-ready');
  assert.equal(leaveEligibility({ spaceId: null, space: ownerSpace, uid: 'bob' }).reason, 'not-ready');
  assert.equal(leaveEligibility({ spaceId: 'space1', space: ownerSpace, uid: null }).reason, 'not-ready');
});

test('nextMemberIds: hanya diri yang dihapus, pemilik & urutan dipertahankan', () => {
  assert.deepEqual(nextMemberIds(['alice', 'bob'], 'bob'), ['alice']);
  assert.deepEqual(nextMemberIds(['alice', 'bob'], 'alice'), ['bob']);
  // Idempoten: uid yang tidak ada tidak mengubah apa pun.
  assert.deepEqual(nextMemberIds(['alice', 'bob'], 'carol'), ['alice', 'bob']);
  assert.deepEqual(nextMemberIds(['alice'], 'alice'), []);
  assert.equal(nextMemberIds(null, 'bob').length, 0);
});

test('tujuan state setelah leave: route di bawah SpaceGate (render Onboarding)', () => {
  assert.equal(AFTER_LEAVE_ROUTE, '/dashboard');
  assert.ok(AFTER_LEAVE_ROUTE.startsWith('/'));
});

test('modal konfirmasi menjelaskan 3 konsekuensi wajib', () => {
  assert.equal(LEAVE_CONSEQUENCES.length, 3);
  const joined = LEAVE_CONSEQUENCES.join(' ').toLowerCase();
  assert.match(joined, /keluar dari ruang ini/);
  assert.match(joined, /tidak otomatis dihapus/);
  assert.match(joined, /bergabung kembali/);
});
