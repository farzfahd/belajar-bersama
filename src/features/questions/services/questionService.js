import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import { normalizeTags } from '../../../shared/utils/validate';
import { buildTypeFields, normalizePairDraft, normalizeSubQuestions } from '../utils/questionTypeFields';
import { normalizeQuestionReport as normalizeQuestionReportInput } from '../utils/questionReport';

/**
 * Menyesuaikan answerIndex saat satu opsi dihapus.
 */
export function adjustAnswerIndexOnOptionRemove(removedIndex, currentAnswerIndex) {
  if (typeof currentAnswerIndex !== 'number') return 0;
  if (currentAnswerIndex === removedIndex) {
    return Math.max(0, removedIndex - 1);
  }
  if (currentAnswerIndex > removedIndex) {
    return currentAnswerIndex - 1;
  }
  return currentAnswerIndex;
}

/**
 * Menyesuaikan correctIndices (multiple select) saat satu opsi dihapus.
 */
export function adjustCorrectIndicesOnOptionRemove(removedIndex, currentIndices = []) {
  return currentIndices
    .filter((idx) => idx !== removedIndex)
    .map((idx) => (idx > removedIndex ? idx - 1 : idx));
}

export async function createQuestion(spaceId, data) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum masuk.');
  if (!spaceId) throw new Error('spaceId wajib diisi.');

  const prompt = (data.prompt || '').trim();
  if (!prompt) throw new Error('Pertanyaan/prompt wajib diisi.');

  const type = data.type || 'single';
  const qCol = collection(db, ROOT.spaces, spaceId, COL.questions);
  const qRef = doc(qCol);

  const cleanTags = normalizeTags(data.tags || []);
  const baseDoc = {
    prompt,
    type,
    topicId: data.topicId || '',
    difficulty: data.difficulty || 'beginner',
    visibility: data.visibility || 'shared',
    tags: cleanTags,
    explanation: (data.explanation || '').trim().slice(0, 2000),
    points: Math.max(1, Math.min(100, Number(data.points) || 10)),
    timeLimitSeconds: Math.max(0, Number(data.timeLimitSeconds) || 0),
    attachmentUrl: (data.attachmentUrl || '').trim(),
    relatedNoteId: (data.relatedNoteId || '').trim(),
    relatedResourceId: (data.relatedResourceId || '').trim(),
    hasAnswerKey: data.hasAnswerKey !== false,
    commentCount: 0,
    deletedAt: null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  };

  // Validasi & pembersihan field khusus tipe. Logikanya dipindah ke
  // `utils/questionTypeFields.js` (murni & bisa diuji); bentuk dokumen yang
  // dihasilkan tetap sama.
  Object.assign(baseDoc, buildTypeFields(type, data));

  await setDoc(qRef, baseDoc);
  return qRef.id;
}

export async function updateQuestion(spaceId, questionId, data) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum masuk.');
  if (!spaceId || !questionId) throw new Error('ID tidak lengkap.');

  const qRef = doc(db, ROOT.spaces, spaceId, COL.questions, questionId);
  const updates = {
    updatedAt: serverTimestamp()
  };

  if (data.prompt !== undefined) updates.prompt = String(data.prompt).trim();
  if (data.topicId !== undefined) updates.topicId = data.topicId;
  if (data.difficulty !== undefined) updates.difficulty = data.difficulty;
  if (data.visibility !== undefined) updates.visibility = data.visibility;
  if (data.tags !== undefined) updates.tags = normalizeTags(data.tags);
  if (data.explanation !== undefined) updates.explanation = String(data.explanation).trim();
  if (data.points !== undefined) updates.points = Math.max(1, Math.min(100, Number(data.points) || 10));
  if (data.timeLimitSeconds !== undefined) updates.timeLimitSeconds = Math.max(0, Number(data.timeLimitSeconds) || 0);
  if (data.attachmentUrl !== undefined) updates.attachmentUrl = (data.attachmentUrl || '').trim();
  if (data.relatedNoteId !== undefined) updates.relatedNoteId = (data.relatedNoteId || '').trim();
  if (data.relatedResourceId !== undefined) updates.relatedResourceId = (data.relatedResourceId || '').trim();
  if (data.hasAnswerKey !== undefined) updates.hasAnswerKey = Boolean(data.hasAnswerKey);

  const type = data.type;
  if (type) updates.type = type;

  // Update field tipe
  if (data.options !== undefined) {
    const rawOptions = data.options.map((o) => String(o || '').trim());
    updates.options = rawOptions;
  }
  if (data.answerIndex !== undefined) updates.answerIndex = Number(data.answerIndex);
  if (data.correctIndices !== undefined) updates.correctIndices = data.correctIndices;
  if (data.correctBoolean !== undefined) updates.correctBoolean = Boolean(data.correctBoolean);
  if (data.acceptedAnswers !== undefined) updates.acceptedAnswers = data.acceptedAnswers;
  if (data.sampleAnswer !== undefined) updates.sampleAnswer = String(data.sampleAnswer);
  if (data.pairs !== undefined) updates.pairs = data.pairs;
  // Draft editor menjodohkan - HANYA untuk soal tipe `matching`, dan hanya
  // kalau draft-nya punya struktur yang bisa dipercaya. `null` berarti "hapus
  // field ini dari dokumen" (Firestore: null = field dihapus), jadi draft rusak
  // tidak pernah menggantikan draft lama yang masih benar. `pairs` sendiri
  // tidak pernah diubah bentuknya di sini.
  if (type === 'matching' && data.pairDraft !== undefined) {
    const draft = normalizePairDraft(data.pairDraft);
    updates.pairDraft = draft || null;
  }
  if (data.items !== undefined) updates.items = data.items;
  if (data.correctValue !== undefined) updates.correctValue = Number(data.correctValue);
  if (data.tolerance !== undefined) updates.tolerance = Number(data.tolerance);
  if (data.starterCode !== undefined) updates.starterCode = String(data.starterCode);
  if (data.expectedOutput !== undefined) updates.expectedOutput = String(data.expectedOutput);
  if (data.sampleSolution !== undefined) updates.sampleSolution = String(data.sampleSolution);
  if (data.caseText !== undefined) updates.caseText = String(data.caseText);
  // Divalidasi dengan normalizer yang sama seperti saat create, supaya mode
  // edit tidak bisa menulis nested >1 tingkat atau tipe yang tidak didukung.
  if (data.subQuestions !== undefined) updates.subQuestions = normalizeSubQuestions(data.subQuestions);

  await updateDoc(qRef, updates);
}

export async function softDeleteQuestion(spaceId, questionId) {
  const qRef = doc(db, ROOT.spaces, spaceId, COL.questions, questionId);
  await updateDoc(qRef, {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function restoreQuestion(spaceId, questionId) {
  const qRef = doc(db, ROOT.spaces, spaceId, COL.questions, questionId);
  await updateDoc(qRef, {
    deletedAt: null,
    updatedAt: serverTimestamp()
  });
}

export async function purgeQuestion(spaceId, questionId) {
  const qRef = doc(db, ROOT.spaces, spaceId, COL.questions, questionId);
  await deleteDoc(qRef);
}

// ---------------------------- report soal ----------------------------
// Report disimpan sebagai subkoleksi di bawah soal (`questions/{id}/reports`)
// supaya owner bisa mendengarkannya dengan listener polos tanpa query `in`.
// Rules menolak report atas soal sendiri dan atas soal yang tidak terlihat.

export async function reportQuestion(spaceId, questionId, type, message) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum masuk.');
  if (!spaceId || !questionId) throw new Error('ID tidak lengkap.');

  const { type: cleanType, message: cleanMessage } = normalizeQuestionReportInput(type, message);

  // `questionId` ikut disimpan di dalam dokumen walau sudah ada di path, supaya
  // rules (dan pemeriksaan manual lewat Emulator UI) tidak harus membaca path.
  await addDoc(collection(db, ROOT.spaces, spaceId, COL.questions, questionId, COL.questionReports), {
    questionId,
    reporterId: uid,
    type: cleanType,
    message: cleanMessage,
    createdAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION
  });
}

/**
 * Listener report untuk satu soal. Hanya PEMILIK soal yang boleh `list`
 * (lihat catatan di firestore.rules), jadi jangan dipakai oleh pelapor.
 */
export function subscribeQuestionReports(spaceId, questionId, onData, onError) {
  if (!spaceId || !questionId) return () => {};
  const reports = collection(db, ROOT.spaces, spaceId, COL.questions, questionId, COL.questionReports);
  return onSnapshot(
    query(reports, orderBy('createdAt', 'desc')),
    (snap) =>
      onData(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
    onError
  );
}
