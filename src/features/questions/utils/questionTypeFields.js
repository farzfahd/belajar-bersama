// Builders murni untuk field khusus tipe soal.
//
// KODE INI DIPINDAH dari `questionService.createQuestion` tanpa mengubah
// perilakunya, hanya dipisah agar bisa diuji dengan `node --test` (createQuestion
// sendiri butuh Firebase + Auth). `createQuestion` tetap menjadi satu-satunya
// pemanggil, jadi tidak ada dua sumber kebenaran.
//
// Tidak ada evaluator / sandbox / eksekusi kode di sini: tipe `code` hanya
// menyimpan teks, penilaiannya manual.

export const OPTION_MIN = 2;
export const OPTION_MAX = 20;
export const MAX_SUB_QUESTIONS = 10;

// Tipe yang boleh dipakai sebagai sub-soal studi kasus. `essay` & `code`
// butuh penilaian manual dan `case_study` butuh nesting, sehingga tidak
// diperbolehkan agar sub-soal tetap bisa dinilai otomatis.
export const SUB_QUESTION_TYPES = [
  'single',
  'multiple',
  'boolean',
  'short_answer',
  'matching',
  'ordering',
  'numerical'
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cleanList(value) {
  return list(value).map((v) => String(v ?? '').trim());
}

// Opsi 2..20, unik, non-kosong. Melempar Error bila tidak terpenuhi.
function requireOptions(rawOptions, label) {
  const options = cleanList(rawOptions);
  if (options.length < OPTION_MIN || options.length > OPTION_MAX) {
    throw new Error(`${label} harus memiliki antara ${OPTION_MIN} hingga ${OPTION_MAX} opsi.`);
  }
  if (options.some((o) => !o)) {
    throw new Error(`${label} tidak boleh memiliki opsi kosong.`);
  }
  if (new Set(options).size !== options.length) {
    throw new Error('Terdapat pilihan/opsi duplikat.');
  }
  return options;
}

// Kunci jawaban satu opsi: wajib integer dan berada dalam rentang opsi.
function requireAnswerIndex(raw, options) {
  const answerIndex = Number(raw);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    throw new Error('Kunci jawaban pilihan ganda tidak valid.');
  }
  return answerIndex;
}

// Kunci jawaban multi-opsi: unik, dan seluruhnya menunjuk opsi yang ada.
function requireCorrectIndices(raw, options) {
  const indices = [...new Set(list(raw).map(Number))].sort((a, b) => a - b);
  if (indices.length === 0 || indices.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= options.length)) {
    throw new Error('Pilih setidaknya satu kunci jawaban yang valid.');
  }
  return indices;
}

function requireAcceptedAnswers(raw) {
  const accepted = cleanList(raw).filter(Boolean);
  if (accepted.length === 0) {
    throw new Error('Masukkan setidaknya satu variasi jawaban yang diterima.');
  }
  return accepted;
}

function requirePairs(raw) {
  const pairs = list(raw)
    .map((p) => ({ left: String(p?.left ?? '').trim(), right: String(p?.right ?? '').trim() }))
    .filter((p) => p.left && p.right);
  if (pairs.length < 2) {
    throw new Error('Soal menjodohkan memerlukan setidaknya 2 pasangan.');
  }
  return pairs;
}

function requireItems(raw) {
  const items = cleanList(raw).filter(Boolean);
  if (items.length < 2) {
    throw new Error('Soal mengurutkan memerlukan setidaknya 2 item.');
  }
  return items;
}

/**
 * Membangun satu sub-soal studi kasus (maksimal SATU tingkat).
 *
 * Aturan 1 tingkat ditegakkan secara struktural: objek hasil hanya boleh
 * berisi kunci milik tipenya sendiri, jadi kunci `subQuestions`/`subQuestion`
 * yang mencoba diselundupkan akan DITOLAK lebih dulu (lihat bawah) dan
 * kunci asing lain otomatis terbuang.
 * Nested >1 tingkat ditolak eksplisit supaya pengguna mendapat pesan jelas,
 * bukan data yang diam-diam terpotong.
 *
 * @param {Object} raw - sub-soal dari form
 * @returns {Object} sub-soal ternormalisasi
 */
function normalizeSubQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Sub-soal harus berupa data soal yang lengkap.');
  }
  // Nesting ditolak lebih dulu, dengan pesan eksplisit.
  if ('subQuestions' in raw || 'subQuestion' in raw) {
    throw new Error('Sub-soal tidak boleh memiliki sub-soal (maksimal 1 tingkat).');
  }

  const type = String(raw.type || '').trim();
  if (!SUB_QUESTION_TYPES.includes(type)) {
    throw new Error('Tipe sub-soal tidak didukung untuk studi kasus.');
  }

  if (type === 'single') {
    const options = requireOptions(raw.options, 'Sub-soal pilihan ganda');
    return { type, options, answerIndex: requireAnswerIndex(raw.answerIndex, options) };
  }
  if (type === 'multiple') {
    const options = requireOptions(raw.options, 'Sub-soal pilihan ganda kompleks');
    return { type, options, correctIndices: requireCorrectIndices(raw.correctIndices, options) };
  }
  if (type === 'boolean') {
    if (typeof raw.correctBoolean !== 'boolean') {
      throw new Error('Kunci jawaban benar/salah sub-soal harus boolean.');
    }
    return { type, correctBoolean: raw.correctBoolean };
  }
  if (type === 'short_answer') {
    return { type, acceptedAnswers: requireAcceptedAnswers(raw.acceptedAnswers) };
  }
  if (type === 'matching') {
    return { type, pairs: requirePairs(raw.pairs) };
  }
  if (type === 'ordering') {
    return { type, items: requireItems(raw.items) };
  }
  return {
    type: 'numerical',
    correctValue: requireNumber(raw.correctValue, 'Nilai numerik sub-soal'),
    tolerance: Math.max(0, Number(raw.tolerance) || 0)
  };
}

/**
 * Membangun daftar sub-soal studi kasus. Boleh kosong (`[]`) — studi kasus
 * tanpa sub-soal tetap sah dan dinilai otomatis penuh oleh `grading.js`.
 */
export function normalizeSubQuestions(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error('Daftar sub-soal harus berupa daftar.');
  if (input.length > MAX_SUB_QUESTIONS) {
    throw new Error(`Studi kasus maksimal ${MAX_SUB_QUESTIONS} sub-soal.`);
  }
  return input.map(normalizeSubQuestion);
}

/**
 * Membangun field khusus tipe soal (dikembalikan apa adanya ke dokumen).
 * Mengembalikan objek yang di-`Object.assign` ke dokumen soal, sehingga
 * bentuk dokumen tidak berubah sama sekali.
 */
export function buildTypeFields(type, data = {}) {
  if (type === 'single') {
    const options = requireOptions(data.options, 'Pilihan ganda');
    return { options, answerIndex: requireAnswerIndex(data.answerIndex, options) };
  }
  if (type === 'multiple') {
    const options = requireOptions(data.options, 'Pilihan ganda kompleks');
    return { options, correctIndices: requireCorrectIndices(data.correctIndices, options) };
  }
  if (type === 'boolean') {
    return { correctBoolean: Boolean(data.correctBoolean) };
  }
  if (type === 'short_answer') {
    return { acceptedAnswers: requireAcceptedAnswers(data.acceptedAnswers) };
  }
  if (type === 'essay') {
    // Manual grading: `grading.js` menandai isManual, tidak ada auto-grading.
    return { sampleAnswer: String(data.sampleAnswer || '').trim().slice(0, 5000) };
  }
  if (type === 'matching') {
    return { pairs: requirePairs(data.pairs) };
  }
  if (type === 'ordering') {
    return { items: requireItems(data.items) };
  }
  if (type === 'numerical') {
    return {
      correctValue: requireNumber(data.correctValue, 'Nilai numerik benar'),
      tolerance: Math.max(0, Number(data.tolerance) || 0)
    };
  }
  if (type === 'code') {
    // Tanpa eksekusi kode: hanya teks, dinilai manual.
    return {
      starterCode: String(data.starterCode || ''),
      expectedOutput: String(data.expectedOutput || ''),
      sampleSolution: String(data.sampleSolution || '')
    };
  }
  if (type === 'case_study') {
    const caseText = String(data.caseText || '').trim();
    if (!caseText) throw new Error('Teks kasus studi tidak boleh kosong.');
    return { caseText, subQuestions: normalizeSubQuestions(data.subQuestions) };
  }
  throw new Error('Tipe soal tidak dikenal.');
}

function requireNumber(raw, label) {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label} harus berupa angka.`);
  return value;
}
