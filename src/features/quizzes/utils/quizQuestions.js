// Utilitas murni untuk menyusun & memanipulasi snapshot soal pada kuis.
// TIDAK menyentuh Firestore & tidak mengurutkan ulang apa pun: urutan di sini
// SELALU persis urutan `quiz.questionIds` (Bagian E: jangan ambil ordering dari
// Question Bank). Semua fungsi mengembalikan array BARU dan tidak mengubah
// input, sehingga aman dipakai di React state.

/**
 * Memetakan `questionIds` menjadi baris tampilan, satu per entri snapshot.
 *
 * - Urutan baris = urutan `questionIds` (bukan createdAt/updatedAt/difficulty).
 * - Soal yang tidak ditemukan (sudah dihapus, di Sampah, atau private milik
 *   partner sehingga tidak terlihat) ditandai `missing: true` — TIDAK
 *   dibuang otomatis, supaya id-nya tidak hilang dari kuis diam-diam.
 *
 * @param {string[]} questionIds - snapshot dari dokumen kuis
 * @param {Array<Object>} questions - hasil useQuestions (sudah dual-listener)
 * @returns {Array<{position:number, questionId:string, question:Object|null, missing:boolean}>}
 */
export function buildQuizQuestionRows(questionIds, questions) {
  const ids = Array.isArray(questionIds) ? questionIds : [];
  const list = Array.isArray(questions) ? questions : [];
  const byId = new Map(list.map((q) => [q.id, q]));

  return ids.map((questionId, position) => {
    const question = byId.get(questionId) || null;
    return {
      position,
      questionId,
      question,
      missing: !question || Boolean(question.deletedAt)
    };
  });
}

/**
 * Menambah soal terpilih di belakang urutan yang sudah ada.
 * Id yang sudah ada di kuis (atau terpilih dua kali) dilewati diam-diam
 * supaya multi-select tidak pernah menghasilkan duplikat.
 * Batas 50 divalidasi di service/rules — di sini tidak dipotong diam-diam.
 */
export function appendQuestionIds(current, selected) {
  const base = Array.isArray(current) ? current : [];
  const list = Array.isArray(selected) ? selected : [];
  const seen = new Set(base);

  const result = [...base];
  for (const id of list) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Menghapus satu entri pada indeks tertentu. Question document TIDAK ikut
 * tersentuh — hanya id-nya yang hilang dari snapshot.
 * Mengembalikan array input bila indeks di luar jangkauan (tanpa error).
 */
export function removeQuestionIdAt(ids, index) {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/**
 * Memindahkan satu soal satu langkah (delta -1 = naik, +1 = turun).
 * Mengembalikan array YANG SAMA bila gerakan tidak mungkin (kepala, ekor,
 * satu soal, atau indeks di luar jangkauan) — pemanggil memakai identitas ini
 * untuk membatalkan write yang tidak perlu.
 */
export function moveQuestionIdAt(ids, index, delta) {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  const target = index + delta;
  if (!Number.isInteger(target) || target < 0 || target >= list.length) return list;

  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}
