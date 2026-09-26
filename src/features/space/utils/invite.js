// Helper murni (tanpa Firebase) untuk kode undangan.
// Dipakai spaceService.generateInvite() & InviteCard; diuji tests/invite.test.mjs.
import { INVITE_TTL_MS } from '../../../lib/constants.js';

// ---------------------------------------------------------------
// KEDALUWARSA. Rule menuntut (firestore.rules:938-939):
//   expiresAt > request.time  &&  expiresAt <= request.time + 24 jam
// `expiresAt` dihitung di CLIENT, pembandingnya jam SERVER. Kalau nilainya
// diambil dari jam perangkat apa adanya (Date.now() + 24 jam), margin terhadap
// batas atas = 0: perangkat yang jamnya lebih cepat walau hanya beberapa detik
// dari jam Google akan SELALU ditolak permission-denied di production —
// padahal di emulator selalu lolos (client & server memakai jam host sama,
// ditambah latensi request). Karena itu:
//   1. Basis waktu diambil dari sumber SERVER bila ada: `issuedAtTime` ID token
//      Auth (diterbitkan server Google, bukan jam perangkat).
//   2. Diberi margin kecil supaya beda jam antar-server Google pun aman.
//   3. Bila basis server tidak tersedia, fallback ke jam perangkat DENGAN
//      margin besar (1 jam) sehingga skew perangkat yang wajar tetap aman.
// TRADE-OFF: berlaku efektif < 24 jam (≈23j55m; ≈23j pada fallback). Syarat
// produk "berlaku 24 jam" tetap dipenuhi sebagai BATAS MAKSIMUM (rule).
export const INVITE_SERVER_MARGIN_MS = 5 * 60 * 1000;
export const INVITE_CLIENT_MARGIN_MS = 60 * 60 * 1000;

export function resolveInviteExpiry({ serverIssuedAtMs, clientNowMs } = {}) {
  if (Number.isFinite(serverIssuedAtMs)) {
    return {
      expiresAt: new Date(serverIssuedAtMs + INVITE_TTL_MS - INVITE_SERVER_MARGIN_MS),
      base: 'server'
    };
  }
  const nowMs = Number.isFinite(clientNowMs) ? clientNowMs : Date.now();
  return {
    expiresAt: new Date(nowMs + INVITE_TTL_MS - INVITE_CLIENT_MARGIN_MS),
    base: 'client'
  };
}

// ---------------------------------------------------------------
// NAMA RUANG. Rule membandingkan kesamaan PERSIS dengan dokumen ruang:
//   spaceName == get(spaces/{spaceId}).data.name   (firestore.rules:936)
// Jadi nilai yang dikirim harus persis isi dokumen — tanpa trim/slice, karena
// transformasi apa pun (mis. ruang bernama 61+ karakter atau berspasi di ujung)
// langsung berubah menjadi mismatch ⇒ deny. Batas 60 karakter = batas
// validInvite/validSpace; di luar itu kita gagal lokal dengan pesan jelas.
export const INVITE_SPACE_NAME_MAX = 60;

export function inviteSpaceName(name) {
  if (typeof name !== 'string' || name.length === 0) return { ok: false, reason: 'missing' };
  if (name.length > INVITE_SPACE_NAME_MAX) return { ok: false, reason: 'too-long' };
  return { ok: true, value: name };
}

// ---------------------------------------------------------------
// KESIAPAN TOMBOL "Buat kode". `space === null` berarti data ruang BELUM siap
// (masih dimuat / gagal dimuat), BUKAN berarti ruang kosong. Tanpa guard ini,
// `roles?.filled` bernilai false saat space null ⇒ tombol aktif ⇒ klik
// menghasilkan permission-denied dari rule `memberIds.size() == 1`.
export function inviteReadiness({ spaceId, space, pending = false, generating = false } = {}) {
  if (generating) return { ready: false, reason: 'generating' };
  if (!spaceId) return { ready: false, reason: 'unavailable' };
  if (!space || pending) return { ready: false, reason: 'loading' };
  const memberIds = Array.isArray(space.memberIds) ? space.memberIds : [];
  if (memberIds.length === 0) return { ready: false, reason: 'loading' };
  if (memberIds.length >= 2) return { ready: false, reason: 'full' };
  return { ready: true, reason: 'ok' };
}

// Pesan khusus kegagalan create invite. Mapping global (errors.js) tetap ada,
// tapi "Akses ditolak…" terlalu generik untuk ditindaklanjuti pengguna.
// Tanpa detail internal rules — hanya langkah yang bisa dilakukan pengguna.
export function inviteCreateErrorText(code) {
  if (code === 'permission-denied') {
    return 'Kode undangan tidak bisa dibuat. Pastikan email akun sudah terverifikasi dan ruang ini masih berisi 1 anggota, lalu muat ulang halaman dan coba lagi.';
  }
  return null;
}
