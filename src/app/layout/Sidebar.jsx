import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuthState } from '../../features/auth/hooks/useAuthState';
import { useProfile } from '../../features/auth/hooks/useProfile';
import { useSpace } from '../../features/space/hooks/useSpace';
import { NAV, isNavItemActive } from './navConfig';
import NavIcon from '../../shared/icons/NavIcon';
import Avatar from '../../shared/components/Avatar';

function NavLinkItem({ item, pathname }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/dashboard'}
      className={() =>
        `flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2 text-[13.5px] transition-colors ${
          isNavItemActive(item, pathname)
            ? 'border-l-accent font-semibold text-ink'
            : 'border-l-transparent text-dim hover:border-l-linestrong hover:text-ink'
        }`
      }
    >
      <NavIcon name={item.icon} size={18} />
      <span className="truncate">{item.label}</span>
      {item.comingSoon && (
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-dimmer">
          nanti
        </span>
      )}
    </NavLink>
  );
}

// Sidebar desktop (>=860px), lebar 216px, menempel di bawah topbar.
export default function Sidebar({ spaceId }) {
  const { pathname } = useLocation();
  const { user } = useAuthState();
  const me = useProfile(user?.uid);
  const space = useSpace(spaceId);

  return (
    <aside className="hidden h-full min-h-0 w-[216px] shrink-0 overflow-y-auto border-r border-line bg-bg min-[860px]:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-5 py-4">
          <div className="font-head text-[16px] font-medium leading-none text-ink">
            Belajar Bersama
          </div>
          <div className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[.08em] text-dimmer">
            ruang · {space.data?.name || '…'}
          </div>
        </div>

        <nav className="flex-1 py-3" aria-label="Menu utama">
          {NAV.map((item) => (
            <NavLinkItem key={item.key} item={item} pathname={pathname} />
          ))}
        </nav>

        <Link
          to="/settings"
           className="flex min-h-[44px] items-center gap-3 border-t border-line px-4 py-3 transition-colors hover:bg-bg2"
        >
          <Avatar name={me.data?.displayName} color={me.data?.color} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">
              {me.data?.displayName || '…'}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
              kamus profil
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
