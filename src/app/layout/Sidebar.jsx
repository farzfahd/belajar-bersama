import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { useSpace } from '../../features/space/hooks/useSpace';
import { NAV, isNavItemActive } from './navConfig';
import NavIcon from '../../shared/icons/NavIcon';
import IconChevronExpand from '../../shared/icons/IconChevronExpand';
import Tooltip from '../../shared/ui/Tooltip';
import Avatar from '../../shared/components/Avatar';

// Desktop rail (>=860px). Dua mekanisme TERPISAH, sengaja tidak digabung:
//   1. Tooltip = state sementara, hanya saat rail CIUT. "Intip nama menu".
//   2. Toggle  = state persisten di localStorage. "Mau label terlihat terus".
// Saat rail LEBAR tooltip tidak dirender sama sekali — label sudah terlihat,
// tooltip jadi redundant.
const RAIL_KEY = 'lb:railExpanded';
const RAIL_W = { collapsed: 64, expanded: 216 };

function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === 'true';
  } catch {
    // localStorage bisa diblokir (mode privat); default saja ke ciut.
    return false;
  }
}

function ToggleButton({ expanded, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? 'Ciutkan navigasi' : 'Perluas navigasi'}
      aria-expanded={expanded}
      className={`flex items-center justify-center rounded-smc text-dim transition-colors hover:bg-accentsoft hover:text-accent ${className}`}
    >
      <IconChevronExpand size={18} direction={expanded ? 'left' : 'right'} />
    </button>
  );
}

function NavItem({ item, expanded, pathname }) {
  const active = isNavItemActive(item, pathname);
  const tipId = `rail-tip-${item.key}`;
  const tipLabel = item.comingSoon ? `${item.label} (Segera hadir)` : item.label;

  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/dashboard'}
      aria-current={active ? 'page' : undefined}
      aria-describedby={!expanded ? tipId : undefined}
      title={expanded ? undefined : item.label}
      className={`relative flex min-h-[44px] items-center gap-3 border-l-2 py-2 pr-3 pl-5 text-[13.5px] transition-colors ${
        active
          ? 'border-l-accent bg-accentsoft font-semibold'
          : 'border-l-transparent hover:bg-elevated'
      }`}
    >
      {/* Ikon diam di posisi sama di kedua state (padding-left 20px), jadi
          transisi hanya mengisi ruang label di kanannya — tidak "melompat". */}
      <span className="relative flex shrink-0 items-center justify-center">
        <span className={active ? 'text-accent' : 'text-dim'}>
          <NavIcon name={item.icon} size={expanded ? 20 : 22} />
        </span>
        {/* Ciut: tidak ada ruang untuk teks "nanti" -> titik statis di pojok.
            Sengaja tanpa pulse: ini bukan notifikasi baru. */}
        {!expanded && item.comingSoon && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-1.5 block h-1.5 w-1.5 rounded-full bg-dimmer"
          />
        )}
      </span>

      {/* Label SELALU di-mount supaya transisi opacity punya elemen untuk
          dianimasikan. Saat ciut ia tetap dirender tapi opacity 0 (dan
          disembunyikan dari screen reader karena link sudah punya aria-label
          lewat tooltip/aria-label native). */}
      <span className="rail-label truncate leading-none" aria-hidden={!expanded}>
        {item.label}
      </span>
      {item.comingSoon && (
        <span
          aria-hidden="true"
          className="rail-label ml-auto flex shrink-0 items-center font-mono text-[9px] uppercase leading-none tracking-[.08em] text-dimmer"
        >
          nanti
        </span>
      )}
    </NavLink>
  );

  // Tooltip hanya saat ciut; saat lebar label sudah terlihat langsung.
  if (expanded) return link;
  return (
    <Tooltip label={tipLabel} id={tipId}>
      {link}
    </Tooltip>
  );
}

// Sidebar desktop (>=860px): rail ikon yang bisa ciut (64px) / lebar (216px).
// Lebar rail di-set via inline style; `main` di sebelahnya otomatis mengikuti
// karena Layout memakai flexbox — tidak perlu resize manual.
export default function Sidebar({ spaceId }) {
  const { pathname } = useLocation();
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const space = useSpace(spaceId);
  const [expanded, setExpanded] = useState(readRail);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_KEY, String(next));
      } catch {
        // Gagal simpan tidak boleh mematikan toggle untuk sesi ini.
      }
      return next;
    });
  }, []);

  // Samakan state antar-tab: toggle di tab lain langsung tercermin di sini.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== RAIL_KEY) return;
      setExpanded(e.newValue === null ? readRail() : e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <aside
      data-expanded={expanded ? 'true' : 'false'}
      style={{ width: expanded ? RAIL_W.expanded : RAIL_W.collapsed }}
      className="rail rail-scroll hidden h-full min-h-0 shrink-0 flex-col overflow-y-auto border-r border-line bg-bg min-[860px]:flex"
    >
      {/* 1. Header: monogram (ciut) atau wordmark + subtitle (lebar) */}
      {expanded ? (
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-4">
          <div className="min-w-0">
            <div className="truncate font-head text-[16px] font-medium leading-none text-ink">
              Belajar Bersama
            </div>
            <div className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[.08em] text-dimmer">
              ruang · {space.data?.name || '…'}
            </div>
          </div>
          {/* 2. Tombol toggle saat lebar: ujung kanan baris header */}
          <ToggleButton expanded={expanded} onToggle={toggle} className="h-7 w-7 shrink-0" />
        </div>
      ) : (
        <div className="flex shrink-0 justify-center pt-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-smc border border-line bg-accentsoft text-[12px] font-bold text-[color:var(--accent-ink)]"
          >
            BB
          </span>
        </div>
      )}

      {/* 2. Tombol toggle saat ciut: baris penuh sendiri sebelum daftar menu */}
      {!expanded && (
        <div className="mt-1.5 flex shrink-0 justify-center">
          <ToggleButton expanded={expanded} onToggle={toggle} className="h-9 w-full" />
        </div>
      )}

      {/* 3. Separator tipis */}
      <div className="shrink-0 border-b border-line" aria-hidden="true" />

      {/* 4. Daftar item nav (scrollable, scrollbar visual disembunyikan) */}
      <nav className="flex-1 py-3" aria-label="Menu utama">
        {NAV.map((item) => (
          <NavItem key={item.key} item={item} expanded={expanded} pathname={pathname} />
        ))}
      </nav>

      {/* 5. Separator tipis */}
      <div className="shrink-0 border-t border-line" aria-hidden="true" />

      {/* 6. Footer: profil -> /settings (avatar saja saat ciut) */}
      <Link
        to="/settings"
        className={
          expanded
            ? 'flex min-h-[44px] shrink-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated'
            : 'flex min-h-[44px] shrink-0 items-center justify-center py-2 transition-colors hover:bg-elevated'
        }
      >
        <Avatar name={me.data?.displayName} color={me.data?.color} size={32} />
        {expanded && (
          <div className="flex min-w-0 flex-col justify-center gap-1">
            <div className="truncate text-[13px] font-semibold leading-none text-ink">
              {me.data?.displayName || '…'}
            </div>
            <div className="font-mono text-[10px] uppercase leading-none tracking-[.06em] text-dimmer">
              kamus profil
            </div>
          </div>
        )}
      </Link>
    </aside>
  );
}

