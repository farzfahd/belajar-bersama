import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION, STATUS } from '../../../lib/constants';
import { isHttpUrl, normalizeTags } from '../../../shared/utils/validate';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function text(value) {
  return String(value ?? '').trim();
}

function assertMaxLength(value, max, label) {
  if (value.length > max) throw new Error(`${label} maksimal ${max} karakter.`);
}

function resourceDoc(uid, input) {
  const title = text(input.title);
  if (!title) throw new Error('Judul resource wajib diisi.');
  assertMaxLength(title, 200, 'Judul');

  const url = text(input.url);
  if (!url) throw new Error('URL wajib diisi.');
  if (!isHttpUrl(url)) throw new Error('URL harus diawali http:// atau https://.');
  assertMaxLength(url, 2048, 'URL');

  const topicId = text(input.topicId);
  if (!topicId) throw new Error('Topik wajib dipilih.');

  const author = text(input.author);
  assertMaxLength(author, 100, 'Penulis / sumber');

  const description = text(input.description);
  assertMaxLength(description, 2000, 'Deskripsi');

  const type = text(input.type) || 'website';
  if (!STATUS.resource.includes(type)) throw new Error('Jenis resource tidak valid.');

  const visibility = text(input.visibility) || 'private';
  if (!STATUS.visibility.includes(visibility)) throw new Error('Visibilitas tidak valid.');

  const difficulty = text(input.difficulty) || 'beginner';
  if (!STATUS.difficulty.includes(difficulty)) throw new Error('Tingkat kesulitan tidak valid.');

  const rawMinutes = input.estimatedMinutes;
  const estimatedMinutes = rawMinutes === '' || rawMinutes == null ? 0 : Number(rawMinutes);
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 0) {
    throw new Error('Estimasi waktu harus berupa bilangan bulat 0 atau lebih.');
  }

  const rawTags = Array.isArray(input.tags) ? input.tags : text(input.tags).split(',');
  return {
    title,
    url,
    topicId,
    author,
    type,
    estimatedMinutes,
    tags: normalizeTags(rawTags),
    description,
    visibility,
    difficulty,
    addedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  };
}

export async function createResource(spaceId, input) {
  const uid = requireUser();
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.resources));
  await setDoc(ref, resourceDoc(uid, input));
  return ref.id;
}

// Update parsial; rules melihat hasil full doc yang ada di server.
export async function updateResource(spaceId, resourceId, input) {
  const { title, url, topicId, author, type, estimatedMinutes, tags, description, visibility, difficulty } =
    resourceDoc(requireUser(), input);
  await updateDoc(doc(db, ROOT.spaces, spaceId, COL.resources, resourceId), {
    title,
    url,
    topicId,
    author,
    type,
    estimatedMinutes,
    tags,
    description,
    visibility,
    difficulty,
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}

// Hapus permanen (hanya pemilik; rules mengizinkan delete addedBy).
// Resource tidak punya alur soft-delete (lihat resources/utils/visibility.js).
export async function deleteResource(spaceId, resourceId) {
  await deleteDoc(doc(db, ROOT.spaces, spaceId, COL.resources, resourceId));
}

// Upsert status per-user (not_started | reading | completed) milik sendiri.
// stateId = resourceId_uid; rules menolak menulis status milik user lain.
// `resourceVisibility` disalin dari resource (diverifikasi rules di sisi server)
// agar status pada resource private partner tidak bisa dibaca.
export async function setResourceState(spaceId, resourceId, status, visibility) {
  const uid = requireUser();
  if (!text(resourceId)) throw new Error('Resource tidak valid.');
  if (!STATUS.resourceState.includes(status)) throw new Error('Status resource tidak valid.');
  if (visibility !== 'shared' && visibility !== 'private') {
    throw new Error('Visibilitas resource tidak valid.');
  }
  const ref = doc(db, ROOT.spaces, spaceId, COL.resourceStates, `${resourceId}_${uid}`);
  await setDoc(ref, {
    resourceId,
    uid,
    resourceVisibility: visibility,
    status,
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}
