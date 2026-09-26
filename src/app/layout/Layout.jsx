import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import Drawer from './Drawer';

// Kerangka utama di dalam ruang: topbar + sidebar (desktop) + konten
// max-width 1100px + bottom-nav/drawer (mobile).
export default function Layout({ spaceId, children }) {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const openDrawer = useCallback(() => setDrawer(true), []);

  // Tutup drawer setiap pindah halaman.
  useEffect(() => {
    setDrawer(false);
  }, [loc.pathname]);

  return (
    <div className="app-shell bg-bg text-ink">
      <Topbar spaceId={spaceId} onOpenDrawer={openDrawer} drawerOpen={drawer} />
      <Drawer open={drawer} onClose={closeDrawer} />

      {/* Baris konten: mengisi sisa tinggi shell (flex-1 + min-h-0) sehingga
          main.app-main menjadi SATU scroll container. Jangan pakai
          min-h-[calc(100dvh-60px)] lagi: itu membuat halaman tumbuh penuh
          height dan memunculkan scrollbar kedua. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar spaceId={spaceId} />
        <main className="app-main min-w-0 flex-1">
          <div className="view-in mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}