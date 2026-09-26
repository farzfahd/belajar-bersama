// Konfigurasi navigasi aplikasi. `comingSoon` = menu yang halamannya
// belum dibangun di Fase 1 (menuju halaman "Segera hadir").
export const NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    path: '/dashboard',
    comingSoon: false,
    note: 'Ringkasan belajar kamu, partner, dan ruang berdua.'
  },
  {
    key: 'today',
    label: 'Today',
    icon: '📅',
    path: '/today',
    comingSoon: true,
    note: 'Rencana belajar harian untuk kamu & partner.'
  },
  {
    key: 'learn',
    label: 'Learn',
    icon: '📚',
    path: '/learn',
    comingSoon: false,
    note: 'Catatan (Notes) + tautan sumber belajar (Resources) per topik.'
  },
  {
    key: 'roadmap',
    label: 'Roadmap',
    icon: '🗺️',
    path: '/roadmap',
    comingSoon: false,
    note: 'Pohon topik 3 level: Subject → Topic → Subtopic.'
  },
  {
    key: 'questions',
    label: 'Questions',
    icon: '❓',
    path: '/questions',
    comingSoon: false,
    note: 'Bank soal per topik + soal dari partner.'
  },
  {
    key: 'quiz',
    label: 'Quiz',
    icon: '🧪',
    path: '/quiz',
    comingSoon: false,
    note: 'Susun kuis dari bank soal: tambah, hapus, dan atur urutan soal.'
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: '✅',
    path: '/tasks',
    comingSoon: true,
    note: 'Daftar tugas dan penugasan per topik.'
  },
  {
    key: 'discuss',
    label: 'Discuss',
    icon: '💬',
    path: '/discuss',
    comingSoon: true,
    note: 'Diskusi privat: komentar di catatan & respons per topik.'
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: '🚀',
    path: '/projects',
    comingSoon: true,
    note: 'Rekaman kemajuan project belajar bersama.'
  },
  {
    key: 'progress',
    label: 'Progress',
    icon: '📊',
    path: '/progress',
    comingSoon: false,
    note: 'Statistik lanjutan & heatmap kontribusi.'
  },
  {
    key: 'achievements',
    label: 'Achievements',
    icon: '🏆',
    path: '/achievements',
    comingSoon: false,
    note: 'Badge & pencapaian belajar.'
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: '🔔',
    path: '/notifications',
    comingSoon: true,
    note: 'Pemberitahuan aktivitas partner.'
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: '⚙️',
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
  'questions',
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