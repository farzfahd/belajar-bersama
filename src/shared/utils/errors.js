// Pesan error ramah berbahasa Indonesia.
// Prinsip Auth: pesan generik, jangan bocorkan apakah email terdaftar.
const MAP = {
  // ---- Auth ----
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/user-not-found': 'Email atau kata sandi salah.',
  'auth/wrong-password': 'Email atau kata sandi salah.',
  'auth/invalid-credential': 'Email atau kata sandi salah.',
  'auth/invalid-login-credentials': 'Email atau kata sandi salah.',
  'auth/user-disabled': 'Akun ini dinonaktifkan.',
  'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba masuk saja.',
  'auth/weak-password': 'Kata sandi terlalu lemah. Minimal 10 karakter.',
  'auth/missing-password': 'Kata sandi wajib diisi.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  'auth/network-request-failed': 'Tidak ada koneksi internet. Cek jaringan lalu coba lagi.',
  'auth/popup-blocked': 'Pop-up login diblokir. Izinkan pop-up untuk situs ini lalu coba lagi.',
  'auth/popup-closed-by-user': 'Login dibatalkan.',
  'auth/cancelled-popup-request': 'Login dibatalkan.',
  'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase Authentication. Lihat panduan penyiapan.',
  'auth/operation-not-allowed': 'Provider login ini belum diaktifkan di Firebase Console.',
  'auth/requires-recent-login': 'Perlu login ulang untuk aksi sensitif. Masuk lagi lalu coba.',
  'auth/insufficient-permission': 'Akses ditolak oleh Firebase.',
  'auth/quota-exceeded': 'Kuota sementara Auth habis. Tunggu beberapa saat.',

  // ---- Firestore ----
  'permission-denied': 'Akses ditolak. Data ini bukan untuk Anda, atau Anda belum terverifikasi.',
  unauthenticated: 'Anda belum login.',
  unavailable: 'Tidak dapat terhubung ke server. Cek internet lalu coba lagi.',
  'not-found': 'Data tidak ditemukan.',
  'already-exists': 'Data sudah ada.',
  'invalid-argument': 'Isian tidak valid. Periksa kembali.',
  'failed-precondition': 'Operasi gagal karena kondisi tidak terpenuhi.',
  aborted: 'Operasi dibatalkan. Coba lagi.',
  'resource-exhausted': 'Kuota layanan habis sementara. Tunggu lalu coba lagi.',
  'deadline-exceeded': 'Waktu koneksi habis. Coba lagi.',

  // ---- Umum ----
  'auth/timeout': 'Koneksi timeout. Coba lagi.',
  'app-check/not-enabled': 'Verifikasi aplikasi (App Check) belum aktif.'
};

// Kode "terjebak" yang kita buat sendiri (mis. validasi UX) ikut lewat message.
export function toErrorMessage(err, fallback = 'Terjadi kesalahan. Coba lagi.') {
  if (!err) return fallback;
  const mapped = err.code && MAP[err.code];
  if (mapped) return mapped;
  if (err.message && typeof err.message === 'string' && err.message.trim()) return err.message;
  return fallback;
}