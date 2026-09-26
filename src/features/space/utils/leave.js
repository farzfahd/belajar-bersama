// Helper murni (tanpa Firebase) untuk "Keluar dari Ruang Belajar" (CP0).
// Dipakai SettingsPage + spaceService.leaveSpace(); diuji tests/leave.test.mjs.

// Route tujuan setelah berhasil keluar. /dashboard berada DI BAWAH SpaceGate:
// begitu users/{uid}.spaceId = null, SpaceGate otomatis merender
// OnboardingScreen (buat/join ruang) menggantikan <Outlet/> — listener &
// SpaceProvider ruang lama ikut unmount, jadi tidak ada UI/listener basi
// dan tidak ada redirect melingkar (SpaceGate tidak memakai <Navigate>).
export const AFTER_LEAVE_ROUTE = '/dashboard';

// Poin yang WAJIB dijelaskan ke user di modal konfirmasi (sesuai spesifikasi).
export const LEAVE_CONSEQUENCES = [
  'Kamu akan keluar dari ruang ini dan tidak lagi menjadi anggotanya.',
  'Data bersama (catatan, materi, roadmap, ruang) TIDAK otomatis dihapus — tetap milik ruang dan partner.',
  'Kamu dapat bergabung kembali kapan saja dengan undangan baru dari partner.'
];

// Kelayakan keluar ruang. `memberIds[0]` = pemilik (konvensi spaceRoles &
// rules canJoin), jadi hanya indeks 1 yang boleh keluar dengan cara biasa.
// reason: 'partner' | 'owner' | 'not-member' | 'not-ready'
export function leaveEligibility({ spaceId, space, uid } = {}) {
  if (!spaceId || !uid) return { canLeave: false, reason: 'not-ready' };
  const memberIds = Array.isArray(space?.memberIds) ? space.memberIds : [];
  if (!space || memberIds.length === 0) return { canLeave: false, reason: 'not-ready' };
  const index = memberIds.indexOf(uid);
  if (index === -1) return { canLeave: false, reason: 'not-member' };
  if (index === 0) return { canLeave: false, reason: 'owner' };
  return { canLeave: true, reason: 'partner' };
}

// memberIds hasil leave: hanya diri yang dihapus, urutan & pemilik dipertahankan.
// Idempoten: menghapus uid yang tidak ada menghasilkan array sama persis.
export function nextMemberIds(memberIds, uid) {
  if (!Array.isArray(memberIds)) return [];
  return memberIds.filter((id) => id !== uid);
}
