import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { INVITE_CODE_BYTES, INVITE_TTL_MS, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
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
    if (!(snap.data().memberIds || []).includes(uid)) {
      throw new Error('Profil tertaut ke ruang yang tidak bisa diakses.');
    }
    return profile;
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

// Kode acak kriptografis >= 20 karakter sebagai document ID invites/{code}.
export async function generateInvite(spaceId) {
  const uid = requireUser();
  const code = randomInviteCode();
  const spaceRef = doc(db, ROOT.spaces, spaceId);
  const space = await getDoc(spaceRef);
  if (!space.exists()) throw new Error('Ruang belajar tidak ditemukan.');
  await setDoc(doc(db, ROOT.invites, code), {
    code,
    spaceId,
    spaceName: String(space.data().name || 'Ruang Belajar').trim().slice(0, 60),
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    used: false,
    usedBy: null,
    usedAt: null,
    schemaVersion: SCHEMA_VERSION
  });
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

// Peran "Kamu" / "Partner" konsisten berdasarkan urutan memberIds (pengisi pertama = owner).
export function spaceRoles(space, meUid) {
  const memberIds = space?.memberIds || [];
  const index = memberIds.indexOf(meUid);
  if (index === -1) return { me: null, partner: null, isOwner: false };
  const partner = memberIds[index === 0 ? 1 : 0] || null;
  return { me: meUid, partner, isOwner: index === 0, filled: memberIds.length === 2 };
}