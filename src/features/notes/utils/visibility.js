// Lapisan kedua (defense-in-depth) untuk privasi catatan.
//
// Privasi SEBENARNYA ditegakkan Firestore Rules: `notes` hanya bisa dibaca
// lewat query yang membuktikan aturan (shared & belum dihapus, atau milik
// sendiri) — lihat features/notes/hooks/useNotes.js yang memakai dua
// listener. Helper di sini tetap dipakai sebelum render/pencarian supaya
// data yang tidak terlihat tidak pernah masuk UI maupun indeks pencarian.
export function noteVisibleTo(note, uid) {
  return Boolean(note) && Boolean(uid) && (note.visibility === 'shared' || note.ownerId === uid);
}

// Daftar aktif yang pantas tampil untuk pemirsa (sampah diurus terpisah).
export function visibleActiveNotes(notes, uid) {
  return (Array.isArray(notes) ? notes : []).filter((n) => noteVisibleTo(n, uid) && !n.deletedAt);
}
