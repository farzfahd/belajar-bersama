import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../../shared/components/Avatar';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import { useTheme } from '../../../app/providers';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useProfile } from '../../auth/hooks/useProfile';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { useSpaceId } from '../../space/SpaceContext';
import { renameSpace, spaceRoles } from '../../space/services/spaceService';
import {
  resetPassword,
  signOutCurrent,
  updateProfile
} from '../../auth/services/authService';
import InviteCard from '../../space/components/InviteCard';
import { toErrorMessage } from '../../../shared/utils/errors';
import { initialsOf } from '../../../shared/utils/identity';
import { fmtDate } from '../../../shared/utils/time';
import { IDENTITY } from '../../../lib/constants';
import { useNotes } from '../../notes/hooks/useNotes';
import { useNoteStates } from '../../notes/hooks/useNoteStates';
import { useResources } from '../../resources/hooks/useResources';
import { useResourceStates } from '../../resources/hooks/useResourceStates';
import { useTopics } from '../../topics/hooks/useTopics';
import {
  buildPersonalExport,
  deleteAccountAfterContentCleanup,
  deletePersonalContent,
  downloadJson
} from '../services/personalDataService';

function Section({ title, eyebrow, children }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="card space-y-4">
        {eyebrow && (
          <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-dimmer">
            {eyebrow}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

// Halaman Pengaturan: profil, informasi ruang, tema, keamanan, dan data.
export default function SettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuthState();
  const spaceId = useSpaceId();
  const profile = useProfile(user?.uid);
  const { data: space, pending } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const partner = useUserProfile(roles?.partner);
  const { theme, setTheme } = useTheme();
  const { data: topics } = useTopics(spaceId);
  const { data: notes } = useNotes(spaceId);
  const { data: noteStates } = useNoteStates(spaceId);
  const { data: resources } = useResources(spaceId);
  const { data: resourceStates } = useResourceStates(spaceId);
  const [deleting, setDeleting] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');

  // ---- Profil ----
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [color, setColor] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.displayName || '');
      setAvatar(profile.data.avatar || '');
      setColor(profile.data.color || IDENTITY.defaultColor);
    }
  }, [profile.data]);

  const saveProfile = async () => {
    const cleanName = name.trim().slice(0, 60);
    const cleanAvatar = avatar.trim().slice(0, 8);
    if (!cleanName) {
      toast.error('Nama tampilan tidak boleh kosong.');
      return;
    }
    if (
      cleanAvatar &&
      !/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}]+$/u.test(
        cleanAvatar
      )
    ) {
      toast.error('Avatar hanya boleh berisi emoji (atau kosong).');
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(user.uid, {
        displayName: cleanName,
        avatar: cleanAvatar,
        color: IDENTITY.colors.includes(color) ? color : IDENTITY.defaultColor
      });
      toast.success('Profil diperbarui.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal menyimpan profil.'));
    } finally {
      setSavingProfile(false);
    }
  };

  // ---- Nama ruang ----
  const [nameDraft, setNameDraft] = useState(space?.name || '');
  const [savingSpace, setSavingSpace] = useState(false);

  useEffect(() => {
    if (space?.name) setNameDraft(space.name);
  }, [space?.name]);

  const saveSpaceName = async () => {
    setSavingSpace(true);
    try {
      await renameSpace(spaceId, nameDraft);
      toast.success('Nama ruang diperbarui.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal mengubah nama ruang.'));
    } finally {
      setSavingSpace(false);
    }
  };

  const resetPass = async () => {
    try {
      await resetPassword(user?.email || '');
      toast.success('Tautan reset kata sandi dikirim ke email Anda.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal mengirim tautan reset.'));
    }
  };

  const logout = async () => {
    try {
      await signOutCurrent();
      // Keluar: kembali ke root (landing page), tidak menyimpan path sebelumnya.
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal keluar.'));
    }
  };

  const exportData = () => {
    const payload = buildPersonalExport({
      profile: profile.data,
      space: space ? { ...space, id: spaceId } : null,
      topics,
      notes,
      resources,
      noteStates,
      resourceStates
    });
    downloadJson(`belajar-bersama-${new Date().toISOString().slice(0, 10)}.json`, payload);
    toast.success('Export JSON diunduh ke perangkat ini.');
  };

  const deleteAccount = async () => {
    if (deletePhrase !== 'HAPUS AKUN') {
      toast.error('Ketik HAPUS AKUN untuk mengonfirmasi.');
      return;
    }
    if (!window.confirm('Hapus materi pribadi dan akun ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;
    setDeleting(true);
    try {
      await deletePersonalContent(spaceId, user.uid, { notes, resources, noteStates, resourceStates });
      await deleteAccountAfterContentCleanup();
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal menghapus akun. Jika diminta, masuk ulang lalu coba lagi.'));
    } finally {
      setDeleting(false);
    }
  };

  const previewEmoji = avatar.trim();

  return (
    <div className="space-y-8">
      <header className="card flex flex-col gap-1">
        <div className="eyebrow">learning berdua · pengaturan</div>
        <h1 className="font-head text-2xl text-ink">⚙️ Settings</h1>
        <p className="text-[13.5px] leading-relaxed text-dim">
          Profil, ruang, tampilan, dan keamanan akun Anda.
        </p>
      </header>

      {/* Profil */}
      <Section title="Profil" eyebrow="nama tampilan · avatar · warna identitas">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-head text-lg"
            style={{
              backgroundColor: `${color}22`,
              color,
              boxShadow: `inset 0 0 0 1px ${color}55`
            }}
          >
            {previewEmoji || initialsOf(name || '?')}
          </span>
          <div className="text-[13px] leading-relaxed text-dim">
            <b className="text-ink">{name.trim() || '…'}</b>
            <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
              tampil sebagai "Kamu" {roles?.filled ? '· partner aktif' : '· menunggu partner'}
            </div>
          </div>
        </div>

        <Input
          label="Nama tampilan"
          id="settings-displayname"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama yang dilihat partner"
        />
        <Input
          label="Avatar (emoji opsional)"
          id="settings-avatar"
          value={avatar}
          maxLength={8}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="Mis: 🧠 — kosong = inisial"
          hint="Kosongkan untuk memakai inisial nama."
        />

        <div>
          <div className="eyebrow mb-2 block">Warna identitas</div>
          <div className="flex flex-wrap gap-2.5">
            {IDENTITY.colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Pilih warna ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                 className={`h-11 w-11 rounded-full border transition ${
                  color === c
                    ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg'
                    : 'border-linestrong hover:border-ink'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="pt-1">
          <Button onClick={saveProfile} loading={savingProfile}>
            Simpan profil
          </Button>
        </div>
      </Section>

      {/* Ruang */}
      <Section title="Ruang" eyebrow={`${roles?.filled ? 'partner lengkap' : 'menunggu partner'} · ${roles?.filled ? 2 : 1}/2 anggota`}>
        <div>
          <div className="eyebrow mb-2 block">Nama ruang</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
               className="min-h-[44px] w-full max-w-sm rounded-smc border border-linestrong bg-bg2 px-3 text-[14px] text-ink"
              value={nameDraft}
              maxLength={60}
              onChange={(e) => setNameDraft(e.target.value)}
              aria-label="Nama ruang"
            />
            <Button size="sm" onClick={saveSpaceName} loading={savingSpace}>
              Simpan
            </Button>
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
            default: Our Space · {pending ? 'menyimpan…' : 'tersinkron'}
          </p>
        </div>

        <div className="flex flex-wrap justify-between gap-4">
          {[['me', profile.data, 'Kamu'], ['partner', partner.data, 'Partner']].map(
            ([who, p, label]) => {
              const uid = who === 'me' ? user?.uid : roles?.partner;
              return (
                <div key={who} className="flex items-center gap-3">
                  <Avatar name={p?.displayName || label} color={p?.color} size={40} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">
                        {p?.displayName || (uid ? 'Memuat…' : '—')}
                      </span>
                      <Badge tone={who === 'me' ? 'accent' : 'dim'}>{label}</Badge>
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
                      {uid || 'belum ada'}
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>

        <InviteCard spaceId={spaceId} space={space} pending={pending} />

        {space?.createdAt && (
          <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
            Dibuat {fmtDate(space.createdAt)}
          </p>
        )}
      </Section>

      {/* Tampilan */}
      <Section title="Tampilan" eyebrow="tema terang / gelap">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={theme === 'dark' ? 'primary' : 'ghost'}
            onClick={() => setTheme('dark')}
          >
            🌙 Gelap
          </Button>
          <Button
            variant={theme === 'light' ? 'primary' : 'ghost'}
            onClick={() => setTheme('light')}
          >
            ☀️ Terang
          </Button>
        </div>
      </Section>

      {/* Keamanan */}
      <Section title="Keamanan" eyebrow="email · kata sandi · sesi">
        <p className="text-[13px] leading-relaxed text-dim">
          Masuk sebagai <b className="text-ink">{user?.email}</b> (email{' '}
          {user?.emailVerified ? 'terverifikasi' : 'belum diverifikasi'}).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={resetPass}>
            Kirim tautan reset kata sandi
          </Button>
          <Button variant="danger" onClick={logout}>
            Keluar
          </Button>
        </div>
        <p className="text-[12.5px] leading-relaxed text-dimmer">
          Tanpa Admin SDK, "keluar dari semua perangkat" tidak tersedia. Jika akun diduga
          dipakai orang lain, segera <b className="text-ink">ganti kata sandi</b> lewat tautan
          reset di atas — sesi perangkat lain akan ditolak. Tidak ada MFA SMS di paket Spark;
          sarankan memakai akun Google yang sudah aktif 2-Step Verification.
        </p>
      </Section>

      {/* Data */}
      <Section title="Data" eyebrow="ekspor & hapus data">
        <p className="text-[13px] leading-relaxed text-dim">
          Export berisi data yang dapat dibaca akun ini. Penghapusan hanya menghapus materi
          milikmu; ruang bersama serta materi partner tidak disentuh.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportData}>Unduh export JSON</Button>
        </div>
        <div className="border-t border-line pt-4">
          <div className="eyebrow mb-2">Hapus akun sendiri</div>
          <p className="text-[12.5px] leading-relaxed text-dimmer">
            Ketik <b className="text-ink">HAPUS AKUN</b>. Penghapusan ruang penuh atau data partner
            tidak didukung oleh Rules dan tidak akan dilakukan.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-h-[44px] w-full max-w-xs rounded-smc border border-linestrong bg-bg2 px-3 text-[13px] text-ink"
              value={deletePhrase}
              onChange={(event) => setDeletePhrase(event.target.value)}
              placeholder="HAPUS AKUN"
              aria-label="Konfirmasi hapus akun"
            />
            <Button variant="danger" loading={deleting} onClick={deleteAccount}>
              Hapus akun
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

