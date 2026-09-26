import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import SplashScreen from '../../../shared/components/SplashScreen';
import { useAuthState } from '../../auth/hooks/useAuthState';

const FEATURES = [
  {
    icon: '🗺️',
    label: 'Roadmap bersama',
    text: 'Pohon kurikulum 3 level dan kemajuan yang sinkron untuk berdua.'
  },
  {
    icon: '📒',
    label: 'Catatan & sumber',
    text: 'Notes, tautan sumber, status per topik — satu tempat belajarmu.'
  },
  {
    icon: '🧩',
    label: 'Berdua, bukan ramai',
    text: 'Ruang privat untuk kamu dan satu partner lewat undangan sekali pakai.'
  },
  {
    icon: '🔒',
    label: 'Data hanya untuk kalian',
    text: 'Keanggotaan ruang adalah satu-satunya kunci akses ke seluruh isinya.'
  }
];

const STEPS = [
  'Daftar & verifikasi email',
  'Buat ruang belajar, undang partner dengan kode (berlaku 24 jam)',
  'Susun roadmap, catat kemajuan, dan belajar bersama-sama'
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, initializing } = useAuthState();

  if (initializing) return <SplashScreen label="Menyiapkan sesi…" />;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <main className="view-in mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:py-16">
        <header className="text-center">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-dimmer">
            Buku belajar · privat · dua orang
          </div>
          <h1 className="mt-3 font-head text-[34px] text-ink sm:text-[40px]">Belajar Bersama</h1>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-dim">
            Ekosistem belajar bersama untuk kamu dan satu partner: roadmap, catatan, dan
            kemajuan dalam satu ruang privat.
          </p>
        </header>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="min-w-[132px]" onClick={() => navigate('/login')}>
            Masuk
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="min-w-[132px]"
            onClick={() => navigate('/daftar')}
          >
            Daftar
          </Button>
        </div>

        <section className="mt-12">
          <h2 className="eyebrow">Apa yang ada di dalamnya</h2>
          <div>
            {FEATURES.map((f) => (
              <div key={f.label} className="flex gap-4 border-b py-4">
                <span className="pt-0.5 text-xl" aria-hidden="true">
                  {f.icon}
                </span>
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">{f.label}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-dim">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="eyebrow">Cara mulai</h2>
          <ol className="border-b">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4 items-baseline border-b py-4 last:border-b-0">
                <span className="font-mono text-[12px] font-medium text-dimmer">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13.5px] text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[.1em] text-dimmer">
            berjalan penuh di mode emulator lokal · tanpa koneksi internet
          </p>
        </footer>
      </main>
    </div>
  );
}