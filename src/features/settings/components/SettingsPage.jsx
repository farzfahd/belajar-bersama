import { IconSettings, IconThemeDark, IconThemeLight } from '../../../shared/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
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
import { leaveSpace, renameSpace, spaceRoles } from '../../space/services/spaceService';
import {
  resetPassword,
  signOutCurrent,
  updateProfile
} from '../../auth/services/authService';
import InviteCard from '../../space/components/InviteCard';
import ThemeSwitcher from './ThemeSwitcher';
import Modal from '../../../shared/ui/Modal';
import ConfirmDialog from '../../../shared/ui/ConfirmDialog';
import {
  AFTER_LEAVE_ROUTE,
  LEAVE_CONSEQUENCES,
  leaveEligibility
} from '../../space/utils/leave';
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
  const { mode, setMode } = useTheme();
  const { data: topics } = useTopics(spaceId);
  const { data: notes } = useNotes(spaceId);
  const { data: noteStates } = useNoteStates(spaceId);
  const { data: resources } = useResources(spaceId);
  const { data: resourceStates } = useResourceStates(spaceId);
  const [deleting, setDeleting] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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

  // ---- Keluar dari ruang (CP0) ----
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Kelayakan ditentukan dari data ruang yang sudah termuat: partner (indeks 1)
  // boleh keluar, pemilik (indeks 0) hanya mendapat penjelasan, dan saat data
  // belum siap tidak ada aksi yang ditampilkan (sama prinsipnya dengan guard InviteCard).
  const leaveState = leaveEligibility({ spaceId, space, uid: user?.uid });

  const doLeave = async () => {
    setLeaving(true);
    try {
      await leaveSpace(spaceId);
      setLeaveOpen(false);
      toast.success('Kamu telah keluar dari ruang belajar.');
      // SpaceGate subscribe users/{uid} (live): begitu spaceId = null ia
      // langsung merender OnboardingScreen menggantikan Outlet (tanpa
      // redirect melingkar); navigate ini hanya menormalkan URL.
      navigate(AFTER_LEAVE_ROUTE, { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal keluar dari ruang.'));
    } finally {
      setLeaving(false);
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

  // Aksi penghapusan akun: dua langkah, konfirmasi lalu JALANKAN. `window.confirm`
  // dihapus supaya destruktif ini memakai dialog yang sama dengan aksi lain dan
  // bisa menjelaskan konsekuensinya. Kegagalan TIDAK menutup dialog — errornya
  // ditampilkan di dalamnya supaya pengguna tahu akun belum terhapus.
  const runDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deletePersonalContent(spaceId, user.uid, { notes, resources, noteStates, resourceStates });
      await deleteAccountAfterContentCleanup();
      navigate('/', { replace: true });
    } finally {
      setDeleting(false);
    }
  };

  const requestDeleteAccount = () => {
    if (deletePhrase !== 'HAPUS AKUN') {
      toast.error('Ketik HAPUS AKUN untuk mengonfirmasi.');
      return;
    }
    setDeleteConfirm({
      title: 'Hapus akun dan materi pribadi?',
      body: 'Catatan, resource, dan status baca milikmu akan dihapus permanen, lalu akun ini dihapus dari Firebase Auth. Materi partner dan ruang bersama tidak disentuh. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Hapus akun',
      danger: true,
      onConfirm: runDeleteAccount
    });
  };

  const previewEmoji = avatar.trim();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="learning berdua · pengaturan"
        icon={<IconSettings size={26} />}
        title="Settings"
        description="Profil, ruang, tampilan, dan keamanan akun Anda."
      />

      {/* Profil */}
      <Section title="Profil" eyebrow="nama tampilan · avatar · warna identitas">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-head text-lg"
            style={{
              backgroundColor: `${color}22`,
              // Sama seperti Avatar: warna identitas polos hanya ~2:1 di atas
              // isian pucatnya saat light.
              color: `color-mix(in srgb, ${color} 50%, var(--text))`,
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

        {/* Keluar dari ruang (CP0): hanya partner; pemilik mendapat penjelasan. */}
        {leaveState.reason === 'partner' && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" onClick={() => setLeaveOpen(true)}>
              Keluar dari Ruang
            </Button>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-dimmer">
              Kamu keluar dari ruang ini tanpa menghapus data bersama, dan bisa bergabung
              kembali lewat undangan baru dari partner.
            </p>
          </div>
        )}
        {leaveState.reason === 'owner' && (
          <div className="border-t border-line pt-4">
            <p className="max-w-xl text-[12.5px] leading-relaxed text-dimmer">
              Pemilik ruang tidak dapat keluar secara langsung. Opsi pemindahan kepemilikan
              dan penghapusan ruang belum tersedia saat ini.
            </p>
          </div>
        )}

        <Modal
          open={leaveOpen}
          onClose={() => !leaving && setLeaveOpen(false)}
          title="Keluar dari ruang belajar?"
          subtitle={`Kamu akan keluar dari "${space?.name || 'ruang ini'}".`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setLeaveOpen(false)} disabled={leaving}>
                Batal
              </Button>
              <Button variant="danger" onClick={doLeave} loading={leaving}>
                Ya, keluar
              </Button>
            </>
          }
        >
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-dim">
            {LEAVE_CONSEQUENCES.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Modal>

        {space?.createdAt && (
          <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-dimmer">
            Dibuat {fmtDate(space.createdAt)}
          </p>
        )}
      </Section>

      {/* Tampilan — dua sumbu terpisah: tema (warna+font) di atas, mode
          terang/gelap di bawah. Keduanya independen, jadi memilih tema tidak
          mereset mode. */}
      <Section title="Tampilan" eyebrow="tema warna + mode terang / gelap">
        <ThemeSwitcher />
        <div>
          <div className="eyebrow mb-2 block">Mode</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === 'dark' ? 'primary' : 'ghost'}
              onClick={() => setMode('dark')}
            >
              <IconThemeDark size={15} /> Gelap
            </Button>
            <Button
              variant={mode === 'light' ? 'primary' : 'ghost'}
              onClick={() => setMode('light')}
            >
              <IconThemeLight size={15} /> Terang
            </Button>
          </div>
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
            <Button variant="danger" loading={deleting} onClick={requestDeleteAccount}>
              Hapus akun
            </Button>
          </div>
        </div>
      </Section>

      <ConfirmDialog action={deleteConfirm} onClose={() => setDeleteConfirm(null)} />
    </div>
  );
}

