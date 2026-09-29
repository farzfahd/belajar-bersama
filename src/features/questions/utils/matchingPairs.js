// Logika murni untuk soal "menjodohkan" (matching). Dipisah dari React supaya
// bisa diuji tanpa DOM (proyek ini tidak pakai jsdom) dan dipakai oleh dua
// tempat sekaligus: builder soal dan attempts.
//
// MODEL DATA (penting)
// ---------------------
// Skema soal TIDAK diubah: `pairs: [{ left, right }]`. Yang berubah hanya cara
// user menyusunnya. Di dalam state editor kita menyimpan:
//
//   lefts    : teks item kiri, urut
//   rights   : teks item kanan, urut
//   assigned : assigned[i] = indeks `rights` yang disambung ke `lefts[i]`
//
// Dengan model ini aturan "satu-ke-satu" (satu item kanan hanya boleh dipakai
// satu kali) tidak bisa dilanggar: setiap indeks kanan hanya ada di satu
// assigned. Menyambung ulang pasangan otomatis melepas item kanan dari
// pemiliknya yang lama, jadi "unmatch & rematch" aman tanpa dropdown.
//
// Kolom `right` adalah KUNCI jawaban. Karena itu di mode attempt kolom kanan
// selalu diacak (dengan seed stabil) supaya tidak terlihat berpasangan dengan
// kolom kiri, dan tidak pernah ada penanda pasangan benar saat menjawab.
//
// PERSISTENSI EDITOR (`pairs` vs `pairDraft`)
// -----------------------------------------
// Dua field terpisah dengan dua tanggung jawab berbeda:
//
//   pairs      : ANSWER KEY. Hanya pasangan yang lengkap & tersambung. Satu-
//                satu-satunya sumber kebenaran untuk attempt & `grading.js`,
//                dan bentuknya TIDAK berubah sama sekali sejak awal.
//
//   pairDraft  : DRAFT EDITOR. Bentuknya persis state di atas -
//                `{ lefts, rights, assigned }` - sehingga baris yang belum
//                dipasangkan (dan teksnya) tetap bisa disimpan lalu dipulihkan
//                saatautosave, reload, atau reopen.
//
// Kenapa tidak cukup dengan `pairs` saja: `serializePairs` memang membuang baris
// yang belum tersambung, tapi baris itu tidak hilang dari state editor. Kalau
// hanya `pairs` yang disimpan, "Lepas pasangan" akan terlihat seperti "Hapus
// baris" setelah reload - bug yang membuat draft hilang diam-diam.
//
// Keamanan: `pairDraft.assigned` bisa membocorkan pasangan benar, jadi field ini
// HANYA untuk builder. `attemptEngine.js` tidak pernah menyalinnya ke snapshot
// peserta (lihat `SNAPSHOT_TYPE_FIELDS` + `EDITOR_ONLY_FIELDS` di sana).

export const MATCHING_MIN_PAIRS = 2;

/** Hash teks menjadi seed angka, supaya urutan acakan tetap sama di render ulang. */
export function seedFromText(text) {
  const s = String(text ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Teks pertama yang muncul lebih dari sekali, atau `null` kalau semua unik.
 *
 * Dipakai dua tempat sekaligus supaya aturan "teks kiri & kanan harus unik"
 * hanya ada di satu definisi: validasi sebelum menyimpan
 * (`questionTypeFields.requirePairs`) dan peringatan langsung di editor
 * (`MatchingEditor`).
 *
 * Teks kosong DILEWATI: baris kosong di editor adalah tempat mengetik baru,
 * bukan pasangan yang kembar, jadi tidak boleh dilaporkan sebagai duplikat.
 * Perbandingan memakai teks yang sudah di-trim supaya "A" dan "A " dianggap
 * sama.
 */
export function findDuplicateText(values) {
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const text = textOf(raw).trim();
    if (!text) continue;
    if (seen.has(text)) return text;
    seen.add(text);
  }
  return null;
}

/** Fisher-Yates dengan seed: hasil sama untuk input sama, bukan random murni. */
export function shuffleWithSeed(items, seed) {
  const out = Array.isArray(items) ? items.slice() : [];
  let state = (Number(seed) || 0) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    // xorshift32: cukup untuk mengacak urutan tampilan.
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    const j = state % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function textOf(value) {
  return String(value ?? '');
}

function cleanPairs(pairs) {
  return (Array.isArray(pairs) ? pairs : [])
    .map((p) => ({ left: textOf(p?.left).trim(), right: textOf(p?.right).trim() }))
    .filter((p) => p.left && p.right);
}

/**
 * State awal untuk builder. `pairs` yang tersimpan sudah berpasangan, jadi
 * kedua kolom bisa dipakai langsung. Dua row kosong tetap disiapkan supaya
 * ada tempat mengetik pasangan baru tanpa harus menekan tombol tambah dulu.
 */
export function createMatchingState(pairs = []) {
  const clean = cleanPairs(pairs);
  const lefts = clean.length ? clean.map((p) => p.left) : ['', ''];
  const rights = clean.length ? clean.map((p) => p.right) : ['', ''];
  const assigned = clean.length ? clean.map((_, i) => i) : [null, null];
  return { lefts, rights, assigned };
}

/**
 * Bangun state editor dari `pairDraft` yang tersimpan.
 *
 * Mengembalikan `null` kalau draft tidak ada atau strukturnya rusak, supaya
 * pemanggil bisa jatuh ke `pairs` (soal lama yang belum punya `pairDraft`).
 * Draft rusak lebih baik diabaikan daripada dipakai: state editor yang salah
 * akan menampilkan baris/sambungan yang tidak pernah disimpan user.
 *
 * Yang dijaga di sini:
 *   - `lefts`, `rights`, `assigned` panjangnya sama dan tidak kosong
 *   - `assigned` hanya berisi indeks `rights` yang valid atau `null`
 *   - satu item kanan hanya dimiliki satu baris (satu-ke-satu)
 */
export function createMatchingStateFromDraft(pairDraft) {
  if (!pairDraft || typeof pairDraft !== 'object') return null;
  const { lefts, rights, assigned } = pairDraft;
  if (!Array.isArray(lefts) || !Array.isArray(rights) || !Array.isArray(assigned)) return null;
  if (!lefts.length) return null;
  if (lefts.length !== rights.length || lefts.length !== assigned.length) return null;

  const claimed = new Set();
  const cleanAssigned = assigned.map((value) => {
    const index = typeof value === 'number' && Number.isInteger(value) ? value : null;
    if (index === null || index < 0 || index >= rights.length) return null;
    // Dua baris yang menunjuk indeks kanan sama berarti draft rusak. Baris
    // pertama yang tetap menang; sisanya dilepas supaya satu item kanan tidak
    // pernah tampil terpakai dua kali.
    if (claimed.has(index)) return null;
    claimed.add(index);
    return index;
  });

  // Teks dibiarkan apa adanya (tidak di-trim) supaya baris yang belum
  // dipasangkan pulih persis seperti terakhir diketik.
  return { lefts: lefts.map(textOf), rights: rights.map(textOf), assigned: cleanAssigned };
}

/**
 * State editor siap pakai: pakai `pairDraft` kalau ada & valid, kalau tidak
 * kembali ke answer key `pairs`. Inilah urutan pembacaan yang dipakai kartu
 * inline maupun modal bank soal, jadi keduanya tidak bisa berbeda.
 */
export function matchingStateForEditor(pairDraft, pairs) {
  return createMatchingStateFromDraft(pairDraft) || createMatchingState(pairs);
}

/** Apakah `pairDraft` punya struktur yang bisa dipakai untuk menyusun state editor. */
export function isValidPairDraft(pairDraft) {
  return createMatchingStateFromDraft(pairDraft) !== null;
}

/**
 * State awal untuk attempt. Kolom kiri = item soal, kolom kanan = versi
 * diacak dari pasangan (kunci). Jawaban peserta dibaca balik dari peta
 * `{ left: right }` supaya bentuk jawaban tidak berubah sama sekali.
 */
export function matchingStateFromAnswer(pairs, answer, seed) {
  const clean = cleanPairs(pairs);
  return matchingStateFromAnswerPools(
    clean.map((p) => p.left),
    clean.map((p) => p.right),
    answer,
    seed
  );
}

/**
 * State awal dari DUA KOLAM KANDIDAT, bukan dari pasangan.
 *
 * Dipakai untuk entri snapshot attempt v3, yang tidak memuat `pairs` sama sekali
 * (pasangan itulah kuncinya). Snapshot hanya membawa `matchLeft` dan
 * `matchRight`, jadi bentuk kuncinya harus dibangun ulang dari kolam: kolom kiri
 * berurutan, kolom kanan diacak dengan seed yang sama seperti v2.
 *
 * Perilakunya harus identik dengan `matchingStateFromAnswer` untuk pasangan yang
 * sama, supaya attempt lama dan baru tidak terasa berbeda oleh peserta.
 */
export function matchingStateFromAnswerPools(lefts, rights, answer, seed) {
  const cleanLefts = (Array.isArray(lefts) ? lefts : [])
    .map((v) => textOf(v).trim())
    .filter(Boolean);
  const cleanRights = (Array.isArray(rights) ? rights : [])
    .map((v) => textOf(v).trim())
    .filter(Boolean);
  const rightValues = shuffleWithSeed(cleanRights, seedFromText(seed));
  const assigned = cleanLefts.map((left) => {
    const chosen = textOf(answer?.[left]).trim();
    if (!chosen) return null;
    const idx = rightValues.indexOf(chosen);
    return idx === -1 ? null : idx;
  });
  return { lefts: cleanLefts, rights: rightValues, assigned };
}

/**
 * Apakah dokumen soal masih memuat pasangan sebagai kunci jawaban.
 *
 * Entri v3 menjawab `false`: isinya cuma kolam kandidat, jadi tidak ada yang
 * boleh ditampilkan sebagai "benar" di mode review. Tanpa pemeriksaan ini, mode
 * review akan menandai SETIAP baris "Belum tepat" — itu menuduh peserta salah
 * atas kunci yang memang tidak ada di layar.
 */
export function hasMatchingKey(pairs) {
  return (Array.isArray(pairs) ? pairs : []).filter((p) => p?.left && p?.right).length > 0;
}

function withAssigned(state, assigned) {
  return { lefts: state.lefts.slice(), rights: state.rights.slice(), assigned };
}

/** Indeks `rights` yang sedang disambung ke `leftIndex` (atau -1). */
export function assignedRightIndex(state, leftIndex) {
  const value = state.assigned[leftIndex];
  return typeof value === 'number' && state.rights[value] ? value : -1;
}

/** Left yang sedang memakai `rightIndex` (atau -1). */
export function leftIndexUsingRight(state, rightIndex) {
  return state.assigned.findIndex((value) => value === rightIndex);
}

/**
 * Sambungkan `leftIndex` ke `rightIndex`.
 * - Kalau item kanan sudah dipakai left lain, left itu dilepas (satu-ke-satu).
 * - Kalau left ini sudah tersambung ke kanan lain, sambungan lamanya dilepas.
 * Tidak mengubah `lefts`/`rights`, jadi teks yang diketik tidak pernah hilang.
 */
export function assignPair(state, leftIndex, rightIndex) {
  if (!(leftIndex >= 0 && leftIndex < state.lefts.length)) return state;
  if (!(rightIndex >= 0 && rightIndex < state.rights.length)) return state;
  if (!state.lefts[leftIndex] || !state.rights[rightIndex]) return state;
  const assigned = state.assigned.slice();
  // Satu item kanan hanya boleh dimiliki satu kiri: lepas dulu pemiliknya.
  const previousOwner = assigned.findIndex((value, i) => i !== leftIndex && value === rightIndex);
  if (previousOwner !== -1) assigned[previousOwner] = null;
  assigned[leftIndex] = rightIndex;
  return withAssigned(state, assigned);
}

/** Lepas pasangan; teks item tetap ada, hanya sambungan yang dilepas. */
export function unassignPair(state, leftIndex) {
  if (!(leftIndex >= 0 && leftIndex < state.assigned.length)) return state;
  const assigned = state.assigned.slice();
  assigned[leftIndex] = null;
  return withAssigned(state, assigned);
}

export function setLeftText(state, leftIndex, text) {
  if (!(leftIndex >= 0 && leftIndex < state.lefts.length)) return state;
  const lefts = state.lefts.slice();
  lefts[leftIndex] = textOf(text);
  return { lefts, rights: state.rights, assigned: state.assigned };
}

export function setRightText(state, rightIndex, text) {
  if (!(rightIndex >= 0 && rightIndex < state.rights.length)) return state;
  const rights = state.rights.slice();
  rights[rightIndex] = textOf(text);
  return { lefts: state.lefts, rights, assigned: state.assigned };
}

/** Tambah satu baris kosong di kedua kolom + satu sambungan kosong. */
export function addSlot(state) {
  return {
    lefts: [...state.lefts, ''],
    rights: [...state.rights, ''],
    assigned: [...state.assigned, null]
  };
}

/**
 * Hapus satu baris. Kolom kanan baris itu ikut terhapus dan indeks bergeser,
 * jadi semua sambungan yang menunjuk indeks di belakang ikut turun.
 */
export function removeSlot(state, index) {
  if (index < 0 || index >= state.lefts.length) return state;
  const lefts = state.lefts.filter((_, i) => i !== index);
  const rights = state.rights.filter((_, i) => i !== index);
  const assigned = state.assigned
    .filter((_, i) => i !== index)
    .map((value) => (typeof value === 'number' && value > index ? value - 1 : value));
  return { lefts, rights, assigned };
}

/**
 * Bentuk yang disimpan ke dokumen sebagai ANSWER KEY: hanya pasangan yang
 * benar-benar tersambung dan kedua teksnya terisi. Pasangan setengah tidak
 * pernah ikut tersimpan, karena `grading.js` menghitung `pairs.every(...)` -
 * satu `right: ''` akan membuat soal tidak mungkin dianggap benar.
 *
 * Row yang belum dipasangkan TIDAK hilang: row itu tetap ada di `pairDraft`
 * (lihat `serializePairDraft`), yang menyimpan teks dan posisi barisnya.
 */
export function serializePairs(state) {
  return state.lefts
    .map((left, i) => ({ left: left.trim(), right: textOf(state.rights[assignedRightIndex(state, i)]).trim() }))
    .filter((p) => p.left && p.right);
}

/**
 * Bentuk yang disimpan ke dokumen sebagai DRAFT EDITOR: seluruh baris ikut,
 * termasuk yang belum dipasangkan (`assigned[i] === null`).
 *
 * Round-trip `createMatchingStateFromDraft(serializePairDraft(state))`
 * menghasilkan state yang sama, jadi "Lepas pasangan" bertahan melewati
 * autosave, reload, dan reopen.
 */
export function serializePairDraft(state) {
  return {
    lefts: state.lefts.map(textOf),
    rights: state.rights.map(textOf),
    assigned: state.assigned.map((value) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < state.rights.length
        ? value
        : null
    )
  };
}

/** Peta jawaban attempts `{ left: right }` - bentuk yang sudah dipakai grading. */
export function answerFromState(state) {
  const answer = {};
  state.lefts.forEach((left, i) => {
    const right = textOf(state.rights[assignedRightIndex(state, i)]).trim();
    if (left.trim() && right) answer[left] = right;
  });
  return answer;
}

/**
 * Status kelengkapan untuk builder dan attempt.
 * `connected` = pasangan yang benar-benar tersambung.
 * `filled`    = baris yang sudah punya teks di salah satu kolom.
 */
export function matchingCompletion(state) {
  const total = state.lefts.length;
  let connected = 0;
  let filled = 0;
  state.lefts.forEach((left, i) => {
    const rightIndex = assignedRightIndex(state, i);
    const right = rightIndex === -1 ? '' : textOf(state.rights[rightIndex]).trim();
    if (left.trim() && right) connected += 1;
    if (left.trim() || right) filled += 1;
  });
  return { total, connected, filled, complete: connected >= MATCHING_MIN_PAIRS };
}
