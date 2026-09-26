import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import SplashScreen from '../../../shared/components/SplashScreen';
import { useToast } from '../../../shared/components/ToastProvider';
import { USE_EMULATORS } from '../../../lib/firebase';
import { toErrorMessage } from '../../../shared/utils/errors';
import { useAuthState } from '../hooks/useAuthState';
import {
  resetPassword,
  signIn,
  signInWithGoogle,
  signUp
} from '../services/authService';

const MIN_PASSWORD = 10;

export default function AuthScreen() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initializing } = useAuthState();
  // Mode ditentukan route: /login = masuk, /daftar = daftar (dua URL berbeda).
  const mode = location.pathname === '/daftar' ? 'signup' : 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Sudah ada sesi (baik verifikasi menunggu atau aktif): langsung ke aplikasi.
  if (initializing) return <SplashScreen label="Menyiapkan sesi…" />;
  if (user) return <Navigate to="/dashboard" replace />;

  const validate = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error('Masukkan alamat email yang valid.');
      return false;
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        toast.error('Nama tampilan wajib diisi.');
        return false;
      }
      if (password.length < MIN_PASSWORD) {
        toast.error(`Kata sandi minimal ${MIN_PASSWORD} karakter.`);
        return false;
      }
    } else if (!password) {
      toast.error('Kata sandi wajib diisi.');
      return false;
    }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await signUp(email.trim(), password, name.trim());
      // Masuk ke aplikasi; Gate/VerifyScreen menangani langkah berikutnya
      // (verifikasi email / onboarding) sesuai status akun.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err, mode === 'login' ? 'Gagal masuk. Coba lagi.' : 'Gagal mendaftar. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const doGoogle = async () => {
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal masuk dengan Google.'));
    } finally {
      setGoogleBusy(false);
    }
  };

  const doReset = async () => {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error('Isi email dulu, lalu klik Lupa kata sandi.');
      return;
    }
    try {
      await resetPassword(em);
      toast.success('Link reset dikirim. Cek inbox Anda.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal mengirim link reset.'));
    }
  };

  const googleDisabled = USE_EMULATORS;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="view-in w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-dimmer">
            Buku belajar · privat · dua orang
          </div>
          <h1 className="mt-2 font-head text-[24px] text-ink">Belajar Bersama</h1>
          <p className="mt-1 text-[13px] text-dim">
            Ekosistem belajar bersama untuk kamu dan satu partner
          </p>
        </div>

        <div className="card">
          <div className="mb-5 flex gap-6">
            {[
              { to: '/login', label: 'Masuk', key: 'login' },
              { to: '/daftar', label: 'Daftar', key: 'signup' }
            ].map((tab) => (
              <Link
                key={tab.key}
                to={tab.to}
                 className={`min-h-[44px] rounded-smc border-b-2 px-1 pb-2 text-[13.5px] font-semibold transition-colors duration-150 ${
                  mode === tab.key
                    ? 'border-accent text-ink'
                    : 'border-transparent text-dim hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <Input
                label="Nama tampilan"
                placeholder="mis. Andini"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="kamu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Input
              label="Kata sandi"
              type="password"
              placeholder={mode === 'signup' ? 'Minimal 10 karakter' : '••••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              hint={mode === 'signup' ? `Minimal ${MIN_PASSWORD} karakter.` : undefined}
            />

            <Button type="submit" loading={busy} className="w-full" size="lg">
              {mode === 'login' ? 'Masuk' : 'Daftar & verifikasi email'}
            </Button>
          </form>

          {mode === 'login' && (
            <button
              type="button"
               className="mx-auto block min-h-[44px] text-[13px] text-dim underline-offset-2 hover:text-ink hover:underline"
              onClick={doReset}
            >
              Lupa kata sandi?
            </button>
          )}

          <div className="flex items-center gap-3 text-[11px] text-dimmer">
            <span className="h-px flex-1 bg-line" />
            atau
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button
            variant="ghost"
            className="w-full"
            size="lg"
            onClick={doGoogle}
            loading={googleBusy}
            disabled={googleDisabled}
          >
            <span aria-hidden="true">G</span>{' '}
            {mode === 'login' ? 'Masuk dengan Google' : 'Daftar dengan Google'}
          </Button>
          {googleDisabled && (
            <p className="text-center text-[12px] text-dimmer">
              Google login nonaktif saat mode emulator lokal.
            </p>
          )}

          <p className="text-[12px] leading-relaxed text-dimmer">
            Email wajib diverifikasi sebelum membuat atau bergabung ke ruang belajar.
          </p>
        </div>
      </div>
    </div>
  );
}