// Stub `questionService` untuk render statis (lihat shot-question-cards.mjs
// dan shot-editor-cards.mjs). Yang dipakai komponen: dua helper indeks-pilihan
// (logikanya disalin PERSIS dari service asli) + create/update yang tidak pernah
// terpanggil saat render statis, jadi sengaja menolak agar tidak ada yang
// diam-diam menulis ke Firestore.
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

export function adjustCorrectIndicesOnOptionRemove(removedIndex, currentIndices = []) {
  return (Array.isArray(currentIndices) ? currentIndices : [])
    .filter((idx) => idx !== removedIndex)
    .map((idx) => (idx > removedIndex ? idx - 1 : idx));
}

export async function createQuestion() {
  throw new Error('stub: createQuestion tidak boleh dipanggil saat render statis');
}

export async function updateQuestion() {
  throw new Error('stub: updateQuestion tidak boleh dipanggil saat render statis');
}
