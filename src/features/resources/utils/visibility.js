// Lapisan kedua (defense-in-depth) untuk privasi resource.
//
// Firestore Rules sudah menolak resource private milik partner; aplikasi
// membaca lewat dua listener (shared + milik sendiri, lihat
// features/resources/hooks/useResources.js). Helper ini dipakai lagi
// sebelum render/pencarian.
export function resourceVisibleTo(resource, uid) {
  if (!resource || !uid || resource.deletedAt) return false;
  return resource.visibility === 'shared' || resource.addedBy === uid;
}

// Daftar resource yang aktif & terlihat oleh pemirsa uid.
export function visibleActiveResources(resources, uid) {
  return (Array.isArray(resources) ? resources : []).filter((r) => resourceVisibleTo(r, uid));
}
