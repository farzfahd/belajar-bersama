// Unit test helper kode undangan (fix bug "Buat kode" -> permission-denied):
// kedaluwarsa tahan clock-skew, nama ruang verbatim, kesiapan tombol, pesan error.
// Tanpa emulator: npm run test:invite
import test from 'node:test';
import assert from 'node:assert/strict';
import { INVITE_TTL_MS } from '../src/lib/constants.js';
import {
  INVITE_CLIENT_MARGIN_MS,
  INVITE_SERVER_MARGIN_MS,
  INVITE_SPACE_NAME_MAX,
  inviteCreateErrorText,
  inviteReadiness,
  inviteSpaceName,
  resolveInviteExpiry
} from '../src/features/space/utils/invite.js';

// Plafon rule (firestore.rules:938-939) diukur dengan jam SERVER:
//   expiresAt > request.time && expiresAt <= request.time + INVITE_TTL_MS
const CAP = INVITE_TTL_MS;
const SERVER_NOW = Date.UTC(2026, 0, 10, 8, 0, 0);

test('kedaluwarsa memakai basis waktu server (ID token) + margin, bukan jam perangkat apa adanya', () => {
  const issuedAtMs = SERVER_NOW - 50 * 60 * 1000; // token diterbitkan 50 menit lalu
  const { expiresAt, base } = resolveInviteExpiry({
    serverIssuedAtMs: issuedAtMs,
    clientNowMs: SERVER_NOW + 6 * 60 * 60 * 1000 // jam perangkat 6 jam lebih cepat
  });
  assert.equal(base, 'server');
  assert.equal(expiresAt.getTime(), issuedAtMs + CAP - INVITE_SERVER_MARGIN_MS);
  assert.ok(expiresAt.getTime() <= SERVER_NOW + CAP, 'tidak boleh melewati plafon 24 jam jam server');
  assert.ok(expiresAt.getTime() > SERVER_NOW, 'harus masih berlaku saat dibuat');
});

test('clock-skew perangkat realistis: payload baru lolos plafon rule (payload lama tidak)', () => {
  for (const skewMs of [0, 1_000, 5 * 60 * 1000, 55 * 60 * 1000]) {
    const deviceNow = SERVER_NOW + skewMs;

    const fixed = resolveInviteExpiry({ serverIssuedAtMs: null, clientNowMs: deviceNow });
    assert.equal(fixed.base, 'client');
    assert.ok(fixed.expiresAt.getTime() <= SERVER_NOW + CAP, `skew ${skewMs}ms: harus lolos plafon`);
    assert.ok(fixed.expiresAt.getTime() > SERVER_NOW, `skew ${skewMs}ms: harus masih berlaku`);

    // Perilaku LAMA: Date.now() + 24 jam apa adanya -> begitu jam perangkat
    // lebih cepat dari jam server, plafon rule terlewati => deny di production.
    const legacy = deviceNow + CAP;
    assert.equal(
      legacy <= SERVER_NOW + CAP,
      skewMs === 0,
      `skew ${skewMs}ms: regresi bug lama (payload lama melewati plafon saat skew > 0)`
    );
  }
});

test('margin cukup untuk skew realistis (server: >= 1 menit, fallback perangkat: >= 30 menit)', () => {
  assert.ok(INVITE_SERVER_MARGIN_MS >= 60 * 1000);
  assert.ok(INVITE_CLIENT_MARGIN_MS >= 30 * 60 * 1000);
});

test('fallback tanpa info token tetap memakai jam perangkat dengan margin besar', () => {
  const { expiresAt, base } = resolveInviteExpiry({ serverIssuedAtMs: Number.NaN, clientNowMs: SERVER_NOW });
  assert.equal(base, 'client');
  assert.equal(expiresAt.getTime(), SERVER_NOW + CAP - INVITE_CLIENT_MARGIN_MS);
});

test('nama ruang dikirim apa adanya (tanpa trim/slice) supaya sama dengan dokumen ruang', () => {
  const raw = 'Ruang  Bersama  Uji';
  assert.deepEqual(inviteSpaceName(raw), { ok: true, value: raw });
  const spaced = ' Ruang A ';
  assert.equal(inviteSpaceName(spaced).value, spaced, 'spasi ujung tidak boleh diubah');
  const max = 'x'.repeat(INVITE_SPACE_NAME_MAX);
  assert.deepEqual(inviteSpaceName(max), { ok: true, value: max });
  assert.deepEqual(inviteSpaceName('x'.repeat(INVITE_SPACE_NAME_MAX + 1)), { ok: false, reason: 'too-long' });
  assert.deepEqual(inviteSpaceName(''), { ok: false, reason: 'missing' });
  assert.deepEqual(inviteSpaceName(undefined), { ok: false, reason: 'missing' });
  assert.deepEqual(inviteSpaceName(123), { ok: false, reason: 'missing' });
});

test('kesiapan tombol: space null / pending / generating / penuh tidak boleh aktif', () => {
  const oneMember = { memberIds: ['alice'] };
  const twoMembers = { memberIds: ['alice', 'bob'] };

  assert.deepEqual(inviteReadiness({ spaceId: 's1', space: null }), { ready: false, reason: 'loading' });
  assert.equal(inviteReadiness({ spaceId: 's1', space: undefined }).ready, false, 'space belum termuat');
  assert.equal(inviteReadiness({ spaceId: 's1', space: oneMember, pending: true }).reason, 'loading');
  assert.equal(inviteReadiness({ spaceId: 's1', space: oneMember, generating: true }).reason, 'generating');
  assert.equal(inviteReadiness({ spaceId: 's1', space: twoMembers }).reason, 'full');
  assert.equal(inviteReadiness({ spaceId: 's1', space: twoMembers }).ready, false);
  assert.deepEqual(inviteReadiness({ spaceId: 's1', space: oneMember }), { ready: true, reason: 'ok' });
  assert.equal(inviteReadiness({ spaceId: null, space: oneMember }).reason, 'unavailable');
  assert.equal(inviteReadiness({ spaceId: 's1', space: { memberIds: [] } }).ready, false, 'memberIds kosong = belum siap');
  assert.equal(inviteReadiness({ spaceId: 's1', space: {} }).ready, false);
});

test('pesan error create lebih informatif dan tidak membocorkan detail rules', () => {
  const text = inviteCreateErrorText('permission-denied');
  assert.ok(typeof text === 'string' && text.length > 20);
  assert.match(text, /terverifikasi/i);
  assert.ok(!/firestore\.rules|expiresAt|memberIds|spaceName/i.test(text), 'tanpa detail internal');
  assert.equal(inviteCreateErrorText('unavailable'), null);
  assert.equal(inviteCreateErrorText(undefined), null);
});
