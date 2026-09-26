import { deleteUser } from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { COL, ROOT } from '../../../lib/constants';

const BATCH_LIMIT = 450;

function toJsonValue(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return value;
}

export function buildPersonalExport({ profile, space, topics, notes, resources, noteStates, resourceStates }) {
  const uid = auth.currentUser?.uid;
  return {
    format: 'belajar-bersama-export',
    exportedAt: new Date().toISOString(),
    notice: 'Export hanya berisi data yang sedang dapat dibaca oleh akun ini.',
    account: { uid, email: auth.currentUser?.email || null },
    profile: toJsonValue(profile || null),
    space: toJsonValue(space ? { id: space.id, name: space.name, memberIds: space.memberIds } : null),
    topics: toJsonValue(topics || []),
    notes: toJsonValue(notes || []),
    resources: toJsonValue(resources || []),
    noteStates: toJsonValue((noteStates || []).filter((state) => state.uid === uid)),
    resourceStates: toJsonValue((resourceStates || []).filter((state) => state.uid === uid))
  };
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function deleteInBatches(refs) {
  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(index, index + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

// Menghapus hanya dokumen yang dimiliki akun ini; space dan profil tetap ada karena Rules melindunginya.
export async function deletePersonalContent(spaceId, uid, { notes = [], resources = [], noteStates = [], resourceStates = [] }) {
  const refs = [
    ...notes.filter((item) => item.ownerId === uid).map((item) => doc(db, ROOT.spaces, spaceId, COL.notes, item.id)),
    ...resources.filter((item) => item.addedBy === uid).map((item) => doc(db, ROOT.spaces, spaceId, COL.resources, item.id)),
    ...noteStates.filter((item) => item.uid === uid).map((item) => doc(db, ROOT.spaces, spaceId, COL.noteStates, item.id)),
    ...resourceStates.filter((item) => item.uid === uid).map((item) => doc(db, ROOT.spaces, spaceId, COL.resourceStates, item.id))
  ];
  await deleteInBatches(refs);
}

export async function deleteAccountAfterContentCleanup() {
  if (!auth.currentUser) throw new Error('Sesi akun sudah berakhir.');
  await deleteUser(auth.currentUser);
}
