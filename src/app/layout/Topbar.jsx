import { IconMenu, IconSearch, IconThemeDark, IconThemeLight } from '../../shared/icons';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../providers';
import { useOnlineStatus } from '../../shared/hooks/useOnlineStatus';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { useSpace } from '../../features/space/hooks/useSpace';
import { navByPath } from './navConfig';
import Avatar from '../../shared/components/Avatar';
import GlobalSearchDialog from '../../features/search/components/GlobalSearchDialog';

// Topbar solid (tanpa blur), sticky di atas. Kiri: hamburger (mobile) + brand.
// Kanan: status sinkron, tombol tema, avatar menuju Settings.
export default function Topbar({ spaceId, onOpenDrawer, drawerOpen = false }) {
  const loc = useLocation();
  const meta = navByPath(loc.pathname);
  const online = useOnlineStatus();
  const { mode, toggleMode } = useTheme();
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const space = useSpace(spaceId);
  const [searchOpen, setSearchOpen] = useState(false);

  // Shortcut global: "/" atau Ctrl/Cmd+K membuka search. Di dalam input/textarea
  // tombol tidak diambil (Ctrl+K di editor note tetap berarti "sisipkan link").
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        return;
      }
      const el = e.target;
      const editable =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editable) return;
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      const comboK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
      if (slash || comboK) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 h-[60px] shrink-0 border-b border-line bg-bg">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Buka menu"
          aria-expanded={drawerOpen}
          className="icon-btn min-[860px]:hidden"
        >
          <IconMenu size={20} />
        </button>

        <div className="min-w-0">
          <div className="truncate font-head text-[15px] font-medium leading-none text-ink">
            Belajar Bersama
          </div>
          <div className="eyebrow mt-1 truncate">{meta?.label || 'Ruang belajar'}</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Cari di ruang belajar"
            title="Cari di ruang belajar ( / atau Ctrl+K )"
            className="icon-btn"
          >
            <IconSearch size={20} />
          </button>
          <span className="hidden font-mono text-[10px] uppercase tracking-[.08em] text-dimmer sm:inline">
            {online ? 'terhubung' : 'offline'} · {space.error ? 'gagal sinkron' : space.pending ? 'menyimpan…' : 'tersinkron'}
          </span>
          <button
            type="button"
            onClick={toggleMode}
            aria-label="Ubah mode terang/gelap"
            className="icon-btn"
            title={mode === 'dark' ? 'Mode terang' : 'Mode gelap'}
          >
            {mode === 'dark' ? <IconThemeLight size={20} /> : <IconThemeDark size={20} />}
          </button>
          <Link
            to="/settings"
            aria-label="Pengaturan profil"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-bg2 hover:border-linestrong"
          >
            <Avatar name={me.data?.displayName} color={me.data?.color} size={28} />
          </Link>
        </div>
      </div>
      </header>
      {searchOpen && <GlobalSearchDialog open onClose={() => setSearchOpen(false)} />}
    </>
  );
}