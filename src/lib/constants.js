export const SCHEMA_VERSION = 1;

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
  quizzes: 'quizzes'
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

// Batas & enum kuis (CP1 foundation). Nilai-nilai ini disalin apa adanya ke
// `settings` pada dokumen quizzes, dan divalidasi ulang oleh Firestore Rules
// (lihat validQuizSettings) — ubah di sini DAN di rules bila perlu.
export const QUIZ_LIMITS = {
  minQuestions: 1,
  maxQuestions: 50,
  maxTitle: 200,
  maxDescription: 2000,
  maxTimeLimitMinutes: 480,
  maxAttempts: 20
};

export const QUIZ_SETTINGS_DEFAULTS = {
  questionCount: 10,
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
  // Palet identitas "buku catatan": warna kalem, tetap terbaca di light & dark.
  colors: ['#e0704f', '#93b074', '#d9a441', '#a58a72', '#b48bb0', '#7aa89a', '#c08a6a', '#91a3c4'],
  defaultColor: '#e0704f'
};

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITE_CODE_BYTES = 18; // 18 byte -> 24 karakter base64url (>= 20)

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Label level pohon roadmap.
export const LEVEL_LABEL = { 0: 'Subject', 1: 'Topic', 2: 'Subtopic' };
