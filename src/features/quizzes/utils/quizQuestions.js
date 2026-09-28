// Utilitas murni untuk menyusun & memanipulasi snapshot soal pada kuis.
// TIDAK menyentuh Firestore & tidak mengurutkan ulang apa pun: urutan di sini
// SELALU persis urutan `quiz.questionIds` (Bagian E: jangan ambil ordering dari
// Question Bank). Semua fungsi mengembalikan array BARU dan tidak mengubah
// input, sehingga aman dipakai di React state.
//
// Keller soal (satu kartu = satu soal) adalah tempat urutan "baru masuk di
// belakang" ditegakkan: `buildEditorCards` hanya menaruh kartu yang belum punya
// id di belakang baris tersimpan, `cardKeyOf` menjaga identitas React kartu,
// dan `cardMoveBounds` menjaga tombol panah tetap hidup di batas daftar.

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
 * Apakah kartu baru (belum punya id permanen) masih perlu dirender.
 *
 * Begitu autosave pertama berhasil, kartu itu punya `realId`; ketika `realId`
 * sudah muncul di `questionIds` (barisnya sudah dirender sebagai soal
 * tersimpan), kartu baru disembunyikan supaya satu soal tidak tampil dua kali.
 * Entry-nya TIDAK langsung dihapus dari state: baris bisa tiba sebelum atau
 * sesudah state terupdate, dan menghapus terlalu cepat membuat kartu hilang
 * lalu muncul lagi. Aturan ini dipakai bersama oleh `buildEditorCards` dan
 * `moveDraftCard` supaya indeks yang digeser selalu entry yang benar-benar
 * terlihat.
 */
export function isDraftCardVisible(card, present) {
  return !(card?.realId && present.has(card.realId));
}

/**
 * Kartu yang dirender editor = baris soal tersimpan + kartu baru yang belum
 * punya id (menunggu autosave pertama).
 *
 * URUTAN: kartu baru SELALU di belakang, mengikuti `appendQuestionIds` yang juga
 * menaruh id baru di ujung `questionIds`. Kalau kartu baru diletakkan di depan,
 * posisinya melompat dari atas ke bawah tepat setelah create — dan kartu yang
 * sedang diisi kehilangan posisi di bawah mata. Di belakang, posisi sama sebelum
 * dan sesudah create.
 *
 * `position: null` menandai kartu yang belum ada di `questionIds` — dipakai
 * editor untuk tidak memetakan indeks kartu ke indeks soal. `draftIndex` adalah
 * indeks di dalam blok kartu baru yang SEDANG DITAMPILKAN (bukan indeks mentah
 * di state), sehingga `cardMoveBounds` dan `moveDraftCard` selalu bicara
 * tentang daftar yang sama.
 *
 * @param {Array<Object>} rows - hasil `buildQuizQuestionRows`
 * @param {Array<{questionId:string, realId?:string, draft:Object, focus?:boolean}>} newCards
 * @returns {Array<Object>} baris tersimpan dulu, kartu baru setelahnya
 */
export function buildEditorCards(rows, newCards) {
  const saved = Array.isArray(rows) ? rows : [];
  const drafts = Array.isArray(newCards) ? newCards : [];
  const present = new Set(saved.map((r) => r.questionId));

  const pending = drafts
    .filter((c) => isDraftCardVisible(c, present))
    .map((c, draftIndex) => ({
      position: null,
      draftIndex,
      questionId: c.questionId,
      question: null,
      missing: false,
      focus: Boolean(c.focus)
    }));

  return [...saved, ...pending];
}

/**
 * Menggeser satu kartu baru satu langkah (delta -1 = naik, +1 = turun).
 *
 * Kartu baru belum ada di `questionIds` sampai autosave pertama berhasil, jadi
 * ia hanya boleh bergerak di dalam blok kartu baru.Gerakan ditulis ke slot
 * yang SAMA di `newCards` (entri yang sedang disembunyikan ikut dipertahankan
 * pada tempatnya), sehingga indeks yang dipindah selalu entry yang terlihat.
 * Mengembalikan array yang SAMA bila gerakan tidak mungkin.
 */
export function moveDraftCard(newCards, cardKey, delta, present = new Set()) {
  const list = Array.isArray(newCards) ? newCards : [];
  const visible = [];
  const slots = [];
  list.forEach((c, i) => {
    if (!isDraftCardVisible(c, present)) return;
    visible.push(c);
    slots.push(i);
  });

  const at = visible.findIndex((c) => c.questionId === cardKey);
  if (at < 0) return list;

  const moved = moveItemAt(visible, at, delta);
  if (moved === visible) return list;

  const next = [...list];
  slots.forEach((slot, k) => {
    next[slot] = moved[k];
  });
  return next;
}

/**
 * React key yang stabil untuk satu kartu soal.
 *
 * Kartu baru memakai id sementara (`new_…`) sebagai key. Setelah autosave
 * pertama, barisnya memakai id permanen — dan kalau key ikut berubah, React
 * me-remount kartu: state `expanded` hilang (kartu yang sedang diisi mendadak
 * menutup), DOM baru dibuat, fokus di dalam textarea ikut hilang.
 * `draftKeyById` menyimpan id sementara untuk kartu itu, sehingga key bertahan
 * melewati transisi create dan React hanya memperbarui prop.
 *
 * Kartu lama (tidak pernah lewat kartu baru) memakai `questionId` langsung.
 */
export function cardKeyOf(row, draftKeyById = {}) {
  const id = row?.questionId;
  if (!id) return '';
  return draftKeyById?.[id] || id;
}

/**
 * Batas tombol panah per kartu, supaya tidak ada tombol mati.
 *
 * Kartu tersimpan dibatasi oleh `questionIds`. Kartu baru dibatasi oleh blok
 * kartu baru yang sedang tampil (`draftCount` = jumlah kartu baru yang
 * dirender, dan `draftIndex` = posisinya di blok itu) — kalau tidak, satu klik
 * akan menulis indeks yang menimpa soal yang salah.
 */
export function cardMoveBounds(row, { questionIds = [], draftCount = 0 } = {}) {
  if (row?.position == null) {
    const at = Number.isInteger(row?.draftIndex) ? row.draftIndex : -1;
    // Indeks di luar jangkauan = kartu yang tidak lagi dirender. Tombolnya
    // dimatikan semua: lebih baik tidak bisa diklik daripada hidup tapi sia-sia.
    if (at < 0 || at >= draftCount) return { up: false, down: false };
    return { up: at > 0, down: at < draftCount - 1 };
  }
  const total = Array.isArray(questionIds) ? questionIds.length : 0;
  return { up: row.position > 0, down: row.position < total - 1 };
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
 * Menggeser satu elemen satu langkah pada array sembarang
 * (delta -1 = naik, +1 = turun).
 *
 * INI satu-satunya implementasi "geser satu langkah": dipakai `moveQuestionIdAt`
 * untuk id soal yang sudah tersimpan, dan oleh editor untuk kartu baru yang
 * belum punya id. Karena keduanya memakai fungsi yang sama, tombol panah dan
 * drag tidak mungkin punya aturan indeks yang berbeda.
 *
 * Mengembalikan array YANG SAMA bila gerakan tidak mungkin (kepala, ekor,
 * satu elemen, atau indeks di luar jangkauan) — identitas array dipakai
 * pemanggil untuk membatalkan write / setState.
 */
export function moveItemAt(list, index, delta) {
  if (!Array.isArray(list)) return list;
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  const target = index + delta;
  if (!Number.isInteger(target) || target < 0 || target >= list.length) return list;

  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Memindahkan satu soal satu langkah (delta -1 = naik, +1 = turun).
 * Membungkus `moveItemAt` dengan penamaan domain soal.
 * Mengembalikan array YANG SAMA bila gerakan tidak mungkin.
 */
export function moveQuestionIdAt(ids, index, delta) {
  const list = Array.isArray(ids) ? ids : [];
  return moveItemAt(list, index, delta);
}

/**
 * Memindahkan satu soal dari indeks `from` ke indeks `to` (jarak bebas) — dipakai
 * oleh drag-and-drop. Direalisasikan sebagai rangkaian `moveQuestionIdAt`,
 * supaya HANYA ada satu sumber logika urutan di file ini (tombol panah dan drag
 * tidak pernah punya aturan indeks sendiri-sendiri).
 *
 * Mengembalikan array input bila gerakan tidak mungkin (indeks di luar
 * jangkauan, `from === to`, atau daftar kurang dari dua soal) — sama seperti
 * `moveQuestionIdAt`, identitas array dipakai untuk membatalkan write.
 */
export function moveQuestionIdTo(ids, from, to) {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;

  const step = to > from ? 1 : -1;
  let current = list;
  let at = from;
  while (at !== to) {
    const prev = current;
    current = moveQuestionIdAt(current, at, step);
    // Gerakan buntu (tidak seharusnya terjadi karena batas sudah dicek di atas):
    // batalkan seluruh operasi daripada menulis urutan setengah jalan.
    if (current === prev) return list;
    at += step;
  }
  return current;
}
