import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, IDENTITY, ROOT, SCHEMA_VERSION } from '../../../lib/constants';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function topicDoc(uid, input, parentId, level, order) {
  return {
    title: String(input.title || '').trim().slice(0, 200),
    description: String(input.description || '')
      .trim()
      .slice(0, 2000),
    icon: String(input.icon || '').trim().slice(0, 8) || 'ðŸ“„',
    color: input.color || IDENTITY.defaultColor,
    parentId: parentId ?? null,
    level,
    order,
    status: input.status || 'not_started',
    difficulty: input.difficulty || 'beginner',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  };
}

export async function createTopic(spaceId, { parentId = null, level = 0, order = 0, ...input }) {
  const uid = requireUser();
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.topics));
  await setDoc(ref, topicDoc(uid, input, parentId, level, order));
  return ref.id;
}

// Update parsial; rules melihat hasil-merge penuh. createdBy/createdAt tidak dikirim.
export async function updateTopic(spaceId, topicId, patch) {
  const ref = doc(db, ROOT.spaces, spaceId, COL.topics, topicId);
  await updateDoc(ref, {
    ...patch,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: serverTimestamp()
  });
}

// Hapus cascade beberapa topik sekaligus (induk + seluruh subtopiknya).
export async function deleteTopics(spaceId, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.delete(doc(db, ROOT.spaces, spaceId, COL.topics, id));
  }
  await batch.commit();
}

// Ubah parent & urutan sejumlah topik dalam satu batch (pindah/urutkan).
export async function setTopicOrders(spaceId, items) {
  if (!items?.length) return;
  const batch = writeBatch(db);
  for (const it of items) {
    batch.update(doc(db, ROOT.spaces, spaceId, COL.topics, it.id), {
      parentId: it.parentId ?? null,
      level: it.level,
      order: it.order,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
}

// Seed template: Mathematics â†’ Probability â†’ Bayes.
// `rootOrder` dipakai saat roadmap sudah berisi topik: subject template
// diletakkan paling akhir agar order tidak bentrok dengan order yang ada.
export async function importTemplateRoadmap(spaceId, { rootOrder = 0 } = {}) {
  const uid = requireUser();
  const batch = writeBatch(db);
  const col = collection(db, ROOT.spaces, spaceId, COL.topics);
  const mathId = doc(col).id;
  const probId = doc(col).id;
  const bayesId = doc(col).id;
  const mk = (id, data) =>
    batch.set(doc(col, id), { ...data, createdBy: uid, schemaVersion: SCHEMA_VERSION });

  mk(mathId, {
    title: 'Mathematics',
    description: 'Bidang dasar matematika: aljabar, kalkulus, kalkulus probabilitas.',
    icon: 'ðŸ“',
    // Warna topik = personalisasi user (dari IDENTITY.colors), bukan token
    color: '#c08a6a',
    parentId: null,
    level: 0,
    order: Math.max(0, Number(rootOrder) || 0),
    status: 'learning',
    difficulty: 'beginner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  mk(probId, {
    title: 'Probability',
    description: 'Pengantar peluang: ruang sampel, kejadian, dan distribusi.',
    icon: 'ðŸ“Š',
    // Warna topik = personalisasi user (dari IDENTITY.colors), bukan token
    color: '#d9a441',
    parentId: mathId,
    level: 1,
    order: 0,
    status: 'not_started',
    difficulty: 'beginner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  mk(bayesId, {
    title: 'Bayes',
    description: 'Teorema Bayes, probabilitas bersyarat, dan aplikasinya.',
    icon: 'ðŸ§ ',
    // Warna topik = personalisasi user (dari IDENTITY.colors), bukan token
    color: '#7aa89a',
    parentId: probId,
    level: 2,
    order: 0,
    status: 'not_started',
    difficulty: 'intermediate',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
  return [mathId, probId, bayesId];
}
