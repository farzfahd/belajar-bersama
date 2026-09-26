import { useEffect, useState } from 'react';
import Button from '../../../shared/ui/Button';
import { useToast } from '../../../shared/components/ToastProvider';
import { toErrorMessage } from '../../../shared/utils/errors';
import { generateInvite } from '../services/spaceService';

export default function InviteCard({ spaceId, disabled }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [copying, setCopying] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setCode(null);
  }, [spaceId]);

  const make = async () => {
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
        {!disabled && (
          <Button size="sm" variant="ghost" onClick={make} loading={generating} disabled={disabled}>
            {code ? 'Buat kode baru' : 'Buat kode'}
          </Button>
        )}
      </div>

      {disabled ? (
        <p className="text-[13px] text-dim">
          Ruang sudah penuh (2 anggota). Tidak bisa membuat undangan lagi.
        </p>
      ) : code ? (
        <div className="space-y-3">
          <div className="rounded-smc border border-dashed border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-bg2 px-3 py-3 text-center font-mono text-[15px] tracking-wider text-accent break-all">
            {code}
          </div>
          <Button onClick={copy} loading={copying} variant="ghost" className="w-full">
            ⧉ Salin kode
          </Button>
          <p className="text-[12.5px] leading-relaxed text-warn">
            ⚠️ Bagikan lewat kanal privat (chat langsung/WhatsApp), bukan media publik.
            Kode sekali pakai &amp; berlaku 24 jam — siapa pun yang memegangnya
            <b> sebelum dipakai</b> bisa bergabung mendahului Anda.
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