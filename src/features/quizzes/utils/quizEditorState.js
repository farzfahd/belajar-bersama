// Penentuan state QuizEditorPage, diekstrak sebagai fungsi murni supaya
// bisa diuji tanpa React Testing Library (proyek ini tidak punya jsdom).
//
// Alur yang harus dijaga: "Buat Quiz → editor". Karena editor adalah bagian
// wajib dari alur itu, gagal membuka editor = ERROR KRITIS, bukan warning:
// editor kosong yang tampil seolah-olah berhasil adalah kegagalan uji.

export const EDITOR_STATE = {
  loading: 'loading',
  ready: 'ready',
  notFound: 'notFound',
  permission: 'permission',
  error: 'error'
};

// Kode yang berarti "server menolak akses". Termasuk App Check: token yang
// belum/enforcement ditolak muncul sebagai unauthenticated / permission-denied.
const PERMISSION_CODES = new Set([
  'permission-denied',
  'unauthenticated',
  'insufficient-permission',
  'app-check/not-enabled',
  'app-check/not-allowed',
  'auth/invalid-appcheck-token'
]);

/** `quizId` dari hasil create/route harus berupa id dokumen yang benar-benar dipakai. */
export function isValidQuizId(quizId) {
  return typeof quizId === 'string' && quizId.trim().length > 0 && !quizId.includes('/');
}

/**
 * Navigasi ke editor HANYA boleh terjadi kalau create benar-benar mengembalikan
 * id dokumen yang valid. Dipakai QuizListPage supaya kegagalan create tidak
 * pernah berubah jadi navigasi ke `/quiz/undefined`.
 */
export function shouldNavigateAfterCreate(quizId) {
  return isValidQuizId(quizId);
}

/** Membedakan "akses ditolak" dari "gangguan teknis" agar pesannya tepat. */
export function isPermissionError(errorCode) {
  if (typeof errorCode !== 'string' || !errorCode) return false;
  return PERMISSION_CODES.has(errorCode);
}

/**
 * Menentukan state halaman editor dari hasil useQuiz.
 * Urutan cek penting: loading → error → dokumen hilang → siap.
 *
 * @param {{loading:boolean, error?:any, errorCode?:string, quiz?:any}} input
 * @returns {EditorState} salah satu EDITOR_STATE
 */
export function resolveQuizEditorState({ loading, error, errorCode, quiz } = {}) {
  if (loading) return EDITOR_STATE.loading;
  if (error) return isPermissionError(errorCode) ? EDITOR_STATE.permission : EDITOR_STATE.error;
  if (!quiz) return EDITOR_STATE.notFound;
  return EDITOR_STATE.ready;
}

/**
 * Teks dasar per state. `editorFailureMessage` menambahkan peringatan
 * "jangan buat kuis kedua" sesuai asal user.
 */
export const EDITOR_MESSAGES = {
  [EDITOR_STATE.notFound]: {
    title: 'Kuis Tidak Ditemukan',
    description:
      'Kuis ini tidak ada di ruang ini, sudah dihapus, atau tautannya salah. Daftar kuis tetap bisa dibuka.'
  },
  [EDITOR_STATE.permission]: {
    title: 'Akses Ditolak',
    description:
      'Kuis mungkin sudah berhasil dibuat, tetapi akun ini tidak punya izin untuk membacanya — atau verifikasi aplikasi (App Check) sedang menolak permintaan. Kuis TIDAK perlu dibuat ulang.'
  },
  [EDITOR_STATE.error]: {
    title: 'Gagal Membuka Editor Kuis',
    description:
      'Kuis mungkin sudah berhasil dibuat, tetapi datanya belum bisa dibaca. Coba lagi; kalau masih gagal, buka dari daftar kuis.'
  }
};

/**
 * Menyusun pesan kegagalan akhir, dengan peringatan yang tepat menurut asal user.
 *
 * `justCreated` = user baru saja menekan "Buat Quiz". Kuis bisa saja sudah
 * tersimpan, jadi pesannya harus "jangan buat kuis kedua". Tanpa flag itu
 * pesannya berbeda: kuis sudah lama ada, cukup ulangi membuka editor.
 *
 * State `notFound` memakai teks apa adanya — tidak ada yang perlu dijelaskan
 * soal pembuatan di sana, dan menyebut "sudah tersimpan" hanya membingungkan.
 */
export function editorFailureMessage(state, { justCreated = false } = {}) {
  const base = EDITOR_MESSAGES[state] || EDITOR_MESSAGES[EDITOR_STATE.error];
  if (state === EDITOR_STATE.notFound) return { ...base };

  const hint = justCreated
    ? 'Kuis ini mungkin sudah berhasil dibuat, jadi jangan membuat kuis kedua — ulangi membuka editor lewat "Coba lagi" atau cek daftar kuis.'
    : 'Kuis ini sudah tersimpan sebelumnya, jadi cukup ulangi membuka editor lewat "Coba lagi" tanpa membuat kuis baru.';
  return { ...base, description: `${base.description} ${hint}` };
}

/**
 * State mana yang layak menawarkan tombol "Coba lagi".
 * `notFound` TIDAK: dokumen memang tidak ada di sana, mencoba lagi hanya
 * membuat user mengira ada bug.
 */
export function canRetryEditor(state) {
  return state === EDITOR_STATE.error || state === EDITOR_STATE.permission;
}

/** Judul yang jujur saat create sukses tapi id tidak dikembalikan. */
export const CREATE_WITHOUT_ID_MESSAGE =
  'Kuis dibuat, tetapi aplikasi tidak menerima id-nya. Buka dari daftar kuis — jangan buat kuis kedua.';