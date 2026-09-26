// Konfigurasi navigasi aplikasi. `comingSoon` = menu yang halamannya
// belum dibangun di Fase 1 (menuju halaman "Segera hadir").
export const NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    path: '/dashboard',
    comingSoon: false,
    note: 'Ringkasan belajar kamu, partner, dan ruang berdua.'
  },
  {
    key: 'today',
    label: 'Today',
    icon: 'today',
    path: '/today',
    comingSoon: true,
    note: 'Rencana belajar harian untuk kamu & partner.'
  },
  {
    key: 'learn',
    label: 'Learn',
    icon: 'learn',
    path: '/learn',
    comingSoon: false,
    note: 'Catatan (Notes) + tautan sumber belajar (Resources) per topik.'
  },
  {
    key: 'roadmap',
    label: 'Roadmap',
    icon: 'roadmap',
    path: '/roadmap',
    comingSoon: false,
    note: 'Pohon topik 3 level: Subject → Topic → Subtopic.'
  },
  // 'questions' TIDAK lagi menjadi menu utama (CP1 → UX refinement "quiz-first"):
  // pembuatan soal terjadi dari dalam Quiz Editor. Halaman /questions tetap ada
  // sebagai pustaka soal reusable dan hanya bisa dibuka lewat tautan, bukan NAV.
  {
    key: 'quiz',
    label: 'Quiz',
    icon: 'quiz',
    path: '/quiz',
    comingSoon: false,
    note: 'Pusat pembuatan kuis: tambah soal baru atau pilih soal tersimpan.'
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: 'tasks',
    path: '/tasks',
    comingSoon: true,
    note: 'Daftar tugas dan penugasan per topik.'
  },
  {
    key: 'discuss',
    label: 'Discuss',
    icon: 'discuss',
    path: '/discuss',
    comingSoon: true,
    note: 'Diskusi privat: komentar di catatan & respons per topik.'
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: 'projects',
    path: '/projects',
    comingSoon: true,
    note: 'Rekaman kemajuan project belajar bersama.'
  },
  {
    key: 'progress',
    label: 'Progress',
    icon: 'progress',
    path: '/progress',
    comingSoon: false,
    note: 'Statistik lanjutan & heatmap kontribusi.'
  },
  {
    key: 'achievements',
    label: 'Achievements',
    icon: 'achievements',
    path: '/achievements',
    comingSoon: false,
    note: 'Badge & pencapaian belajar.'
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    path: '/notifications',
    comingSoon: true,
    note: 'Pemberitahuan aktivitas partner.'
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'settings',
    path: '/settings',
    comingSoon: false,
    note: 'Profil, info ruang, tema, dan keamanan akun.'
  }
];

// Bottom-nav mobile: 7 item utama (sisanya lewat drawer/hamburger).
export const BOTTOM_NAV_KEYS = [
  'dashboard',
  'today',
  'learn',
  'roadmap',
  'quiz',
  'tasks',
  'settings'
];

export function navByKey(key) {
  return NAV.find((n) => n.key === key) || null;
}

export function isNavItemActive(item, pathname) {
  if (!item || !pathname) return false;
  if (item.path === '/dashboard') return pathname === item.path;
  if (item.key === 'learn' && (pathname === '/notes' || pathname.startsWith('/notes/'))) return true;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function navByPath(pathname) {
  return NAV.find((item) => isNavItemActive(item, pathname)) || null;
}