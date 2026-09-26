import { NavLink, useLocation } from 'react-router-dom';
import { BOTTOM_NAV_KEYS, navByKey, isNavItemActive } from './navConfig';
import NavIcon from '../../shared/icons/NavIcon';

// Bottom-nav mobile (<860px): 7 item utama, tetap fixed di bawah.
export default function BottomNav() {
  const { pathname } = useLocation();
  const items = BOTTOM_NAV_KEYS.map(navByKey).filter(Boolean);

  return (
    <nav
      aria-label="Navigasi utama mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg min-[860px]:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)'
      }}
    >
      <div className="mx-auto flex max-w-[560px] items-stretch justify-around">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === '/dashboard'}
             className={() =>
               `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                 isNavItemActive(item, pathname) ? 'text-accent' : 'text-dimmer hover:text-ink'
              }`
            }
          >
            <NavIcon name={item.icon} size={20} />
            <span className="font-mono text-[9px] uppercase tracking-[.05em]">
              {item.label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}