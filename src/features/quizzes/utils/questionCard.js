// Logika murni untuk kartu soal inline (CP2 redesign, gaya Google Forms).
//
// Dipisah dari komponen React supaya bisa diuji dengan `node --test` dan agar
// ada SATU sumber kebenaran untuk: bentuk draft kosong, kelengkapan soal, dan
// efek mengganti tipe. Validasi akhir tetap milik `questionTypeFields.js`
// (dipakai `buildTypeFields`) — modul ini tidak menduplikasi aturan itu.
// Ekstensi `.js` pada import WAJIB: modul ini diuji langsung oleh
// `node --test`, dan resolver ESM Node tidak menebak ekstensi (Vite menebak).
import {
  buildTypeFields,
  normalizeSubQuestions,
  OPTION_MIN,
  OPTION_MAX
} from '../../questions/utils/questionTypeFields.js';

// Field yang "dimiliki" tiap tipe. Dipakai untuk (a) mendeteksi apakah ada data
// lama yang akan hilang saat tipe diganti, dan (b) membersihkan sisa field
// tipe sebelumnya saat tipe berubah.
export const TYPE_FIELDS = {
  single: ['options', 'answerIndex'],
  multiple: ['options', 'correctIndices'],
  boolean: ['correctBoolean'],
  short_answer: ['acceptedAnswers'],
  essay: ['sampleAnswer'],
  // `pairDraft` ikut karena draft editor adalah bagian dari state yang disimpan:
  // perubahan teks atau "Lepas pasangan" sering TIDAK mengubah `pairs` (mis.
  // answer key-nya masih >= 2 pasangan), jadi tanpa `pairDraft` di sini
  // `questionPayloadKey` akan dianggap sama dan autosave diam-diam berhenti.
  matching: ['pairs', 'pairDraft'],
  ordering: ['items'],
  numerical: ['correctValue', 'tolerance'],
  code: ['starterCode', 'expectedOutput', 'sampleSolution'],
  case_study: ['caseText', 'subQuestions']
};

export const ALL_TYPE_FIELDS = [...new Set(Object.values(TYPE_FIELDS).flat())];

/**
 * Draft soal kosong untuk kartu baru. Default `single` (paling umum) dengan
 * dua opsi kosong — `buildTypeFields` akan menolaknya sampai diisi, sehingga
 * kartu tidak pernah ter-write ke Firestore dalam keadaan tidak valid.
 */
export function emptyQuestionDraft(topicId = '', type = 'single') {
  return {
    type,
    prompt: '',
    topicId,
    difficulty: 'beginner',
    visibility: 'shared',
    points: 10,
    timeLimitSeconds: 0,
    explanation: '',
    tags: [],
    options: ['', ''],
    answerIndex: 0,
    correctIndices: [0],
    correctBoolean: true,
    acceptedAnswers: [],
    sampleAnswer: '',
    pairs: [
      { left: '', right: '' },
      { left: '', right: '' }
    ],
    // Draft editor menjodohkan. `null` = belum pernah disusun/diubah, jadi
    // kartu akan menyusun state dari `pairs` saja (perilaku soal lama).
    pairDraft: null,
    items: ['', ''],
    correctValue: '',
    tolerance: 0,
    starterCode: '',
    expectedOutput: '',
    sampleSolution: '',
    caseText: '',
    subQuestions: []
  };
}

/**
 * Apakah draft sudah cukup lengkap untuk ditulis ke Firestore.
 * Mengembalikan `{ ok: true }` atau `{ ok: false, error: '...' }` dengan pesan
 * Bahasa Indonesia yang bisa langsung ditampilkan di kartu.
 *
 * Memakai `buildTypeFields` — JANGAN menduplikasi aturan validasi di sini.
 */
export function checkQuestionComplete(draft) {
  const prompt = String(draft?.prompt ?? '').trim();
  if (!prompt) return { ok: false, error: 'Tulis pertanyaan dulu.' };
  if (!String(draft?.topicId ?? '').trim()) {
    return { ok: false, error: 'Pilih topik untuk soal ini.' };
  }
  try {
    buildTypeFields(draft.type || 'single', draft);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Soal belum lengkap.' };
  }
}

/**
 * Apakah mengganti tipe akan membuang data yang sudah diisi user.
 * Dipakai untuk menampilkan konfirmasi sebelum field lama dibuang.
 */
export function hasDataForType(currentType, draft, nextType) {
  if (currentType === nextType) return false;
  return TYPE_FIELDS[currentType]?.some((key) => hasValue(draft?.[key])) ?? false;
}

// Nilai "berarti isi" — array kosong, string kosong, dan angka 0 dianggap
// KOSONG. Angka 0 sengaja diperlakukan kosong karena `answerIndex: 0` dan
// `correctIndices: [0]` adalah nilai default draft baru; kalau tidak, setiap
// kartu baru akan memunculkan konfirmasi "data akan hilang" saat tipenya
// diganti, padahal belum ada satu pun ketikan user.
function hasValue(value) {
  if (value == null) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.some(hasValue);
  }
  if (typeof value === 'object') return Object.values(value).some(hasValue);
  return String(value).trim() !== '';
}

/**
 * Mengganti tipe soal: field milik tipe LAMA dibuang, field tipe BARU
 * diinisialisasi ke default kosong. Field umum (prompt, topic, difficulty,
 * tags, points, dst.) TIDAK disentuh.
 */
export function applyTypeChange(draft, nextType) {
  const base = { ...draft, type: nextType };
  for (const key of ALL_TYPE_FIELDS) {
    if (!(key in (TYPE_FIELDS[nextType] || []))) delete base[key];
  }
  const defaults = emptyQuestionDraft(base.topicId, nextType);
  for (const key of TYPE_FIELDS[nextType] || []) {
    if (base[key] === undefined) base[key] = defaults[key];
  }
  return base;
}

/**
 * Kunci pembanding untuk dedupe autosave: dua draft dengan kunci sama tidak
 * perlu ditulis ulang. Hanya field yang benar-benar disimpan yang ikut.
 */
export function questionPayloadKey(draft) {
  if (!draft) return '';
  const common = {
    prompt: String(draft.prompt ?? '').trim(),
    topicId: draft.topicId ?? '',
    difficulty: draft.difficulty ?? '',
    visibility: draft.visibility ?? '',
    points: draft.points ?? 0,
    timeLimitSeconds: draft.timeLimitSeconds ?? 0,
    explanation: draft.explanation ?? '',
    tags: Array.isArray(draft.tags) ? [...draft.tags].sort() : []
  };
  const own = {};
  for (const key of TYPE_FIELDS[draft.type || 'single'] || []) {
    own[key] = draft[key] ?? null;
  }
  return JSON.stringify({ ...common, type: draft.type, ...own });
}

// Batas opsi disalin dari `questionTypeFields.js` (sumber tunggal) supaya kartu
// tidak mengarang batas sendiri.
export { normalizeSubQuestions, OPTION_MIN, OPTION_MAX };
