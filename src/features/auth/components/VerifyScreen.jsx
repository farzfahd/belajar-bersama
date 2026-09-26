import { useCallback, useEffect, useState } from 'react';
import Button from '../../../shared/ui/Button';
import { useToast } from '../../../shared/components/ToastProvider';
import { USE_EMULATORS } from '../../../lib/firebase';
import { resendVerification, signOutCurrent } from '../services/authService';

// Khusus mode emulator lokal: menandai email terverifikasi lewat REST
// user-management emulator (email sungguhan tidak terkirim di emulator).
// Endpoint /emulator/v1/.../accounts/{uid} (PATCH) tidak tersedia di semua
// versi emulator (404); pola "Bearer owner" via accounts:update dipakai
// agar kompatibel lintas versi.
const EMULATOR_AUTH_BASE = 'http://127.0.0.1:9099';

async function markVerifiedInEmulator(user) {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-learning-berdua';
  const res = await fetch(
    `${EMULATOR_AUTH_BASE}/identitytoolkit.googleapis.com/v1/accounts:update?key=${projectId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner'
      },
      body: JSON.stringify({ localId: user.uid, emailVerified: true })
    }
  );
  if (!res.ok) throw new Error(`Emulator menolak: ${res.status}`);
}

export default function VerifyScreen({ user, onVerified }) {
  const toast = useToast();
  const [, force] = useState(0);
  const [sending, setSending] = useState(false);

  // reload() memperbarui profil user, TAPI klaim email_verified di ID
  // token lama sampai dipaksa refresh. Rules membaca
  // request.auth.token.email_verified, jadi sebelum lanjut wajib
  // getIdToken(true) agar token baru membawa klaim terverifikasi.
  const confirmVerified = useCallback(async (u) => {
    await u.reload();
    if (u.emailVerified) {
      await u.getIdToken(true);
      onVerified?.();
    }
  }, [onVerified]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (!user) return;
      confirmVerified(user).catch(() => {
        force((x) => x + 1);
      });
    }, 3000);
    return () => clearInterval(iv);
  }, [user, confirmVerified]);

  const resend = async () => {
    setSending(true);
    try {
      await resendVerification(user);
      toast.success('Email verifikasi dikirim ulang. Cek inbox Anda.');
    } catch (err) {
      toast.error(err.message || 'Gagal mengirim ulang.');
    } finally {
      setSending(false);
    }
  };

  const devVerify = async () => {
    setSending(true);
    try {
      await markVerifiedInEmulator(user);
      toast.success('Diverifikasi (mode emulator).');
      await confirmVerified(user);
    } catch (err) {
      toast.error(`Gagal menandai verifikasi di emulator: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="view-in card w-full max-w-sm space-y-4 text-center">
        <div className="text-3xl" aria-hidden="true">📧</div>
        <h1 className="font-head text-lg text-ink">Verifikasi email dulu</h1>
        <p className="text-[13.5px] leading-relaxed text-dim">
          Kami kirim link verifikasi ke <span className="text-ink">{user?.email}</span>.
          Setelah diklik, abaikan layar ini otomatis pindah. Tombol Verifikasi di
          pembuatan/join ruang belajar baru aktif setelah email terverifikasi.
        </p>

        <Button variant="ghost" className="w-full" onClick={resend} loading={sending}>
          Kirim ulang email verifikasi
        </Button>

        {USE_EMULATORS && (
          <button
            type="button"
             className="block min-h-[44px] w-full text-center text-[12.5px] text-warn underline-offset-2 hover:underline"
            onClick={devVerify}
          >
            (Dev/emulator) Tandai email terverifikasi
          </button>
        )}

        <button
          type="button"
           className="block min-h-[44px] w-full text-center text-[12.5px] text-dim underline-offset-2 hover:text-ink hover:underline"
          onClick={async () => {
            try {
              await signOutCurrent();
            } catch (err) {
              toast.error(err.message || 'Gagal keluar.');
            }
          }}
        >
          Keluar dan pakai akun lain
        </button>
      </div>
    </div>
  );
}