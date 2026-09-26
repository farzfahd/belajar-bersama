import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthState } from '../features/auth/hooks/useAuthState';
import { useProfile } from '../features/auth/hooks/useProfile';
import { ensureProfile } from '../features/auth/services/authService';
import AuthScreen from '../features/auth/components/AuthScreen';
import VerifyScreen from '../features/auth/components/VerifyScreen';
import OnboardingScreen from '../features/space/components/OnboardingScreen';
import { SpaceProvider } from '../features/space/SpaceContext';
import { useSpace } from '../features/space/hooks/useSpace';
import LandingPage from '../features/landing/components/LandingPage';
import AppShell from './layout/AppShell';
import ComingSoonPage from './layout/ComingSoonPage';
import DashboardPage from '../features/dashboard/components/DashboardPage';
import LearnPage from '../features/learn/components/LearnPage';
import NoteEditorPage from '../features/notes/components/NoteEditorPage';
import RoadmapPage from '../features/topics/components/RoadmapPage';
import TopicDetailPage from '../features/topics/components/TopicDetailPage';
import SettingsPage from '../features/settings/components/SettingsPage';
import ProgressPage from '../features/progress/components/ProgressPage';
import AchievementsPage from '../features/progress/components/AchievementsPage';
import { NAV } from './layout/navConfig';
import SplashScreen from '../shared/components/SplashScreen';
import { toErrorMessage } from '../shared/utils/errors';
import { useToast } from '../shared/components/ToastProvider';

// Kata kunci akses aplikasi: menampilkan LandingPage/AuthScreen/VerifyScreen,
// atau meneruskan ke route dalam ruang via <Outlet/> saat user terverifikasi.
function Gate() {
  const toast = useToast();
  const { user, initializing, refresh } = useAuthState();

  useEffect(() => {
    if (!user) return undefined;
    ensureProfile(user.uid).catch((err) => {
      toast.error(toErrorMessage(err, 'Gagal memuat profil.'));
    });
  }, [user?.uid, toast]);

  if (initializing) return <SplashScreen label="Menyiapkan sesi…" />;
  // Belum masuk: selalu kembali ke root (landing page) — tidak menyimpan
  // path sebelum logout.
  if (!user) return <Navigate to="/" replace />;

  if (!user.emailVerified) {
    return <VerifyScreen user={user} onVerified={refresh} />;
  }

  return <Outlet />;
}

// Layout-route ruang: OnboardingScreen bila belum punya ruang, atau
// menyediakan spaceId (context) untuk halaman-halaman di dalam AppShell.
// Jika profile.spaceId menunjuk dokumen space yang TIDAK ADA (mis. terhapus),
// dikembalikan ke Onboarding — menghindari banjir error "Akses ditolak"
// dari rules: pada dokumen yang hilang, isMemberOf gagal (rules fail-closed)
// sehingga deny tampil sebagai permission-denied, bukan "document missing".
function SpaceGate() {
  const { user } = useAuthState();
  const { data: profile, loading } = useProfile(user?.uid);
  const space = useSpace(profile?.spaceId);
  const spaceProblem =
    Boolean(profile?.spaceId) &&
    (space.errorCode === 'permission-denied' ||
      (!space.loading && !space.error && space.data === null));

  if ((loading && !profile) || (profile?.spaceId && !space.data && space.loading)) {
    return <SplashScreen label="Memuat ruang…" />;
  }
  if (!profile?.spaceId || spaceProblem) return <OnboardingScreen />;

  return (
    <SpaceProvider spaceId={profile.spaceId}>
      <Outlet />
    </SpaceProvider>
  );
}

export default function AppRoutes() {
  return (
    // BrowserRouter membuat URL bersih tanpa tanda hash.
    // "/" dan "/login" publik: landing page + layar masuk/daftar. Wajib didefinisikan
    // di atas route ber-`Gate` (pathless) agar pengunjung yang belum masuk tidak
    // dialihkan ke landing.
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthScreen />} />
        <Route path="/daftar" element={<AuthScreen />} />
        <Route element={<Gate />}>
          <Route element={<SpaceGate />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/notes/new" element={<NoteEditorPage />} />
              <Route path="/notes/:noteId" element={<NoteEditorPage />} />
              <Route path="/roadmap" element={<RoadmapPage />} />
              <Route path="/roadmap/:topicId" element={<TopicDetailPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/achievements" element={<AchievementsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {NAV.filter((n) => n.comingSoon).map((n) => (
                <Route key={n.key} path={n.path} element={<ComingSoonPage item={n} />} />
              ))}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
