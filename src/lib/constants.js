export const SCHEMA_VERSION = 1;

// Versi skema dokumen attempt (`quizzes/{quizId}/attempts/{attemptId}`).
//
// SENGAJA dipisah dari `SCHEMA_VERSION` dan naik ke 2: pada versi 1,
// `questionSnapshot` hanya berisi array ID soal, sehingga attempt TIDAK
// pernah freezes isi soal — soalnya masih dibaca live dari Question Bank.
// Versi 2 = `questionSnapshot` memuat ISI LENGKAP tiap soal (prompt, opsi,
// kunci jawaban, poin, penjelasan) yang disalin saat attempt dimulai.
// Nol attempt versi 1 pernah ada di emulator saat skema ini diubah, jadi tidak
// ada jalur kompatibilitas yang perlu dipertahankan.
export const ATTEMPT_SCHEMA_VERSION = 2;

export const ROOT = {
  users: 'users',
  spaces: 'spaces',
  invites: 'invites'
};

export const COL = {
  topics: 'topics',
  notes: 'notes',
  noteStates: 'noteStates',
  resources: 'resources',
  resourceStates: 'resourceStates',
  noteReports: 'noteReports',
  questions: 'questions',
  // Report soal disimpan sebagai SUBCOLLEKSI dari soal, jadi nilai ini adalah
  // segmen path di bawah `questions/{questionId}` - bukan koleksi di root
  // space. Alasannya ada di firestore.rules (owner bisa `onSnapshot` polos atas
  // subkoleksi ini karena dokumen induknya ada di path).
  questionReports: 'reports',
  quizzes: 'quizzes',
  // Subkoleksi nested di bawah quizzes/{quizId} (CP2). BERBEDA dari
  // `quizAttempts` legacy (lihat catatan ROADMAP/ONBOARDING) yang tidak lagi
  // dipakai dan tidak disentuh oleh CP2.
  attempts: 'attempts'
};

export const QUESTION_TYPES = {
  single: 'single',
  multiple: 'multiple',
  boolean: 'boolean',
  short_answer: 'short_answer',
  essay: 'essay',
  matching: 'matching',
  ordering: 'ordering',
  numerical: 'numerical',
  code: 'code',
  case_study: 'case_study'
};

export const QUESTION_TYPE_LABELS = {
  single: 'Pilihan Ganda',
  multiple: 'Pilihan Ganda Kompleks',
  boolean: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Uraian / Esai',
  matching: 'Menjodohkan',
  ordering: 'Mengurutkan',
  numerical: 'Numerik',
  code: 'Soal Kode',
  case_study: 'Studi Kasus'
};

export const QUESTION_LIMITS = {
  minOptions: 2,
  maxOptions: 20
};

// Jenis report soal. Nilainya divalidasi ulang oleh Firestore Rules pada
// `spaces/{spaceId}/questions/{questionId}/reports` - ubah di sini DAN di
// rules bila perlu. `QUESTION_REPORT_TYPES.test.mjs` membandingkan keduanya
// supaya tidak bisa menyimpang diam-diam.
export const QUESTION_REPORT_TYPES = {
  wrong_answer: 'wrong_answer',
  typo: 'typo',
  ambiguous: 'ambiguous',
  duplicate: 'duplicate',
  other: 'other'
};

export const QUESTION_REPORT_TYPE_LABELS = {
  wrong_answer: 'Kunci Jawaban Salah',
  typo: 'Ada Salah Ketik',
  ambiguous: 'Soal Ambigu',
  duplicate: 'Soal Duplikat',
  other: 'Lainnya'
};

export const QUESTION_REPORT_LIMITS = {
  maxMessage: 2000
};

// Batas & enum kuis (CP1 foundation). Nilai-nilai ini disalin apa adanya ke
// `settings` pada dokumen quizzes, dan divalidasi ulang oleh Firestore Rules
// (lihat validQuizSettings) — ubah di sini DAN di rules bila perlu.
//
// CATATAN CP2: `questionCount` DIHAPUS. Jumlah soal kuis = panjang
// `questionIds` (dan `questionSnapshot` pada attempt). Sebelumnya ada field
// `questionCount` yang rentangnya saja divalidasi (1–50) tanpa relasi ke
// `questionIds.length`, sehingga kuis bisa menyimpan 3 soal tapi
// `questionCount: 10` — dua sumber kebenaran yang bisa menyimpang.
export const QUIZ_LIMITS = {
  // 0: kuis boleh dibuat sebagai draft tanpa soal (flow "Buat Quiz → langsung
  // masuk editor", lalu soal ditambahkan dari editor). Jumlah soal tetap
  // `questionIds.length` — tidak ada field jumlah soal terpisah.
  minQuestions: 0,
  maxQuestions: 50,
  maxTitle: 200,
  maxDescription: 2000,
  maxTimeLimitMinutes: 480,
  maxAttempts: 20
};

export const QUIZ_SETTINGS_DEFAULTS = {
  randomizeQuestionOrder: false,
  randomizeOptionOrder: false,
  timeLimitMinutes: 0,
  passingScorePercent: 70,
  maxAttempts: 3,
  showAnswerMode: 'after_all',
  showExplanation: true,
  allowRetry: true
};

export const STATUS = {
  topic: ['not_started', 'learning', 'completed'],
  difficulty: ['beginner', 'intermediate', 'advanced'],
  note: ['draft', 'shared', 'reviewed', 'needs_revision', 'completed'],
  visibility: ['private', 'shared'],
  resource: [
    'website', 'youtube', 'book', 'pdf', 'paper', 'course',
    'documentation', 'dataset', 'repository', 'video', 'image', 'file'
  ],
  resourceState: ['not_started', 'reading', 'completed']
};

export const STATUS_LABEL = {
  not_started: 'Belum mulai',
  learning: 'Sedang belajar',
  completed: 'Selesai',
  draft: 'Draf',
  shared: 'Dibagikan',
  reviewed: 'Direview',
  needs_revision: 'Perlu revisi',
  reading: 'Sedang dibaca',
  beginner: 'Pemula',
  intermediate: 'Menengah',
  advanced: 'Lanjutan',
  private: 'Private',
  website: 'Website',
  youtube: 'YouTube',
  book: 'Buku',
  pdf: 'PDF',
  paper: 'Paper',
  course: 'Kursus',
  documentation: 'Dokumentasi',
  dataset: 'Dataset',
  repository: 'Repository',
  video: 'Video',
  image: 'Gambar',
  file: 'File'
};

export const IDENTITY = {
  // Palet identitas: pilihan warna milik USER (avatar & warna topik),
  // BUKAN token sistem. Sengaja tidak disatukan dengan skema indigo.
  // Dipakai lewat Avatar.jsx (backgroundColor) dan kartu topik.
  colors: ['#e0704f', '#93b074', '#d9a441', '#a58a72', '#b48bb0', '#7aa89a', '#c08a6a', '#91a3c4'],
  defaultColor: '#e0704f'
};

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITE_CODE_BYTES = 18; // 18 byte -> 24 karakter base64url (>= 20)

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Label level pohon roadmap.
export const LEVEL_LABEL = { 0: 'Subject', 1: 'Topic', 2: 'Subtopic' };
