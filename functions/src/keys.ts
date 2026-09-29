/**
 * Pembacaan dokumen KUNCI jawaban (Assessment Security, M6).
 *
 * Modul ini memakai Firebase Admin SDK, yang operasiNYA MELEWATI Firestore
 * Rules. Itu justru inti desain: rules mengatur siapa yang boleh membaca kunci
 * dari browser; server boleh membaca semuanya karena tidak ada untrusted
 * client di jalur ini.
 *
 * ATURAN KEAMANAN
 *   1. Kunci dibaca HANYA pada `keyRevision` yang tercatat di entri snapshot
 *      attempt tersebut. Server TIDAK PERNAH membaca "revisi terbaru" untuk
 *      attempt lama (M5/PART 24).
 *   2. Kalau dokumen kunci untuk revisi yang dibutuhkan tidak ada, penilaian
 *      untuk soal itu DIABANDONKAN dan ditandai perlu penilaian manual — bukan
 *      diberi tebakan dan bukan dianggap benar/salah otomatis.
 *   3. Modul ini tidak menulis ke Firestore. Semua penulisan ada di
 *      `gradeAttempt.ts`.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { KEY_SUBCOLLECTION } from './constants.js';
import type { KeyDoc, SnapshotEntry } from './helpers.js';

let db: FirebaseFirestore.Firestore | null = null;

function firestore(): FirebaseFirestore.Firestore {
  if (!db) db = getFirestore();
  return db;
}

/**
 * Ambil dokumen kunci untuk SATU soal pada revisi tertentu.
 * Mengembalikan `null` bila tidak ada — pemanggil wajib memperlakukan itu
 * sebagai kondisi yang harus ditangani, bukan sebagai kunci kosong.
 */
export async function readKeyDoc(
  spaceId: string,
  questionId: string,
  keyRevision: string | number
): Promise<KeyDoc | null> {
  if (!spaceId || !questionId || keyRevision === undefined || keyRevision === null) return null;
  const ref = firestore()
    .doc(`spaces/${spaceId}/questions/${questionId}/${KEY_SUBCOLLECTION}/${String(keyRevision)}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as KeyDoc;
}

/**
 * Ambil kunci untuk seluruh entri snapshot satu attempt, sekaligus.
 *
 * `getAll` dipakai agar tidak jadi N+1 read. Entri tanpa `keyRevision`
 * (mis. entri `unavailable`) dilewati.
 */
export async function readKeysForSnapshot(
  spaceId: string,
  snapshot: SnapshotEntry[]
): Promise<Map<string, KeyDoc | null>> {
  const list = Array.isArray(snapshot) ? snapshot : [];
  const wanted: Array<{ questionId: string; revision: string }> = [];
  list.forEach((entry) => {
    const rev = entry?.keyRevision;
    if (entry?.id && rev !== undefined && rev !== null && entry.type !== 'unavailable') {
      wanted.push({ questionId: entry.id, revision: String(rev) });
    }
  });
  const out = new Map<string, KeyDoc | null>();
  if (wanted.length === 0) return out;

  const refs = wanted.map((w) =>
    firestore()
      .doc(`spaces/${spaceId}/questions/${w.questionId}/${KEY_SUBCOLLECTION}/${w.revision}`)
  );
  const snaps = await firestore().getAll(...refs);
  snaps.forEach((snap, i) => {
    out.set(wanted[i].questionId, snap.exists ? (snap.data() as KeyDoc) : null);
  });
  return out;
}

/** Setel instance Firestore untuk pengujian (test injection). */
export function __setFirestoreForTesting(instance: FirebaseFirestore.Firestore | null): void {
  db = instance;
}
