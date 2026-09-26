import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import { normalizeTags } from '../../../shared/utils/validate';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

// Payload catatan. topicId wajib (setiap catatan menempel pada topik roadmap).
function noteDoc(uid, input) {
  return {
    title: String(input.title || '').trim().slice(0, 200),
    description: String(input.description || '').trim().slice(0, 2000),
    body: String(input.body || ''),
    topicId: String(input.topicId || '').trim(),
    tags: normalizeTags(input.tags || []),
    status: input.status || 'draft',
    visibility: input.visibility || 'private',
    difficulty: input.difficulty || 'beginner',
    ownerId: uid,
    commentCount: 0,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  };
}

export async function createNote(spaceId, input) {
  const uid = requireUser();
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.notes));
  await setDoc(ref, noteDoc(uid, input));
  return ref.id;
}

// Update parsial; rules melihat hasil full doc yang ada di server.
export async function updateNote(spaceId, noteId, input) {
  await updateDoc(doc(db, ROOT.spaces, spaceId, COL.notes, noteId), {
    title: String(input.title || '').trim().slice(0, 200),
    description: String(input.description || '').trim().slice(0, 2000),
    body: String(input.body || ''),
    topicId: String(input.topicId || '').trim(),
    tags: normalizeTags(input.tags || []),
    status: input.status || 'draft',
    visibility: input.visibility || 'private',
    difficulty: input.difficulty || 'beginner',
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}

// Soft-delete: hapus tampil dari partner (rules menyembunyikan deletedAt != null
// untuk non-owner); owner melihat dokumennya di "Sampah".
export async function softDeleteNote(spaceId, noteId) {
  await updateDoc(doc(db, ROOT.spaces, spaceId, COL.notes, noteId), {
    deletedAt: serverTimestamp()
  });
}

export async function restoreNote(spaceId, noteId) {
  await updateDoc(doc(db, ROOT.spaces, spaceId, COL.notes, noteId), {
    deletedAt: null
  });
}

// Hapus permanen (hanya pemilik; rules mengizinkan delete owner).
export async function purgeNote(spaceId, noteId) {
  await deleteDoc(doc(db, ROOT.spaces, spaceId, COL.notes, noteId));
}

export async function reportNote(spaceId, noteId, type, message) {
  const uid = requireUser();
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) throw new Error('Isi report wajib diisi.');
  if (cleanMessage.length > 2000) throw new Error('Report maksimal 2.000 karakter.');
  if (!['error', 'feedback'].includes(type)) throw new Error('Jenis report tidak valid.');
  await addDoc(collection(db, ROOT.spaces, spaceId, COL.noteReports), {
    noteId,
    reporterId: uid,
    type,
    message: cleanMessage,
    createdAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}

// Sampah dibersihkan otomatis: catatan milik user ini yang deletedAt sudah lewat
// 30 hari dihapus permanen. Dipanggil client saat daftar catatan dibuka
// (butuh izin baca dokumen itu sendiri; aturan "dibersihkan client saat dibuka").
export const TRASH_RETENTION_DAYS = 30;

export function isTrashExpired(note, now = Date.now()) {
  const deletedAt = note?.deletedAt;
  if (!deletedAt) return false;
  const ms = typeof deletedAt?.toMillis === 'function' ? deletedAt.toMillis() : null;
  if (ms == null) return false;
  return now - ms > TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export async function purgeExpiredNotes(spaceId, notes) {
  const expired = (notes || []).filter((note) => isTrashExpired(note));
  const results = await Promise.allSettled(
    expired.map((note) => purgeNote(spaceId, note.id))
  );
  return {
    purged: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length
  };
}

// Upsert state bookmark/"dipahami" milik user sendiri.
// stateId = noteId_uid; rules menolak menulis state milik user lain.
// `noteVisibility` disalin dari note agar rules bisa membatasi pembacaan
// state (state pada note private partner tidak boleh terbaca); rules
// memverifikasi ulang nilainya terhadap dokumen note aslinya.
export async function setNoteState(spaceId, noteId, patch, visibility) {
  const uid = requireUser();
  if (visibility !== 'shared' && visibility !== 'private') {
    throw new Error('Visibilitas catatan tidak valid.');
  }
  const ref = doc(db, ROOT.spaces, spaceId, COL.noteStates, `${noteId}_${uid}`);
  await setDoc(ref, {
    noteId,
    uid,
    noteVisibility: visibility,
    bookmarked: Boolean(patch.bookmarked),
    understood: Boolean(patch.understood),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}
