import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import { normalizeTags } from '../../../shared/utils/validate';

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

  // Validasi & pembersihan field khusus tipe
  if (type === 'single') {
    const rawOptions = (data.options || []).map((o) => String(o || '').trim());
    if (rawOptions.length < 2 || rawOptions.length > 20) {
      throw new Error('Pilihan ganda harus memiliki antara 2 hingga 20 opsi.');
    }
    const set = new Set(rawOptions);
    if (set.size !== rawOptions.length) {
      throw new Error('Terdapat pilihan/opsi duplikat.');
    }
    const ansIdx = Number(data.answerIndex);
    if (Number.isNaN(ansIdx) || ansIdx < 0 || ansIdx >= rawOptions.length) {
      throw new Error('Kunci jawaban pilihan ganda tidak valid.');
    }
    baseDoc.options = rawOptions;
    baseDoc.answerIndex = ansIdx;
  } else if (type === 'multiple') {
    const rawOptions = (data.options || []).map((o) => String(o || '').trim());
    if (rawOptions.length < 2 || rawOptions.length > 20) {
      throw new Error('Pilihan ganda kompleks harus memiliki antara 2 hingga 20 opsi.');
    }
    const set = new Set(rawOptions);
    if (set.size !== rawOptions.length) {
      throw new Error('Terdapat pilihan/opsi duplikat.');
    }
    const indices = Array.from(new Set((data.correctIndices || []).map(Number))).sort((a, b) => a - b);
    if (indices.length === 0 || indices.some((idx) => idx < 0 || idx >= rawOptions.length)) {
      throw new Error('Pilih setidaknya satu kunci jawaban yang valid.');
    }
    baseDoc.options = rawOptions;
    baseDoc.correctIndices = indices;
  } else if (type === 'boolean') {
    baseDoc.correctBoolean = Boolean(data.correctBoolean);
  } else if (type === 'short_answer') {
    const accepted = (data.acceptedAnswers || [])
      .map((a) => String(a || '').trim())
      .filter(Boolean);
    if (accepted.length === 0) {
      throw new Error('Masukkan setidaknya satu variasi jawaban yang diterima.');
    }
    baseDoc.acceptedAnswers = accepted;
  } else if (type === 'essay') {
    baseDoc.sampleAnswer = (data.sampleAnswer || '').trim().slice(0, 5000);
  } else if (type === 'matching') {
    const pairs = (data.pairs || []).map((p) => ({
      left: String(p?.left || '').trim(),
      right: String(p?.right || '').trim()
    })).filter((p) => p.left && p.right);
    if (pairs.length < 2) {
      throw new Error('Soal menjodohkan memerlukan setidaknya 2 pasangan.');
    }
    baseDoc.pairs = pairs;
  } else if (type === 'ordering') {
    const items = (data.items || []).map((it) => String(it || '').trim()).filter(Boolean);
    if (items.length < 2) {
      throw new Error('Soal mengurutkan memerlukan setidaknya 2 item.');
    }
    baseDoc.items = items;
  } else if (type === 'numerical') {
    const val = Number(data.correctValue);
    if (Number.isNaN(val)) throw new Error('Nilai numerik benar harus berupa angka.');
    baseDoc.correctValue = val;
    baseDoc.tolerance = Math.max(0, Number(data.tolerance) || 0);
  } else if (type === 'code') {
    baseDoc.starterCode = String(data.starterCode || '');
    baseDoc.expectedOutput = String(data.expectedOutput || '');
    baseDoc.sampleSolution = String(data.sampleSolution || '');
  } else if (type === 'case_study') {
    const caseText = String(data.caseText || '').trim();
    if (!caseText) throw new Error('Teks kasus studi tidak boleh kosong.');
    baseDoc.caseText = caseText;
    baseDoc.subQuestions = Array.isArray(data.subQuestions) ? data.subQuestions : [];
  }

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
  if (data.items !== undefined) updates.items = data.items;
  if (data.correctValue !== undefined) updates.correctValue = Number(data.correctValue);
  if (data.tolerance !== undefined) updates.tolerance = Number(data.tolerance);
  if (data.starterCode !== undefined) updates.starterCode = String(data.starterCode);
  if (data.expectedOutput !== undefined) updates.expectedOutput = String(data.expectedOutput);
  if (data.sampleSolution !== undefined) updates.sampleSolution = String(data.sampleSolution);
  if (data.caseText !== undefined) updates.caseText = String(data.caseText);
  if (data.subQuestions !== undefined) updates.subQuestions = data.subQuestions;

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
