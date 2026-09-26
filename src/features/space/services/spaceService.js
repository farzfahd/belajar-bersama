import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { INVITE_CODE_BYTES, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import {
  inviteCreateErrorText,
  inviteSpaceName,
  resolveInviteExpiry
} from '../utils/invite';
import { nextMemberIds } from '../utils/leave';
import { ensureProfile } from '../../auth/services/authService';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function randomInviteCode() {
  const raw = new Uint8Array(INVITE_CODE_BYTES);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function spaceIdForUser(uid) {
  return `space_${uid}`;
}

async function recoverSpaceLink(uid, profile) {
  if (!profile?.spaceId) return profile;
  const spaceRef = doc(db, ROOT.spaces, profile.spaceId);
  const snap = await getDoc(spaceRef);
  if (snap.exists()) {
    const memberIds = Array.isArray(snap.data().memberIds) ? snap.data().memberIds : [];
    if (memberIds.includes(uid)) return profile;
    // Keanggotaan sudah dicabut (mis. partner keluar, atau leave yang terputus)
    // tetapi profil belum ter-reset: lepas tautan sendiri agar user tidak
    // terkunci — aturan users mengizinkan melepas tautan hanya ketika sudah
    // bukan anggota, jadi ini murni pemulihan, bukan jalan pintas.
    await updateDoc(doc(db, ROOT.users, uid), { spaceId: null });
    return { ...profile, spaceId: null };
  }
  await updateDoc(doc(db, ROOT.users, uid), { spaceId: null });
  return { ...profile, spaceId: null };
}

export async function createSpace(name) {
  const uid = requireUser();
  const profile = await recoverSpaceLink(uid, await ensureProfile(uid));
  if (profile.spaceId) throw new Error('Kamu sudah memiliki ruang belajar.');

  const spaceRef = doc(db, ROOT.spaces, spaceIdForUser(uid));
  const existing = await getDoc(spaceRef);
  if (existing.exists()) {
    if (!(existing.data().memberIds || []).includes(uid)) {
      throw new Error('Ruang belajar sudah tidak dapat digunakan.');
    }
    await updateDoc(doc(db, ROOT.users, uid), { spaceId: spaceRef.id });
    return spaceRef.id;
  }

  await setDoc(spaceRef, {
    name: String(name || 'Our Space').trim().slice(0, 60) || 'Our Space',
    memberIds: [uid],
    createdAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
  await updateDoc(doc(db, ROOT.users, uid), { spaceId: spaceRef.id });
  return spaceRef.id;
}

export async function renameSpace(spaceId, name) {
  const value = String(name || '').trim().slice(0, 60);
  if (!value) throw new Error('Nama ruang tidak boleh kosong.');
  await updateDoc(doc(db, ROOT.spaces, spaceId), { name: value });
}

// Fakta dari ID token Auth (server, bukan jam perangkat):
// - `issuedAtTime`/`iat` = waktu server Google menerbitkan token → basis aman
//   untuk menghitung expiresAt invite (lihat src/features/space/utils/invite.js).
// - klaim `email_verified` = nilai yang SAMA dengan yang diperiksa rules
//   (`verified()`), jadi cek lokal di sini setara dengan yang akan terjadi di
//   server — bukan pengganti, hanya pesan lebih awal & lebih jelas.
async function readAuthTokenFacts() {
  const user = auth.currentUser;
  try {
    const token = await user.getIdTokenResult();
    const claims = token.claims || {};
    const fromIso = Date.parse(token.issuedAtTime || '');
    const fromClaim = Number(claims.iat) * 1000;
    const issuedAtMs = Number.isFinite(fromIso) ? fromIso : (Number.isFinite(fromClaim) ? fromClaim : null);
    return { issuedAtMs, emailVerified: claims.email_verified === true };
  } catch {
    return { issuedAtMs: null, emailVerified: user?.emailVerified === true };
  }
}

// Kode acak kriptografis >= 20 karakter sebagai document ID invites/{code}.
// Path & schema TIDAK berubah; hanya nilai expiresAt yang kini berbasis waktu
// server + margin clock-skew, dan spaceName dikirim apa adanya dari dokumen.
export async function generateInvite(spaceId) {
  const uid = requireUser();
  if (!spaceId) throw new Error('Ruang belajar belum siap. Muat ulang halaman lalu coba lagi.');

  const { issuedAtMs, emailVerified } = await readAuthTokenFacts();
  if (!emailVerified) {
    throw new Error('Verifikasi email dulu sebelum mengundang partner. Buka tautan verifikasi di email, lalu muat ulang halaman ini.');
  }

  const spaceRef = doc(db, ROOT.spaces, spaceId);
  const space = await getDoc(spaceRef);
  if (!space.exists()) throw new Error('Ruang belajar tidak ditemukan.');

  const spaceData = space.data() || {};
  const memberIds = Array.isArray(spaceData.memberIds) ? spaceData.memberIds : [];
  if (!memberIds.includes(uid)) throw new Error('Kamu bukan anggota ruang ini.');
  // Rule mensyaratkan tepat 1 anggota (firestore.rules:937). Cek lokal supaya
  // tidak berakhir jadi "Akses ditolak" tanpa penjelasan.
  if (memberIds.length >= 2) {
    throw new Error('Ruang ini sudah berisi 2 anggota, jadi kode undangan tidak diperlukan lagi.');
  }

  const nameCheck = inviteSpaceName(spaceData.name);
  if (!nameCheck.ok) {
    throw new Error(
      nameCheck.reason === 'too-long'
        ? 'Nama ruang terlalu panjang (maksimal 60 karakter). Pendekkan nama ruang lalu coba lagi.'
        : 'Nama ruang belum diisi. Isi nama ruang lalu coba lagi.'
    );
  }

  const { expiresAt } = resolveInviteExpiry({ serverIssuedAtMs: issuedAtMs, clientNowMs: Date.now() });

  const code = randomInviteCode();
  try {
    await setDoc(doc(db, ROOT.invites, code), {
      code,
      spaceId,
      spaceName: nameCheck.value,
      createdBy: uid,
      createdAt: serverTimestamp(),
      expiresAt,
      used: false,
      usedBy: null,
      usedAt: null,
      schemaVersion: SCHEMA_VERSION
    });
  } catch (err) {
    const friendly = inviteCreateErrorText(err?.code);
    if (friendly) throw new Error(friendly);
    throw err;
  }
  return code;
}

export async function joinSpaceByCode(input) {
  const uid = requireUser();
  const code = String(input || '').trim().replace(/\s+/g, '');
  const inviteRef = doc(db, ROOT.invites, code);
  const invite = await getDoc(inviteRef);
  if (!invite.exists()) throw new Error('Kode undangan tidak ditemukan. Periksa kembali.');
  const inviteData = invite.data();
  const spaceId = inviteData.spaceId;
  if (!spaceId) throw new Error('Kode undangan tidak valid.');

  const profile = await recoverSpaceLink(uid, await ensureProfile(uid));
  if (profile.spaceId) {
    if (profile.spaceId === spaceId) return spaceId;
    throw new Error('Kamu sudah memiliki ruang belajar lain.');
  }

  // Pemulihan: undangan ini sudah dipakai oleh user ini sendiri (mis. tautan
  // profil gagal tertimpa) -> cukup tautkan profil, tanpa join ulang.
  if (inviteData.used) {
    if (inviteData.usedBy === uid) {
      await updateDoc(doc(db, ROOT.users, uid), { spaceId });
      return spaceId;
    }
    throw new Error('Kode undangan sudah dipakai.');
  }
  if ((inviteData.expiresAt?.toMillis?.() ?? 0) <= Date.now())
    throw new Error('Kode undangan sudah kedaluwarsa (berlaku 24 jam).');

  // Dokumen ruang SENGAJA tidak dibaca sebelum join: rules menutup
  // pembacaan ruang untuk non-anggota, jadi membacanya membuat user yang
  // punya kode undangan sah selalu gagal. canJoin() di rules yang
  // memvalidasi ulang keanggotaan (harus 1 -> 2 anggota) dan keabsahan
  // undangan, jadi memberIds boleh disusun dari createdBy di undangan.
  const spaceRef = doc(db, ROOT.spaces, spaceId);
  const batch = writeBatch(db);
  batch.update(spaceRef, { memberIds: [inviteData.createdBy, uid], _joinCode: code });
  batch.update(inviteRef, { used: true, usedBy: uid, usedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('Kode undangan tidak lagi berlaku untuk ruang ini (ruang sudah penuh atau berubah).');
    }
    throw err;
  }
  await updateDoc(doc(db, ROOT.users, uid), { spaceId });
  return spaceId;
}

// Keluar dari ruang belajar (CP0) — HANYA partner (memberIds indeks 1).
// Satu writeBatch ATOMIK:
//   1. spaces/{id}.memberIds : [owner, partner] -> [owner] (ruang TIDAK dihapus)
//   2. users/{uid}.spaceId   -> null
// Rules memverifikasi bentuk array secara independen (partnerLeaveOk),
// sehingga client tidak pernah dipercaya. Idempoten: bila sudah bukan anggota
// (tab kedua / retry jaringan), cukup rapikan tautan profil.
export async function leaveSpace(spaceId) {
  const uid = requireUser();
  if (!spaceId) throw new Error('Ruang belajar belum siap. Muat ulang halaman lalu coba lagi.');

  const spaceRef = doc(db, ROOT.spaces, spaceId);
  const space = await getDoc(spaceRef);
  const profileRef = doc(db, ROOT.users, uid);

  if (!space.exists()) {
    // Ruang hilang: lepas tautan profil agar user tidak terkunci di onboarding.
    await updateDoc(profileRef, { spaceId: null });
    return { left: true, alreadyLeft: true };
  }

  const memberIds = Array.isArray(space.data().memberIds) ? space.data().memberIds : [];
  const index = memberIds.indexOf(uid);

  if (index === -1) {
    // Sudah bukan anggota (mis. tab/retry kedua) — pastikan profil tidak basi.
    await updateDoc(profileRef, { spaceId: null });
    return { left: true, alreadyLeft: true };
  }
  if (index === 0) {
    throw new Error(
      'Pemilik ruang tidak dapat keluar secara langsung. Opsi pemindahan kepemilikan/ruang belum tersedia pada checkpoint ini.'
    );
  }

  // --- DIAGNOSTIC: production state audit ---
  const profileSnap = await getDoc(profileRef);
  const profileData = profileSnap.data();
  const nextMids = nextMemberIds(memberIds, uid);

  console.info('[LEAVE-DIAG] space exists:', space.exists());
  console.info('[LEAVE-DIAG] memberIds:', memberIds);
  console.info('[LEAVE-DIAG] memberCount:', memberIds.length);
  console.info('[LEAVE-DIAG] caller uid:', uid);
  console.info('[LEAVE-DIAG] caller index:', index);
  console.info('[LEAVE-DIAG] nextMemberIds:', nextMids);
  console.info('[LEAVE-DIAG] profile.spaceId:', profileData?.spaceId);
  console.info('[LEAVE-DIAG] profileSpaceMatches:', profileData?.spaceId === spaceId);

  // --- DIAGNOSTIC: auth token verification ---
  try {
    const user = auth.currentUser;
    if (user) {
      console.info('[LEAVE-DIAG] auth.currentUser.uid:', user.uid);
      console.info('[LEAVE-DIAG] auth.currentUser.email:', user.email);
      console.info('[LEAVE-DIAG] auth.currentUser.emailVerified:', user.emailVerified);

      await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult();
      console.info('[LEAVE-DIAG] token.claims.email_verified:', tokenResult.claims.email_verified);
      console.info('[LEAVE-DIAG] token.issuedAtTime:', tokenResult.issuedAtTime);

      // Check for mismatch
      if (user.emailVerified !== tokenResult.claims.email_verified) {
        console.warn('[LEAVE-DIAG] MISMATCH: user.emailVerified:', user.emailVerified, 'vs token.claims.email_verified:', tokenResult.claims.email_verified);
      } else {
        console.info('[LEAVE-DIAG] MATCH: user.emailVerified === token.claims.email_verified:', user.emailVerified);
      }
    }
  } catch (diagErr) {
    console.warn('[LEAVE-DIAG] Failed to get token diagnostics:', diagErr);
  }
  // --- END DIAGNOSTIC ---

  const batch = writeBatch(db);
  batch.update(spaceRef, { memberIds: nextMemberIds(memberIds, uid) });
  batch.update(profileRef, { spaceId: null });

  try {
    await batch.commit();
  } catch (err) {
    // Log actual Firestore error before fallback
    console.error('[LEAVE-DIAG] Firestore error code:', err?.code);
    console.error('[LEAVE-DIAG] Firestore error message:', err?.message);
    console.error('[LEAVE-DIAG] Firestore error name:', err?.name);

    if (err?.code === 'permission-denied') {
      // Kondisi berubah di tengah jalan (mis. tab lain sudah keluar / tulis
      // tidak lagi valid). Cek ulang dan selesaikan secara idempoten.
      const fresh = await getDoc(spaceRef);
      const freshMembers = fresh.exists() && Array.isArray(fresh.data().memberIds)
        ? fresh.data().memberIds
        : [];
      if (!freshMembers.includes(uid)) {
        await updateDoc(profileRef, { spaceId: null });
        return { left: true, alreadyLeft: true };
      }
      throw new Error('Gagal keluar dari ruang. Muat ulang halaman lalu coba lagi.');
    }
    throw err;
  }
  return { left: true, alreadyLeft: false };
}

// Peran "Kamu" / "Partner" konsisten berdasarkan urutan memberIds (pengisi pertama = owner).
export function spaceRoles(space, meUid) {
  const memberIds = space?.memberIds || [];
  const index = memberIds.indexOf(meUid);
  if (index === -1) return { me: null, partner: null, isOwner: false };
  const partner = memberIds[index === 0 ? 1 : 0] || null;
  return { me: meUid, partner, isOwner: index === 0, filled: memberIds.length === 2 };
}