import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import {
  normalizeQuestionIds,
  normalizeQuizSettings,
  normalizeQuizText
} from '../utils/quizSettings';

function requireUser() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Anda belum masuk.');
  return uid;
}

function quizRef(spaceId, quizId) {
  return doc(db, ROOT.spaces, spaceId, COL.quizzes, quizId);
}

// Satu-satunya tempat yang membentuk payload kuis, dipakai create & update
// supaya validasi client tidak pernah menyimpang dari rules.
function quizFields(input) {
  const { title, description, topicId } = normalizeQuizText(input);
  return {
    title,
    description,
    topicId,
    questionIds: normalizeQuestionIds(input.questionIds),
    settings: normalizeQuizSettings(input.settings)
  };
}

export async function createQuiz(spaceId, input) {
  const uid = requireUser();
  const fields = quizFields(input);
  const ref = doc(collection(db, ROOT.spaces, spaceId, COL.quizzes));
  await setDoc(ref, {
    ...fields,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
  return ref.id;
}

// Update parsial; rules melihat hasil full doc yang tersimpan di server.
// `createdBy` & `createdAt` sengaja tidak pernah dikirim (immutable di rules).
export async function updateQuiz(spaceId, quizId, input) {
  requireUser();
  const fields = quizFields(input);
  await updateDoc(quizRef(spaceId, quizId), {
    ...fields,
    updatedAt: serverTimestamp()
  });
}

// Mengganti snapshot soal (tambah/hapus/reorder) tanpa menyentuh dokumen soal.
export async function updateQuizQuestionIds(spaceId, quizId, questionIds) {
  requireUser();
  await updateDoc(quizRef(spaceId, quizId), {
    questionIds: normalizeQuestionIds(questionIds),
    updatedAt: serverTimestamp()
  });
}

export async function getQuiz(spaceId, quizId) {
  requireUser();
  const snap = await getDoc(quizRef(spaceId, quizId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// Kedua anggota boleh membaca semua kuis di ruangnya (lihat rules).
export async function getQuizzes(spaceId) {
  requireUser();
  const snap = await getDocs(collection(db, ROOT.spaces, spaceId, COL.quizzes));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

// Hapus permanen (hanya pembuat; rules mengizinkan delete createdBy).
// TIDAK menghapus Question document mana pun — soal tetap utuh di bank soal.
export async function deleteQuiz(spaceId, quizId) {
  requireUser();
  await deleteDoc(quizRef(spaceId, quizId));
}