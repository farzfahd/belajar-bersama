import { useState } from 'react';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import { useToast } from '../../../shared/components/ToastProvider';
import { toErrorMessage } from '../../../shared/utils/errors';
import { createSpace, joinSpaceByCode } from '../services/spaceService';
import { signOutCurrent } from '../../auth/services/authService';

export default function OnboardingScreen() {
  const toast = useToast();
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('Our Space');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    try {
      await signOutCurrent();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal keluar.'));
    }
  };

  const doCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createSpace(name);
      toast.success('Ruang belajar dibuat. Sekarang bagikan kode undangan ke partner.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal membuat ruang belajar.'));
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await joinSpaceByCode(code);
      toast.success('Berhasil bergabung ke ruang belajar!');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal bergabung.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="view-in w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={logout}>
            Keluar
          </Button>
        </div>
        <div className="space-y-5">
        <div className="text-center">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-dimmer">
            Langkah pertama
          </div>
          <h1 className="mt-2 font-head text-[22px] text-ink">Mari bangun ruang belajar</h1>
          <p className="mt-1 text-[13.5px] text-dim">
            Ekosistem belajar untuk kamu dan satu partner
          </p>
        </div>

        <div className="mb-1 flex gap-6">
          {[
            { key: 'create', label: '🆕 Buat ruang' },
            { key: 'join', label: '🔗 Gabung kode' }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
               className={`min-h-[44px] rounded-smc border-b-2 px-1 pb-2 text-[13.5px] font-semibold transition-colors duration-150 ${
                mode === tab.key
                  ? 'border-accent text-ink'
                  : 'border-transparent text-dim hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'create' ? (
          <form onSubmit={doCreate} className="card space-y-4">
            <Input
              label="Nama ruang belajar"
              placeholder="mis. Belajar Data Science"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
            <p className="text-[12.5px] leading-relaxed text-dimmer">
              Anda akan menjadi anggota pertama. Setelah ruang dibuat, bagikan kode undangan
              (berlaku 24 jam, sekali pakai) ke partner Anda lewat kanal privat.
            </p>
            <Button type="submit" loading={busy} className="w-full" size="lg">
              Buat ruang belajar
            </Button>
          </form>
        ) : (
          <form onSubmit={doJoin} className="card space-y-4">
            <Input
              label="Kode undangan"
              placeholder="Tulis kode dari partner Anda"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[12.5px] leading-relaxed text-dimmer">
              Kode hanya bisa dipakai satu kali dan kedaluwarsa setelah 24 jam.
              Anggota ketiga akan ditolak.
            </p>
            <Button type="submit" loading={busy} className="w-full" size="lg" disabled={!code.trim()}>
              Gabung ruang belajar
            </Button>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}