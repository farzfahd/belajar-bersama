// Logika MURNI untuk revisi kunci jawaban (Assessment Security M5).
//
// Dipisah dari `questionKeyService` karena file service mengimpor Firebase
// (path tanpa ekstensi), yang tidak bisa di-load `node --test` secara langsung.
// Semua aturan di sini murni dan bisa diuji tanpa emulator.
//
// Aturan yang dijaga (PART 24):
//   1. Nomor revisi naik satu per perubahan kunci.
//   2. Revisi yang sudah ada tidak boleh ditimpa dengan isi BERBEDA.
//   3. Attempt lama selalu menunjuk revisi yang dibuat saat attempt dimulai.

/**
 * Nomor revisi berikutnya, sebagai string.
 *
 * @param {number|string|null|undefined} currentNumber
 * @returns {string} mis. "2"
 */
export function nextKeyRevisionFrom(currentNumber) {
  const n = Number(currentNumber);
  const base = Number.isInteger(n) && n > 0 ? n : 0;
  return String(base + 1);
}

/** Versi numerik dari nomor revisi, aman untuk perbandingan. */
export function keyRevisionNumber(revision) {
  const n = Number(revision);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Urutkan key objek supaya perbandingan JSON stabil. */
function sortKeys(obj) {
  return Object.keys(obj || {}).sort().reduce((acc, k) => {
    acc[k] = obj[k];
    return acc;
  }, {});
}

/** Buang field non-deterministik sebelum perbandingan isi kunci. */
function stripVolatile({ createdAt, updatedAt, ...rest } = {}) {
  return rest;
}

/**
 * Tolak penimpaan revisi lama dengan isi berbeda (immutability).
 *
 * Isi yang SAMA tetap diperbolehkan supaya migrasi bisa dijalankan berulang
 * (idempoten). `createdAt`/`updatedAt` dikecualikan: keduanya bertimestamp dan
 * tidak menentukan apakah dua kunci dianggap sama.
 *
 * @throws {Error} bila revisi ada dan isinya berbeda.
 */
export function assertKeyRevisionNotOverwritten(existingKeyDoc, nextKeyDoc) {
  if (!existingKeyDoc) return;
  const same =
    JSON.stringify(sortKeys(stripVolatile(existingKeyDoc))) ===
    JSON.stringify(sortKeys(stripVolatile(nextKeyDoc)));
  if (!same) {
    throw new Error(
      'Revisi kunci sudah ada dan isinya berbeda. Buat revisi baru alih-alih menimpa revisi lama.'
    );
  }
}

/**
 * Apakah dua dokumen kunci dianggap identik (dipakai migrasi untuk
 * `alreadyMigrated` vs `migrated`).
 */
export function keyDocsEqual(a, b) {
  try {
    assertKeyRevisionNotOverwritten(a, b);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kunci jawaban milik satu entri attempt harus menunjuk revisi yang ADA.
 * Fungsi ini tidak melakukan I/O; pemanggil yang memverifikasi ke Firestore.
 *
 * @returns {boolean} true bila nomor revisi attempt >= 1
 */
export function hasValidKeyRevisionNumber(attempt) {
  return keyRevisionNumber(attempt?.keyRevision) >= 1;
}

/**
 * Daftar `questionId` yang dipakai sebuah attempt (dari snapshot).
 * Dipakai saat menghitung berapa revisi kunci yang masih terpakai.
 */
export function attemptQuestionIds(attempt) {
  const snap = Array.isArray(attempt?.questionSnapshot) ? attempt.questionSnapshot : [];
  return snap.map((e) => e?.id).filter(Boolean);
}
