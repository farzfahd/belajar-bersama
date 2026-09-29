import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import { normalizeTags } from '../../../shared/utils/validate';
// Hanya `buildTypeFields` yang dipakai di sini. Aturan PGK (K < N), keunikan
// pasangan, normalisasi pairDraft, dan batas sub-soal SEMUA dipanggil dari
// dalamnya, jadi memanggilnya di sini otomatis menjalankan semuanya — lebih
// baik daripada memeriksa ulang di jalur edit seperti sebelumnya, karena kedua
// jalur create dan edit sekarang lewat validasi yang sama persis.
import { buildTypeFields } from '../utils/questionTypeFields';
import { normalizeQuestionReport as normalizeQuestionReportInput } from '../utils/questionReport';
import { planCreateQuestion, planUpdateQuestion } from '../utils/questionWritePlan';
import { keyDocRef } from './questionKeyService';

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

// Metadata publik yang menyertai setiap dokumen soal. Dipisah dari logika kunci
// supaya jelas mana yang tidak pernah boleh berisi jawaban.
function publicMetadata(data, uid) {
  return {
    prompt: (data.prompt || '').trim(),
    topicId: data.topicId || '',
    difficulty: data.difficulty || 'beginner',
    visibility: data.visibility || 'shared',
    tags: normalizeTags(data.tags || []),
    // `explanation` TETAP di dokumen publik, bukan di dokumen kunci. Ia bukan
    // field kunci: hanya boleh tampil setelah attempt selesai, dan itu
    // dikendalikan di sisi snapshot/UI, bukan dengan menyembunyikannya di sini.
    // Memindahkannya ke key doc akan membuatnya hilang untuk review, karena
    // rules hanya mengizinkan owner membaca dokumen kunci.
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
}

/**
 * Membuat soal baru: dokumen publik + dokumen kunci, dalam SATU batch.
 *
 * Kenapa batch dan bukan dua `setDoc` terpisah: kalau yang public berhasil dan
 * yang key gagal, ada soal aktif yang tidak punya kunci. Batch membuat keduanya
 * succeed atau gagal bersama, jadi kondisi "public-without-key" tidak pernah
 * terjadi meski Rules menolak salah satunya.
 *
 * `keyRevision` ditulis ke dokumen publik sebagai penunjuk revisi kunci yang
 * aktif. Ini yang dipakai `planUpdateQuestion` untuk memberi nomor revisi baru,
 * dan yang membuat quiz bisa mengunci soal ke revisi tertentu.
 */
export async function createQuestion(spaceId, data) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum masuk.');
  if (!spaceId) throw new Error('spaceId wajib diisi.');

  const prompt = (data.prompt || '').trim();
  if (!prompt) throw new Error('Pertanyaan/prompt wajib diisi.');

  const type = data.type || 'single';
  const qCol = collection(db, ROOT.spaces, spaceId, COL.questions);
  const qRef = doc(qCol);

  const baseDoc = { ...publicMetadata(data, uid), prompt, type };

  // Validasi & pembersihan field khusus tipe. Logikanya di
  // `utils/questionTypeFields.js` (murni & bisa diuji); hasilnya BELUM dipisah
  // public/key, itu tugas `planCreateQuestion` di bawah.
  const typeFields = buildTypeFields(type, data);

  const plan = planCreateQuestion({
    questionId: qRef.id,
    type,
    // `data.key` dipakai kalau form mengirim kunci secara terpisah (jalur baru).
    // Kalau tidak, kunci diambil dari `typeFields` oleh splitter.
    data: { ...typeFields, key: data.key }
  });

  const batch = writeBatch(db);
  batch.set(qRef, {
    ...baseDoc,
    ...plan.publicDoc,
    // Tanpa field ini, `updateQuestion` tidak bisa tahu nomor revisi kunci
    // berikutnya dan akan selalu menimpa revisi '1'.
    keyRevision: plan.keyRevision
  });
  batch.set(
    keyDocRef(spaceId, qRef.id, plan.keyRevision),
    { ...plan.keyDoc, createdAt: serverTimestamp() }
  );
  await batch.commit();

  return qRef.id;
}

// Metadata publik pada jalur edit. field yang tidak dikirim TIDAK ditulis, jadi
// edit metadata tidak menimpa field lain dengan nilai kosong. Perbedaannya dengan
// `publicMetadata` (jalur create) sengaja: create mengisi default, edit hanya
// menyentuh apa yang memang|author ubah.
function publicMetadataPatch(data) {
  const p = {};
  if (data.prompt !== undefined) p.prompt = String(data.prompt).trim();
  if (data.topicId !== undefined) p.topicId = data.topicId;
  if (data.difficulty !== undefined) p.difficulty = data.difficulty;
  if (data.visibility !== undefined) p.visibility = data.visibility;
  if (data.tags !== undefined) p.tags = normalizeTags(data.tags);
  if (data.explanation !== undefined) p.explanation = String(data.explanation).trim();
  if (data.points !== undefined) p.points = Math.max(1, Math.min(100, Number(data.points) || 10));
  if (data.timeLimitSeconds !== undefined) p.timeLimitSeconds = Math.max(0, Number(data.timeLimitSeconds) || 0);
  if (data.attachmentUrl !== undefined) p.attachmentUrl = (data.attachmentUrl || '').trim();
  if (data.relatedNoteId !== undefined) p.relatedNoteId = (data.relatedNoteId || '').trim();
  if (data.relatedResourceId !== undefined) p.relatedResourceId = (data.relatedResourceId || '').trim();
  if (data.hasAnswerKey !== undefined) p.hasAnswerKey = Boolean(data.hasAnswerKey);
  return p;
}

/**
 * Mengubah soal: patch dokumen publik + dokumen kunci REVISI BARU, satu batch.
 *
 * Kunci tidak pernah ditulis ke dokumen publik lagi. Setiap edit kunci
 * menghasilkan dokumen kunci baru dengan nomor revisi yang naik; revisi lama
 * dibiarkan utuh karena attempt lama masih menunjuknya.
 *
 * Soal legacy (kunci inline) ditangani: kunci yang masih tertinggal dibawa ke
 * dokumen kunci baru, lalu field inline-nya dihapus pada penulisan yang sama.
 * Pemindahan terjadi di dalam batch, jadi tidak pernah ada keadaan di mana
 * kunci sudah hilang dari satu tempat dan belum ada di tempat lain.
 */
export async function updateQuestion(spaceId, questionId, data) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum masuk.');
  if (!spaceId || !questionId) throw new Error('ID tidak lengkap.');

  const qRef = doc(db, ROOT.spaces, spaceId, COL.questions, questionId);
  // Dokumen soal yang ADA sekarang, bukan data dari form. Ini sumber kebenaran
  // untuk nomor revisi kunci dan untuk kunci legacy yang harus dibawa.
  const currentSnap = await getDoc(qRef);
  const existing = currentSnap.exists() ? { id: currentSnap.id, ...currentSnap.data() } : null;
  if (!existing) throw new Error('Soal tidak ditemukan.');

  const type = data.type || existing.type;

  // Field khusus tipe tetap divalidasi di sini, sama seperti sebelumnya, karena
  // form editor mengirim data mentah dan `planUpdateQuestion` hanya memisahkannya
  // — bukan membersihkan isinya. PGK (K < N) dan keunikan pasangan dijaga di
  // sini; `createQuestion` sudah lewat `buildTypeFields` yang memanggil keduanya.
  const typeFields = buildTypeFields(type, data);

  const plan = planUpdateQuestion({
    type,
    data: { ...typeFields, key: data.key },
    existingQuestion: existing
  });

  const updates = { ...publicMetadataPatch(data), ...plan.publicPatch, updatedAt: serverTimestamp() };
  if (data.type !== undefined) updates.type = data.type;
  // Nomor revisi aktif dipindah ke dokumen publik supaya edit berikutnya knows
  // nomor berikutnya, dan quiz bisa mengunci soal ke revisi tertentu.
  updates.keyRevision = plan.keyRevision;

  const batch = writeBatch(db);
  batch.update(qRef, updates);
  batch.set(
    keyDocRef(spaceId, questionId, plan.keyRevision),
    { ...plan.keyDoc, createdAt: serverTimestamp() }
  );
  await batch.commit();
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
