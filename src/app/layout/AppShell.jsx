import { Outlet } from 'react-router-dom';
import Layout from './Layout';
import { useSpaceId } from '../../features/space/SpaceContext';

// Layout-route isi ruang: semua halaman konten dirender lewat <Outlet/>,
// spaceId diambil dari konteks (dipasok SpaceGate di router.jsx).
export default function AppShell() {
  const spaceId = useSpaceId();
  return (
    <Layout spaceId={spaceId}>
      <Outlet />
    </Layout>
  );
}