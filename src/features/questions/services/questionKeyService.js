import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';
import {
  assertKeyRevisionNotOverwritten,
  keyRevisionNumber,
  nextKeyRevisionFrom
} from '../utils/keyRevision';

export { assertKeyRevisionNotOverwritten, keyRevisionNumber, nextKeyRevisionFrom };

/**
 * Bacaan & tulis DOKUMEN KUNCI jawaban (Assessment Security M1/M5).
 *
 * Aturan yang dijaga modul ini:
 *   1. Kunci disimpan di dokumen TERPISAH: `questions/{qid}/key/{revision}`.
 *   2. Revisi immutable: kunci yang sudah ada pada revisi tertentu tidak
 *      ditimpa. Perubahan kunci selalu membuat revisi baru, sehingga attempt
 *      lama tetap menunjuk revisi yang benar (M5).
 *   3. Hapus revisi hanya untuk revisi yang TIDAK dipakai attempt mana pun.
 *      Penghapusan dicegah dengan memeriksa attempt sebelum menulis, dan rules
 *      menolak `delete` pada revisi yang bukan milik author.
 *
 * Catatan keamanan: modul ini tidak melakukan cache global. `useQuestionKeys`
 * menyimpan cache di memori hook yang hanya hidup di komponen author, sehingga
 * kunci tidak pernah masuk `localStorage`/`sessionStorage`/IndexedDB umum.
 */

/** Path segmen subkoleksi kunci. */
export const KEY_SUBCOLLECTION = 'key';

/** Dokumen kunci untuk satu revisi tertentu. */
export function keyDocRef(spaceId, questionId, keyRevision) {
  return doc(
    db,
    ROOT.spaces,
    spaceId,
    COL.questions,
    questionId,
    KEY_SUBCOLLECTION,
    String(keyRevision)
  );
}

/** Koleksi seluruh revisi kunci milik satu soal. */
export function keyCollectionRef(spaceId, questionId) {
  return collection(db, ROOT.spaces, spaceId, COL.questions, questionId, KEY_SUBCOLLECTION);
}

/**
 * Baca satu revisi kunci. Rules (P2) sudah menolak partner/non-member, jadi
 * kegagalan di sini berarti memang tidak berhak.
 */
export async function getQuestionKey(spaceId, questionId, keyRevision) {
  const snap = await getDoc(keyDocRef(spaceId, questionId, keyRevision));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Baca seluruh revisi kunci milik satu soal, untuk panel author yang butuh
 * melihat daftar revisi. Dipakai author saja.
 */
export async function listQuestionKeyRevisions(spaceId, questionId) {
  const snap = await getDocs(keyCollectionRef(spaceId, questionId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Baca kunci untuk BANYAK soal sekaligus, satu dokumen kunci per soal.
 *
 * Mengembalikan `Map` keyed `questionId -> dokumen kunci` (sudah di-flatten,
 * termasuk `keyRevision`).
 *
 * SOAL API: Firestore JS SDK 10.x tidak punya `getAll` lintas dokumen, dan
 * `key` adalah SUBCOLLECTION — bukan field di dalam dokumen soal — jadi tidak
 * ada satu query yang bisa mengambil kunci beberapa soal sekaligus. Yang bisa
 * dilakukan adalah satu `getDocs` per soal atas subkoleksi `key` itu.
 *
 * Itu tetap O(N) read, hanya saja satu read per soal (bukan satu per revisi),
 * dan semua dijalankan paralel lewat `Promise.all`. Angka revisi yang benar
 * dipilih di MEMORI dari hasil read tersebut, bukan lewat query — jadi
 * `keyRevision` yang diminta benar-benar yang dipakai, bukan "yang terbaru".
 * Memilih `.orderBy()` lalu mengambil `docs[0]` justru mengembalikan kunci
 * terbaru, dan itu persis yang tidak boleh terjadi — attempt lama harus tetap
 * dinilai terhadap revisi yang dikunci saat attempt dimulai.
 *
 * Entri tanpa `questionId` atau tanpa `keyRevision` dilewati, bukan gagal —
 * pemanggil boleh menyertakan soal yang memang belum punya kunci.
 */
export async function getQuestionKeys(spaceId, entries) {
  // Kelompokkan per soal: satu read per soal walau ada beberapa revisi diminta.
  const wanted = new Map();
  for (const e of entries || []) {
    if (!e?.questionId || e.keyRevision === undefined || e.keyRevision === null) continue;
    const rev = String(e.keyRevision);
    if (!wanted.has(e.questionId)) wanted.set(e.questionId, new Set());
    wanted.get(e.questionId).add(rev);
  }
  if (wanted.size === 0) return new Map();

  const perQuestion = await Promise.all(
    [...wanted.entries()].map(async ([questionId, revisions]) => {
      const snap = await getDocs(keyCollectionRef(spaceId, questionId));
      const found = new Map();
      for (const d of snap.docs) {
        // `d.id` adalah nomor revisi (path-nya `key/{revision}`), jadi inilah
        // penentu yang benar — bukan `keyRevision` di dalam dokumen, yang
        // bisa saja tertinggal dari versi tulis sebelumnya.
        if (revisions.has(d.id)) found.set(questionId, { id: d.id, ...d.data() });
      }
      return found;
    })
  );

  const out = new Map();
  for (const m of perQuestion) {
    for (const [questionId, key] of m) out.set(questionId, key);
  }
  return out;
}

/**
 * Baca kunci milik author untuk satu soal yang sedang dibuka.
 *
 * Berbeda dengan `getQuestionKeys`: fungsi ini tidak melakukan batch, dan hanya
 * dipanggil dari komponen yang sudah dipastikan milik author. Gunanya untuk
 * skenario "satu soal dibuka di modal detail" supaya tidak perlu penyusun daftar
 * revisi.
 *
 * Mengembalikan `null` baik saat dokumen tidak ada maupun saat penolakan
 * permissions, dan itu disengaja: pemanggil tidak boleh bisa membedakan
 * "kunci tidak ada" dari "kamu tidak berhak" lewat bentuk nilai balik, karena
 * perbedaan itu sendiri bisa dipakai memetakan hak akses.
 */
export async function getOwnQuestionKey(spaceId, questionId, keyRevision) {
  if (!spaceId || !questionId || keyRevision == null) return null;
  try {
    return await getQuestionKey(spaceId, questionId, keyRevision);
  } catch {
    return null;
  }
}

/**
 * Tulis dokumen kunci untuk satu soal pada revisi tertentu.
 *
 * Revisi yang sudah ada hanya boleh ditulis ulang dengan isi IDENTIK (lihat
 * `assertKeyRevisionNotOverwritten`) — pemanggil wajib memanggil assert itu
 * lebih dulu supaya percobaan menimpa revisi lama gagal sebelum sampai ke
 * Firestore.
 *
 * Validasi kunci (PGK K<N, matching uniqueness, min 2 item) sudah dijalankan
 * sebelum fungsi ini dipanggil oleh `questionTypeFields`. Modul ini tidak
 * mengulang validasi supaya tidak ada dua sumber kebenaran.
 */
export async function createKeyRevision(spaceId, questionId, keyRevision, keyDoc, serverTimestampFn) {
  await setDoc(keyDocRef(spaceId, questionId, keyRevision), {
    ...keyDoc,
    keyRevision: String(keyRevision),
    createdAt: serverTimestampFn ? serverTimestampFn() : null
  });
  return keyRevision;
}

/**
 * Hapus satu revisi kunci. HANYA untuk revisi lama yang tidak dipakai attempt
 * mana pun; pemanggil wajib menjalankan `isKeyRevisionUsedByAttempt` lebih
 * dulu. `deleteDoc` tidak idempoten di emulator, jadi error ditelan agar
 * cleanup idempoten.
 */
export async function deleteKeyRevision(spaceId, questionId, keyRevision) {
  try {
    await deleteDoc(keyDocRef(spaceId, questionId, keyRevision));
    return true;
  } catch {
    return false;
  }
}
