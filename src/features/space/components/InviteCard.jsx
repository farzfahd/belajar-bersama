import { IconCopy, IconWarn } from '../../../shared/icons';
import { useEffect, useState } from 'react';
import Button from '../../../shared/ui/Button';
import { useToast } from '../../../shared/components/ToastProvider';
import { toErrorMessage } from '../../../shared/utils/errors';
import { generateInvite } from '../services/spaceService';
import { inviteReadiness } from '../utils/invite';

// Kartu "Undang partner". Tombol hanya aktif bila data ruang benar-benar siap
// (dokumen ruang termuat & tepat 1 anggota). Sebelumnya `disabled={roles?.filled}`
// bernilai false/undefined saat space masih null → tombol aktif, diklik, lalu
// ditolak rules (`memberIds.size() == 1`) dan muncul "Akses ditolak…".
export default function InviteCard({ spaceId, space, pending = false }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [copying, setCopying] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setCode(null);
  }, [spaceId]);

  const readiness = inviteReadiness({ spaceId, space, pending, generating });
  const showButton = readiness.reason === 'ok' || readiness.reason === 'generating';

  const make = async () => {
    if (!readiness.ready) return;
    setGenerating(true);
    try {
      const c = await generateInvite(spaceId);
      setCode(c);
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal membuat undangan.'));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Kode disalin.');
    } catch {
      toast.error('Gagal menyalin. Salin manual dari kotak di bawah.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-head text-[15px] text-ink">Undang partner</div>
          <div className="eyebrow mt-0.5">kode undangan sekali pakai</div>
        </div>
        {showButton && (
          <Button size="sm" variant="ghost" onClick={make} loading={generating} disabled={!readiness.ready}>
            {code ? 'Buat kode baru' : 'Buat kode'}
          </Button>
        )}
      </div>

      {!showButton ? (
        <p className="text-[13px] leading-relaxed text-dim">
          {readiness.reason === 'full'
            ? 'Ruang sudah penuh (2 anggota). Tidak bisa membuat undangan lagi.'
            : 'Memuat data ruang…'}
        </p>
      ) : code ? (
        <div className="space-y-3">
          <div className="rounded-smc border border-dashed border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-bg2 px-3 py-3 text-center font-mono text-[15px] tracking-wider text-accent break-all">
            {code}
          </div>
          <Button onClick={copy} loading={copying} variant="ghost" className="w-full">
            <IconCopy size={15} /> Salin kode
          </Button>
          <p className="flex gap-1.5 text-[12.5px] leading-relaxed text-warn">
            <IconWarn size={15} className="mt-0.5 shrink-0" />
            <span>Bagikan lewat kanal privat (chat langsung/WhatsApp), bukan media publik.
            Kode sekali pakai &amp; berlaku 24 jam — siapa pun yang memegangnya
            <b> sebelum dipakai</b> bisa bergabung mendahului Anda.</span>
          </p>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-dim">
          Buat kode acak (24+ karakter, aman kriptografis) untuk partner Anda bergabung.
          Kode otomatis kedaluwarsa dalam 24 jam.
        </p>
      )}
    </div>
  );
}