# Checkpoint 2 — Layout, Navigasi, Tema

Tanggal: **2026-09-25** · Status: **SELESAI** (`npm run build` ✓ hijau)

Scope sesuai keputusan: navigasi lengkap (sidebar desktop 216px, bottom-nav mobile 7 ikon + drawer, topbar solid), tema sudah terpasang dari CP1 (tidak ada fitur konten — itu CP3+). **Tanpa heatmap/chart/badge** (dikonfirmasi mengisi "Segera hadir").

---

## 1. Daftar file (dibuat/Diubah)

| File | Aksi |
|---|---|
| `src/app/layout/navConfig.js` | Baru — daftar 13 menu + bottom-nav 7 ikon |
| `src/app/layout/Topbar.jsx` | Baru — topbar solid sticky, status sinkron, tema, avatar |
| `src/app/layout/Sidebar.jsx` | Baru — sidebar desktop 216px, aktif = border-left 2px accent |
| `src/app/layout/BottomNav.jsx` | Baru — bottom-nav mobile fixed (7 ikon) |
| `src/app/layout/Drawer.jsx` | Baru — drawer menu lengkap (mobile) |
| `src/app/layout/Layout.jsx` | Baru — kerangka: topbar + sidebar + konten max 1100px + bottom-nav |
| `src/app/layout/ComingSoonPage.jsx` | Baru — halaman placeholder "Segera hadir" |
| `src/app/layout/AppShell.jsx` | Ditulis ulang — kontainer rute konten di bawah Layout |
| `src/features/dashboard/components/DashboardPage.jsx` | Baru — halaman awal (hero + 3 seksi; isi di CP7) |
| `src/features/learn/components/LearnPage.jsx` | Baru — tab Notes / Resources (shell) |
| `src/features/topics/components/RoadmapPage.jsx` | Baru — shell Roadmap (isi di CP3) |
| `src/features/settings/components/SettingsPage.jsx` | Baru — profil, ruang (+undangan), tema, keamanan, data |
| `src/lib/constants.js` | Diubah — `IDENTITY.colors` → palet kalem "buku catatan" |
| `src/app/router.jsx` | **Tidak berubah** (Gate → AppShell tetap berlaku) |

**Tidak ada perubahan** pada `firestore.rules` → tidak perlu `npm run test:rules`.

---

## 2. Kode lengkap tiap file

> Catatan: logika & JSX identik dengan file sumber; formatting sedikit diringkas demi keterbacaan dokumen.

### `src/lib/constants.js` (bagian yang diubah)

```js
export const IDENTITY = {
  // Palet identitas "buku catatan": warna kalem, tetap terbaca di light & dark.
  colors: ['#e0704f', '#93b074', '#d9a441', '#a58a72', '#b48bb0', '#7aa89a', '#c08a6a', '#91a3c4'],
  defaultColor: '#e0704f'
};
```

### `src/app/layout/navConfig.js`

```js
export const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/', comingSoon: false, note: 'Ringkasan belajar kamu, partner, dan ruang berdua.' },
  { key: 'today', label: 'Today', icon: '📅', path: '/today', comingSoon: true, note: 'Rencana belajar harian untuk kamu & partner.' },
  { key: 'learn', label: 'Learn', icon: '📚', path: '/learn', comingSoon: false, note: 'Catatan (Notes) + tautan sumber belajar (Resources) per topik.' },
  { key: 'roadmap', label: 'Roadmap', icon: '🗺️', path: '/roadmap', comingSoon: false, note: 'Pohon topik 3 level: Subject → Topic → Subtopic.' },
  { key: 'questions', label: 'Questions', icon: '❓', path: '/questions', comingSoon: true, note: 'Bank soal per topik + soal dari partner.' },
  { key: 'quiz', label: 'Quiz', icon: '🧪', path: '/quiz', comingSoon: true, note: 'Latihan pilihan ganda & skor per topik.' },
  { key: 'tasks', label: 'Tasks', icon: '✅', path: '/tasks', comingSoon: true, note: 'Daftar tugas dan penugasan per topik.' },
  { key: 'discuss', label: 'Discuss', icon: '💬', path: '/discuss', comingSoon: true, note: 'Diskusi privat: komentar di catatan & respons per topik.' },
  { key: 'projects', label: 'Projects', icon: '🚀', path: '/projects', comingSoon: true, note: 'Rekaman kemajuan project belajar bersama.' },
  { key: 'progress', label: 'Progress', icon: '📊', path: '/progress', comingSoon: true, note: 'Statistik lanjutan & heatmap kontribusi.' },
  { key: 'achievements', label: 'Achievements', icon: '🏆', path: '/achievements', comingSoon: true, note: 'Badge & pencapaian belajar.' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', path: '/notifications', comingSoon: true, note: 'Pemberitahuan aktivitas partner.' },
  { key: 'settings', label: 'Settings', icon: '⚙️', path: '/settings', comingSoon: false, note: 'Profil, info ruang, tema, dan keamanan akun.' }
];

export const BOTTOM_NAV_KEYS = ['dashboard', 'today', 'learn', 'roadmap', 'questions', 'tasks', 'settings'];

export function navByKey(key) { return NAV.find((n) => n.key === key) || null; }
export function navByPath(path) { return NAV.find((n) => n.path === path) || null; }
```

### `src/app/layout/Topbar.jsx`

```jsx
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../providers';
import { useOnlineStatus } from '../../shared/hooks/useOnlineStatus';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { useSpace } from '../../features/space/hooks/useSpace';
import { navByPath } from './navConfig';
import Avatar from '../../shared/components/Avatar';

export default function Topbar({ spaceId, onOpenDrawer, drawerOpen = false }) {
  const loc = useLocation();
  const meta = navByPath(loc.pathname);
  const online = useOnlineStatus();
  const { theme, toggle } = useTheme();
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const space = useSpace(spaceId);

  return (
    <header className="sticky top-0 z-40 h-[60px] border-b border-line bg-bg">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onOpenDrawer} aria-label="Buka menu" aria-expanded={drawerOpen} className="icon-btn min-[860px]:hidden">☰</button>
        <div className="min-w-0">
          <div className="truncate font-head text-[15px] font-medium leading-none text-ink">Learning Berdua</div>
          <div className="eyebrow mt-1 truncate">{meta?.label || 'Ruang belajar'}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[10px] uppercase tracking-[.08em] text-dimmer sm:inline">
            {online ? 'terhubung' : 'offline'} · {space.pending ? 'menyimpan…' : 'tersinkron'}
          </span>
          <button type="button" onClick={toggle} aria-label="Ubah tema" className="icon-btn" title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link to="/settings" aria-label="Pengaturan profil" className="flex h-[36px] w-[36px] items-center justify-center rounded-full border border-line bg-bg2 hover:border-linestrong">
            <Avatar name={me.data?.displayName} color={me.data?.color} size={28} />
          </Link>
        </div>
      </div>
    </header>
  );
}
```

### `src/app/layout/Sidebar.jsx`

```jsx
import { Link, NavLink } from 'react-router-dom';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { useSpace } from '../../features/space/hooks/useSpace';
import { NAV } from './navConfig';
import Avatar from '../../shared/components/Avatar';

function NavLinkItem({ item }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2 text-[13.5px] transition-colors ${
          isActive
            ? 'border-l-accent font-semibold text-ink'
            : 'border-l-transparent text-dim hover:border-l-linestrong hover:text-ink'
        }`
      }
    >
      <span aria-hidden="true" className="text-[15px]">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {item.comingSoon && (
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-dimmer">nanti</span>
      )}
    </NavLink>
  );
}

export default function Sidebar({ spaceId }) {
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const space = useSpace(spaceId);

  return (
    <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[216px] shrink-0 overflow-y-auto border-r border-line bg-bg min-[860px]:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-5 py-4">
          <div className="font-head text-[16px] font-medium leading-none text-ink">Learning Berdua</div>
          <div className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[.08em] text-dimmer">
            ruang · {space.data?.name || '…'}
          </div>
        </div>
        <nav className="flex-1 py-3" aria-label="Menu utama">
          {NAV.map((item) => <NavLinkItem key={item.key} item={item} />)}
        </nav>
        <Link to="/settings" className="flex items-center gap-3 border-t border-line px-4 py-3 transition-colors hover:bg-bg2">
          <Avatar name={me.data?.displayName} color={me.data?.color} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{me.data?.displayName || '…'}</div>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">kamus profil</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
```

### `src/app/layout/BottomNav.jsx`

```jsx
import { NavLink } from 'react-router-dom';
import { BOTTOM_NAV_KEYS, navByKey } from './navConfig';

export default function BottomNav() {
  const items = BOTTOM_NAV_KEYS.map(navByKey).filter(Boolean);
  return (
    <nav aria-label="Navigasi utama mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg min-[860px]:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-[560px] items-stretch justify-around">
        {items.map((item) => (
          <NavLink key={item.key} to={item.path} end={item.path === '/'}
            className={({ isActive }) => `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${isActive ? 'text-accent' : 'text-dimmer hover:text-ink'}`}>
            <span aria-hidden="true" className="text-[18px] leading-none">{item.icon}</span>
            <span className="font-mono text-[9px] uppercase tracking-[.05em]">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

### `src/app/layout/Drawer.jsx`

```jsx
import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { NAV } from './navConfig';
import Avatar from '../../shared/components/Avatar';

export default function Drawer({ open, onClose }) {
  const { user } = useAuthState();
  const me = useProfile(user?.uid);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] min-[860px]:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-[rgba(26,23,20,.68)]" aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="view-in absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col border-r border-line bg-bg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-head text-[16px] font-medium leading-none text-ink">Learning Berdua</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-dimmer">menu lengkap</div>
          </div>
          <button type="button" aria-label="Tutup menu" onClick={onClose} className="icon-btn">✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Menu lengkap">
          {NAV.map((item) => (
            <NavLink key={item.key} to={item.path} end={item.path === '/'} onClick={onClose}
              className={({ isActive }) => `flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2 text-[13.5px] transition-colors ${isActive ? 'border-l-accent font-semibold text-ink' : 'border-l-transparent text-dim hover:border-l-linestrong hover:text-ink'}`}>
              <span aria-hidden="true" className="text-[15px]">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.comingSoon && <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-dimmer">nanti</span>}
            </NavLink>
          ))}
        </nav>
        <Link to="/settings" onClick={onClose} className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Avatar name={me.data?.displayName} color={me.data?.color} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{me.data?.displayName || '…'}</div>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">kamus profil</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
```

### `src/app/layout/Layout.jsx`

```jsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import Drawer from './Drawer';

export default function Layout({ spaceId, children }) {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Topbar spaceId={spaceId} onOpenDrawer={() => setDrawer(true)} drawerOpen={drawer} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex min-h-[calc(100vh-60px)]">
        <Sidebar spaceId={spaceId} />
        <main className="min-w-0 flex-1 pb-24 min-[860px]:pb-10">
          <div className="view-in mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
```

### `src/app/layout/ComingSoonPage.jsx`

```jsx
import EmptyState from '../../shared/ui/EmptyState';

export default function ComingSoonPage({ item }) {
  return (
    <div className="space-y-6">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · fase 1</div>
        <h1 className="font-head text-2xl text-ink">{item.icon} {item.label}</h1>
      </header>
      <EmptyState icon={item.icon} title="Segera hadir" description={item.note} />
    </div>
  );
}
```

### `src/app/layout/AppShell.jsx`

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import ComingSoonPage from './ComingSoonPage';
import DashboardPage from '../../features/dashboard/components/DashboardPage';
import LearnPage from '../../features/learn/components/LearnPage';
import RoadmapPage from '../../features/topics/components/RoadmapPage';
import SettingsPage from '../../features/settings/components/SettingsPage';
import { NAV } from './navConfig';

export default function AppShell({ spaceId }) {
  return (
    <Layout spaceId={spaceId}>
      <Routes>
        <Route path="/" element={<DashboardPage spaceId={spaceId} />} />
        <Route path="/learn" element={<LearnPage spaceId={spaceId} />} />
        <Route path="/roadmap" element={<RoadmapPage spaceId={spaceId} />} />
        <Route path="/settings" element={<SettingsPage spaceId={spaceId} />} />
        {NAV.filter((n) => n.comingSoon).map((n) => (
          <Route key={n.key} path={n.path} element={<ComingSoonPage item={n} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
```

### `src/features/dashboard/components/DashboardPage.jsx`

```jsx
import Avatar from '../../../shared/components/Avatar';
import Badge from '../../../shared/ui/Badge';
import EmptyState from '../../../shared/ui/EmptyState';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { spaceRoles } from '../../space/services/spaceService';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function NumberStat({ value, label }) {
  return (
    <div className="min-w-[96px]">
      <div className="font-head text-[28px] font-medium leading-none text-ink">{value}</div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">{label}</div>
    </div>
  );
}

export default function DashboardPage({ spaceId }) {
  const { user } = useAuthState();
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const partner = useUserProfile(roles?.partner);
  const me = useUserProfile(user?.uid);
  const fillPct = (roles?.filled ? 2 : 1) * 50;

  return (
    <div className="space-y-8">
      <section className="card flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">learning berdua · ruang {space?.name || '…'}</div>
            <h1 className="mt-1 font-head text-[26px] leading-tight text-ink">{greeting()}, {me.data?.displayName || 'kamu'} 👋</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-dim">Belajar privat untuk kamu dan satu partner. Modul konten diisi.</p>
          </div>
          <NumberStat value={roles?.filled ? '2/2' : '1/2'} label="anggota" />
        </div>
        <div className="h-[6px] w-full overflow-hidden rounded-full bg-panel2">
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${fillPct}%`, backgroundColor: roles?.filled ? 'var(--ok)' : 'var(--accent)' }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {[['me', me.data, 'Kamu'], ['partner', partner.data, 'Partner']].map(([who, p, label]) => {
            const uid = who === 'me' ? user?.uid : roles?.partner;
            return (
              <span key={who} className="inline-flex items-center gap-2 rounded-full border border-line bg-bg2 py-1 pl-1 pr-3">
                <Avatar name={p?.displayName || label} color={p?.color} size={26} />
                <span className="text-[12.5px] font-medium text-ink">{p?.displayName || (uid ? 'Memuat…' : '—')}</span>
                <Badge tone={who === 'me' ? 'accent' : 'dim'}>{label}</Badge>
              </span>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Personal</h2>
        <EmptyState icon="📝" title="Catatan & bacaanmu" description="Nanti di sini: catatan Markdown terbaru milikmu dan resource yang sedang kamu baca." />
      </section>
      <section>
        <h2 className="section-title">Partner</h2>
        <EmptyState icon="🤝" title="Aktivitas partner" description="Nanti di sini: catatan shared terbaru dari partner dan status belajar mereka." />
      </section>
      <section>
        <h2 className="section-title">Together</h2>
        <EmptyState icon="📚" title="Kemajuan bersama" description="Nanti di sini: jumlah topik tuntas dan total catatan yang dibagikan." />
      </section>
    </div>
  );
}
```

### `src/features/learn/components/LearnPage.jsx`

```jsx
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../../../shared/ui/EmptyState';

const TABS = [
  { key: 'notes', label: 'Notes', icon: '📝', note: 'Catatan belajar dengan Markdown + LaTeX, visibility private/shared, bookmark & "dipahami", dan soft delete. Modul ini hadir di checkpoint berikutnya.' },
  { key: 'resources', label: 'Resources', icon: '🔗', note: 'Tautan sumber belajar (website, YouTube, buku, paper, repo, dsb.) dengan status per anggota. Modul ini hadir di checkpoint berikutnya.' }
];

export default function LearnPage({ spaceId }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'notes';
  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="space-y-6">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · materi</div>
        <h1 className="font-head text-2xl text-ink">📚 Learn</h1>
        <p className="text-[13.5px] leading-relaxed text-dim">Semua materi menempel pada sebuah topik di Roadmap. Kedua anggota bisa berbagi catatan dan sumber belajar di ruang ini.</p>
      </header>
      <div role="tablist" aria-label="Jenis materi" className="flex border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab} onClick={() => setParams({ tab: t.key })}
            className={`-mb-px min-h-[44px] border-b-2 px-4 text-[13.5px] transition-colors ${t.key === tab ? 'border-b-accent font-semibold text-ink' : 'border-b-transparent text-dim hover:text-ink'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <EmptyState icon={active.icon} title={active.label} description={active.note} />
      </div>
    </div>
  );
}
```

### `src/features/topics/components/RoadmapPage.jsx`

```jsx
import EmptyState from '../../../shared/ui/EmptyState';

export default function RoadmapPage({ spaceId }) {
  return (
    <div className="space-y-6">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · perencanaan</div>
        <h1 className="font-head text-2xl text-ink">🗺️ Roadmap</h1>
        <p className="text-[13.5px] leading-relaxed text-dim">Pohon topik 3 level (Subject → Topic → Subtopic) dengan status, tingkat kesulitan, dan jumlah materi per node. Modul ini hadir di checkpoint berikutnya.</p>
      </header>
      <EmptyState icon="🗺️" title="Roadmap" description="Buat subject pertama, lalu susun topic & subtopic di bawahnya. Topik bisa dipindah, diurutkan, dan punya halaman detail dengan tab Notes/Resources." />
    </div>
  );
}
```

### `src/features/settings/components/SettingsPage.jsx`

```jsx
import { useEffect, useState } from 'react';
import Avatar from '../../../shared/components/Avatar';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import { useTheme } from '../../../app/providers';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useProfile } from '../../auth/hooks/useProfile';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { renameSpace, spaceRoles } from '../../space/services/spaceService';
import { resetPassword, signOutCurrent, updateProfile } from '../../auth/services/authService';
import InviteCard from '../../space/components/InviteCard';
import { toErrorMessage } from '../../../shared/utils/errors';
import { initialsOf } from '../../../shared/utils/identity';
import { fmtDate } from '../../../shared/utils/time';
import { IDENTITY } from '../../../lib/constants';

function Section({ title, eyebrow, children }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="card space-y-4">
        {eyebrow && <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-dimmer">{eyebrow}</div>}
        {children}
      </div>
    </section>
  );
}

export default function SettingsPage({ spaceId }) {
  const toast = useToast();
  const { user } = useAuthState();
  const profile = useProfile(user?.uid);
  const { data: space, pending } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const partner = useUserProfile(roles?.partner);
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [color, setColor] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.displayName || '');
      setAvatar(profile.data.avatar || '');
      setColor(profile.data.color || IDENTITY.defaultColor);
    }
  }, [profile.data]);

  const saveProfile = async () => {
    const cleanName = name.trim().slice(0, 60);
    const cleanAvatar = avatar.trim().slice(0, 8);
    if (!cleanName) { toast.error('Nama tampilan tidak boleh kosong.'); return; }
    if (cleanAvatar && !/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}]+$/u.test(cleanAvatar)) {
      toast.error('Avatar hanya boleh berisi emoji (atau kosong).'); return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(user.uid, {
        displayName: cleanName,
        avatar: cleanAvatar,
        color: IDENTITY.colors.includes(color) ? color : IDENTITY.defaultColor
      });
      toast.success('Profil diperbarui.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal menyimpan profil.'));
    } finally { setSavingProfile(false); }
  };

  const [nameDraft, setNameDraft] = useState(space?.name || '');
  const [savingSpace, setSavingSpace] = useState(false);
  useEffect(() => { if (space?.name) setNameDraft(space.name); }, [space?.name]);

  const saveSpaceName = async () => {
    setSavingSpace(true);
    try { await renameSpace(spaceId, nameDraft); toast.success('Nama ruang diperbarui.'); }
    catch (err) { toast.error(toErrorMessage(err, 'Gagal mengubah nama ruang.')); }
    finally { setSavingSpace(false); }
  };

  const resetPass = async () => {
    try { await resetPassword(user?.email || ''); toast.success('Tautan reset kata sandi dikirim ke email Anda.'); }
    catch (err) { toast.error(toErrorMessage(err, 'Gagal mengirim tautan reset.')); }
  };

  const logout = async () => {
    try { await signOutCurrent(); }
    catch (err) { toast.error(toErrorMessage(err, 'Gagal keluar.')); }
  };

  const previewEmoji = avatar.trim();

  return (
    <div className="space-y-8">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · pengaturan</div>
        <h1 className="font-head text-2xl text-ink">⚙️ Settings</h1>
        <p className="text-[13.5px] leading-relaxed text-dim">Profil, ruang, tampilan, dan keamanan akun Anda.</p>
      </header>

      <Section title="Profil" eyebrow="nama tampilan · avatar · warna identitas">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-head text-lg"
            style={{ backgroundColor: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}55` }}>
            {previewEmoji || initialsOf(name || '?')}
          </span>
          <div className="text-[13px] leading-relaxed text-dim">
            <b className="text-ink">{name.trim() || '…'}</b>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">tampil sebagai "Kamu" {roles?.filled ? '· partner aktif' : '· menunggu partner'}</div>
          </div>
        </div>
        <Input label="Nama tampilan" id="settings-displayname" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nama yang dilihat partner" />
        <Input label="Avatar (emoji opsional)" id="settings-avatar" value={avatar} maxLength={8} onChange={(e) => setAvatar(e.target.value)} placeholder="Mis: 🧠 — kosong = inisial" hint="Kosongkan untuk memakai inisial nama." />
        <div>
          <div className="eyebrow mb-2 block">Warna identitas</div>
          <div className="flex flex-wrap gap-2.5">
            {IDENTITY.colors.map((c) => (
              <button key={c} type="button" aria-label={`Pilih warna ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full border transition ${color === c ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'border-linestrong hover:border-ink'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="pt-1"><Button onClick={saveProfile} loading={savingProfile}>Simpan profil</Button></div>
      </Section>

      <Section title="Ruang" eyebrow={`${roles?.filled ? 'partner lengkap' : 'menunggu partner'} · ${roles?.filled ? 2 : 1}/2 anggota`}>
        <div>
          <div className="eyebrow mb-2 block">Nama ruang</div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="min-h-[38px] w-full max-w-sm rounded-smc border border-linestrong bg-bg2 px-3 text-[14px] text-ink" value={nameDraft} maxLength={60} onChange={(e) => setNameDraft(e.target.value)} aria-label="Nama ruang" />
            <Button size="sm" onClick={saveSpaceName} loading={savingSpace}>Simpan</Button>
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">default: Our Space · {pending ? 'menyimpan…' : 'tersinkron'}</p>
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          {[['me', profile.data, 'Kamu'], ['partner', partner.data, 'Partner']].map(([who, p, label]) => {
            const uid = who === 'me' ? user?.uid : roles?.partner;
            return (
              <div key={who} className="flex items-center gap-3">
                <Avatar name={p?.displayName || label} color={p?.color} size={40} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{p?.displayName || (uid ? 'Memuat…' : '—')}</span>
                    <Badge tone={who === 'me' ? 'accent' : 'dim'}>{label}</Badge>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">{uid || 'belum ada'}</div>
                </div>
              </div>
            );
          })}
        </div>
        <InviteCard spaceId={spaceId} disabled={roles?.filled} />
        {space?.createdAt && <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">Dibuat {fmtDate(space.createdAt)}</p>}
      </Section>

      <Section title="Tampilan" eyebrow="tema terang / gelap">
        <div className="flex flex-wrap gap-2">
          <Button variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => setTheme('dark')}>🌙 Gelap</Button>
          <Button variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => setTheme('light')}>☀️ Terang</Button>
        </div>
      </Section>

      <Section title="Keamanan" eyebrow="email · kata sandi · sesi">
        <p className="text-[13px] leading-relaxed text-dim">Masuk sebagai <b className="text-ink">{user?.email}</b> (email {user?.emailVerified ? 'terverifikasi' : 'belum diverifikasi'}).</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={resetPass}>Kirim tautan reset kata sandi</Button>
          <Button variant="danger" onClick={logout}>Keluar</Button>
        </div>
        <p className="text-[12.5px] leading-relaxed text-dimmer">Tanpa Admin SDK, "keluar dari semua perangkat" tidak tersedia. Jika akun diduga dipakai orang lain, segera <b className="text-ink">ganti kata sandi</b> lewat tautan reset di atas — sesi perangkat lain akan ditolak. Tidak ada MFA SMS di paket Spark; sarankan memakai akun Google yang sudah aktif 2-Step Verification.</p>
      </Section>

      <Section title="Data" eyebrow="ekspor & hapus data">
        <p className="text-[13px] leading-relaxed text-dim">Ekspor seluruh data (JSON) dan penghapusan akun/data ruang akan tersedia di checkpoint akhir Fase 1.</p>
        <p className="rounded-smc border border-dashed border-linestrong bg-transparent px-4 py-3 font-mono text-[11px] uppercase tracking-[.08em] text-dimmer">segera hadir · checkpoint akhir</p>
      </Section>
    </div>
  );
}
```

---

## 3. Cara menjalankan

```bash
# Terminal 1 — emulator (butuh Java; pastikan PATH sudah di-refresh)
firebase emulators:start

# Terminal 2 — app
npm run dev            # http://localhost:5173

# Cek produksi
npm run build          # ✓ hijau (91 modul)
```

Tidak menyentuh `firestore.rules`, jadi tidak perlu `npm run test:rules` pada CP2 ini.

---

## 4. Checklist uji manual

1. **Login** (email/password di emulator; tombol dev-verify untuk verifikasi email) → masuk ke Space (buat/join dulu lewat Onboarding, masih sama seperti CP1).
2. **Desktop ≥ 860px**: sidebar kiri 216px dengan 13 menu; item aktif ditandai garis kiri accent + tebal; klik antar menu berpindah halama; halaman non-aktif → "Segera hadir".
3. **Mobile < 860px**: sidebar hilang → tombol hamburger ☰ muncul di kiri topbar; drawer terbuka (tutup via tombol ✕, klik backdrop, atau tombol Escape); bottom-nav 7 ikon tetap di bawah dengan padding safe-area.
4. **Topbar**: sticky, solid (tanpa blur); status "terhubung/offline · tersinkron/menyimpan…"; tombol tema ☀️/🌙 berpindah gelap-terang; klik avatar → Settings.
5. **Dashboard**: sapaan serif sesuai jam, badge 1/2 atau 2/2 anggota, batang progres 50/100%, 3 seksi (Personal/Partner/Together) menampilkan empty state.
6. **Learn**: tab Notes ↔ Resources via query string (`#/learn?tab=resources`).
7. **Settings**:
   - Profil: ganti nama + emoji avatar (mis. `🧠`) + pilih swatch warna → "Simpan profil" → toast sukses; avatar/nama terlihat di sidebar & topbar; coba avatar bukan emoji (mis. `abc`) → ditolak dengan pesan ramah.
   - Ruang: ubah nama ruang; daftar anggota Kamu/Partner; InviteCard aktif bila 1 anggota, plain bila penuh.
   - Tampilan: tombol Gelap/Terang sinkron dengan topbar toggle dan tersimpan (`lb:theme`).
   - Keamanan: "Kirim tautan reset" & "Keluar" (keluar → AuthScreen).
   - Data: catatan ekspor/hapus masih placeholder.
8. **Refresh halaman** di tiap rute HashRouter (`#/learn`, `#/settings`, dst.) → tidak 404.
9. **Dark & light** kedua-duanya terbaca (kontras cukup) di Dashboard, Learn, Roadmap, Settings, ComingSoon.

## 5. Catatan

- Chunk JS ~760 kB (Firebase + KaTeX). Code-splitting bukan bagian CP2; ditangani saat deploy/CP7 bila perlu.
- `router.jsx` tidak berubah: Gate → AppShell, dan AppShell kini memuat `Layout` + rute konten.