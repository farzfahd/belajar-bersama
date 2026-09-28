import { useEffect, useId, useRef, useState } from 'react';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconFlag,
  IconMenu,
  IconSettings,
  IconTrash,
  IconWarn
} from '../../../shared/icons';
import Badge from '../../../shared/ui/Badge';
import { QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../../../lib/constants';
import { createQuestion, updateQuestion } from '../../questions/services/questionService';
import {
  applyTypeChange,
  checkQuestionComplete,
  hasDataForType,
  questionPayloadKey
} from '../utils/questionCard';
import QuestionCardTypeFields from './QuestionCardTypeFields';
import QuestionCardDetails from './QuestionCardDetails';

const AUTOSAVE_DELAY = 800;

// Kartu soal inline (gaya Google Forms) — satu unit edit mandiri.
//
// BENTUK: satu kartu = satu soal, digambar sebagai kotak berbatas jelas
// (`border-line` + `rounded-smc` + `bg-panel`, semua token yang sudah dipakai
// halaman lain) karena daftar soal dibaca sebagai daftar unit, bukan satu blok
// teks panjang. Penomoran memakai `SOAL N` mono uppercase supaya unit mana yang
// sedang dikerjakan terlihat sekilas, tanpa memakai heading besar.
//
// AUTOSAVE: tidak ada tombol "Simpan". Setiap perubahan memicu debounce 800ms,
// lalu write kalau draft sudah LENGKAP (`checkQuestionComplete`, yang memakai
// `buildTypeFields` — sumber validasi tunggal). Selama belum lengkap kartu
// menampilkan hint, bukan error: setengah jadi lebih tenang daripada error.
// Kegagalan write (permission/offline) tampil sebagai indikator di kartu ini
// saja, TIDAK lewat toast global yang mengganggu semua kartu.
//
// KETENANGAN SAAT SAVE: kartu tidak boleh bergerak, menutup, atau kehilangan isi
// karena autosave. Tiga hal yang menjaganya: (1) `persistedId` menyimpan id
// permanen di dalam kartu supaya save berikutnya jadi update, bukan create lagi;
// (2) draft lokal menjadi sumber kebenaran begitu kartu disentuh, jadi snapshot
// dari server tidak menimpa ketikan yang belum tersimpan; (3) kunci React
// dijaga oleh `cardKeyOf` di halaman editor, sehingga kartu tidak remount.
//
// URUTAN: drag handle (HTML5 native) dan tombol panah Naik/Turun adalah DUA
// jalan menuju aksi yang sama, bukan salah satu menggantikan yang lain. Tombol
// panah tetap ada karena drag tidak bisa dipakai keyboard.
export default function QuestionCard({
  draft: initialDraft,
  questionId = null,
  index = 0,
  total = 1,
  topics = [],
  spaceId = '',
  locked = false,
  draggable = false,
  canMoveUp = false,
  canMoveDown = false,
  onDraftChange,
  onSaved,
  onRemove,
  onDuplicate,
  onReport,
  onMove,
  onMoveStep,
  autoFocus = false
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [expanded, setExpanded] = useState(autoFocus);
  const [showDetails, setShowDetails] = useState(false);
  // Awalan id unik per kartu untuk field di "Detail lanjutan". Harus stabil
  // selama kartu hidup: kalau ikut berubah saat pindah/reorder, id lama bisa
  // bentrok dengan kartu yang sekarang memakai prefix yang sama. `useId()`
  // memberi prefix yang pasti unik untuk seumur hidup komponen ini.
  const uid = useId();
  const detailIdPrefix = `qc${uid}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | saving | saved | error | incomplete
  const [hint, setHint] = useState('');
  const [typeWarning, setTypeWarning] = useState(null);
  // Id permanen dari create pertama. Disimpan di DALAM kartu supaya parent
  // tidak perlu menukar `questionId` yang membuat kartu remount: setelah id
  // diperoleh, save berikutnya cukup update dokumen yang sama.
  const [persistedId, setPersistedId] = useState(questionId);
  const promptRef = useRef(null);
  const lastSavedRef = useRef('');
  const locallyEditedRef = useRef(false);
  const syncedKeyRef = useRef('');

  const incomingKey = questionPayloadKey(initialDraft);

  // Snapshot dari server HANYA dipasang kalau isinya benar-benar berubah dan
  // kartu belum pernah disentuh user. Tanpa guard ini, satu re-render parent
  // (kartu lain selesai autosave) akan mengembalikan ketikan yang belum
  // tersimpan — persis yang harus dicegah saat ini.
  useEffect(() => {
    if (incomingKey === syncedKeyRef.current) return;
    if (locallyEditedRef.current) return;
    syncedKeyRef.current = incomingKey;
    setDraft(initialDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  // Fokus otomatis ke input pertanyaan untuk kartu baru.
  useEffect(() => {
    if (autoFocus && promptRef.current) promptRef.current.focus();
  }, [autoFocus]);

  const check = checkQuestionComplete(draft);
  const payloadKey = questionPayloadKey(draft);

  // ---- Autosave independen per kartu -------------------------------------
  useEffect(() => {
    if (locked) return undefined;
    if (!check.ok) {
      setState('incomplete');
      setHint(check.error);
      return undefined;
    }
    if (payloadKey === lastSavedRef.current) return undefined;

    setState('saving');
    const timer = setTimeout(async () => {
      try {
        if (persistedId) {
          await updateQuestion(spaceId, persistedId, draft);
        } else {
          const newId = await createQuestion(spaceId, draft);
          lastSavedRef.current = payloadKey;
          setState('saved');
          // Id baru langsung diingat di kartu: save berikutnya meng-update
          // dokumen ini, bukan membuat dokumen kedua untuk soal yang sama.
          setPersistedId(newId);
          onSaved?.(newId);
          return;
        }
        lastSavedRef.current = payloadKey;
        setState('saved');
      } catch (e) {
        setState('error');
        setHint(e?.message || 'Gagal menyimpan. Cek koneksi.');
      }
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, persistedId, locked]);

  // Draft yang sudah tersimpan tidak perlu indicator error basi.
  useEffect(() => {
    if (state !== 'error' && check.ok) setHint('');
    if (check.ok) setState((s) => (s === 'incomplete' ? 'idle' : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.ok]);

  const patch = (next) => {
    locallyEditedRef.current = true;
    // Tandai isi lokal sebagai yang sudah diketahui supaya snapshot lama dari
    // server tidak ikut menimpa saat parent render ulang.
    syncedKeyRef.current = questionPayloadKey(next);
    setDraft(next);
    onDraftChange?.(next);
  };

  const changeType = (nextType) => {
    if (nextType === draft.type || nextType === 'pending') return;
    // Ganti tipe hanya perlu konfirmasi kalau ada data lama yang akan hilang —
    // kartu yang masih kosong langsung berganti tanpa tanya.
    if (hasDataForType(draft.type, draft, nextType)) {
      setTypeWarning(nextType);
    } else {
      patch(applyTypeChange(draft, nextType));
    }
  };

  const confirmTypeChange = () => {
    const nextType = typeWarning;
    setTypeWarning(null);
    if (!nextType) return;
    patch(applyTypeChange(draft, nextType));
  };

  const toggle = (e) => {
    if (locked) return;
    setExpanded((v) => !v);
  };

  // Reorder lewat HTML5 drag events (native, tanpa dependency baru). Tombol
  // panah di samping drag handle memanggil `onMoveStep` dengan logika yang sama
  // (`moveQuestionIdAt`) — drag adalah tambahan, bukan pengganti tombol.
  const onDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  const onDrop = (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isInteger(from) && from !== index) onMove?.(from, index);
  };

  const typeLabel = QUESTION_TYPE_LABELS[draft.type] || draft.type;
  const preview = String(draft.prompt || '').trim() || '(pertanyaan kosong)';

  // Indikator autosave — kecil, di pojok header. Setiap state punya ikon +
  // teks, jadi tidak bergantung pada warna saja (kuning = belum lengkap,
  // hijau = tersimpan, merah = gagal, abu = sedang menyimpan).
  const statusChip = () => {
    if (locked) return null;
    const chip = (tone, label, Icon) => (
      <span
        className={`inline-flex items-center gap-1 font-mono text-[10.5px] uppercase ${tone}`}
        role="status"
      >
        <Icon size={12} />
        {label}
      </span>
    );
    if (state === 'saving') return chip('text-dim', 'menyimpan…', IconSettings);
    if (state === 'error') return chip('text-danger', 'gagal menyimpan', IconWarn);
    if (state === 'incomplete') return chip('text-warn', 'belum lengkap', IconWarn);
    if (state === 'saved') return chip('text-ok', 'tersimpan', IconCheck);
    return null;
  };

  return (
    <li className="rounded-smc border border-line bg-panel px-4 py-3.5">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-2">
        {draggable && (
          <span
            draggable
            onDragStart={onDragStart}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            title="Seret untuk mengurutkan"
            aria-label="Seret untuk mengurutkan soal"
            className="cursor-grab px-1 text-dimmer transition hover:text-dim active:cursor-grabbing"
          >
            <IconMenu size={15} />
          </span>
        )}

        {/* Tombol panah: alternatif yang bisa diakses keyboard / tanpa drag.
            Diletakkan tepat di samping drag handle, dan memakai util urutan
            yang sama sehingga hasilnya identik dengan drag. */}
        {draggable && (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onMoveStep?.(-1)}
              disabled={!canMoveUp}
              title={canMoveUp ? 'Naikkan soal' : 'Sudah soal pertama'}
              aria-label={`Naikkan soal nomor ${index + 1}`}
              className="p-1 text-dimmer transition hover:text-dim disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMoveStep?.(1)}
              disabled={!canMoveDown}
              title={canMoveDown ? 'Turunkan soal' : 'Sudah soal terakhir'}
              aria-label={`Turunkan soal nomor ${index + 1}`}
              className="p-1 text-dimmer transition hover:text-dim disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconArrowDown size={14} />
            </button>
          </span>
        )}
        {/* Penomoran unit: mono uppercase agar jelas tanpa jadi heading besar. */}
        <span className="eyebrow shrink-0 text-[12.5px] text-ink">Soal {index + 1}</span>

        {/* Baris ringkas: hanya saat collapsed. */}
        {!expanded && (
          <button
            type="button"
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{preview}</span>
            <Badge tone="dim">{typeLabel}</Badge>
            <Badge tone="dim">{draft.points ?? 10} poin</Badge>
          </button>
        )}

        {expanded && <span className="min-w-0 flex-1" />}

        <span className="shrink-0">{statusChip()}</span>

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          title="Detail lanjutan"
          aria-label="Detail lanjutan"
          className={`shrink-0 p-1 transition ${showDetails ? 'text-accent' : 'text-dimmer hover:text-dim'}`}
        >
          <IconSettings size={15} />
        </button>

        {/* Kebab menu: duplikat / hapus. */}
        {!locked && (
          <span className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Menu soal"
              aria-label="Menu soal"
              className="p-1 text-dimmer transition hover:text-dim"
            >
              <IconMenu size={15} />
            </button>
            {menuOpen && (
              <>
                <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <span className="absolute right-0 top-full z-20 mt-1 flex w-40 flex-col rounded-smc border border-linestrong bg-panel py-1 shadow-card">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate?.();
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-panel2"
                  >
                    <IconCopy size={14} /> Duplikat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRemove?.();
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-danger hover:bg-panel2"
                  >
                    <IconTrash size={14} /> Hapus dari kuis
                  </button>
                  {onReport && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onReport();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-panel2"
                    >
                      <IconFlag size={14} /> Lapor soal ini
                    </button>
                  )}
                </span>
              </>
            )}
          </span>
        )}

        <button
          type="button"
          onClick={toggle}
          title={expanded ? 'Ciutkan' : 'Buka'}
          aria-label={expanded ? 'Ciutkan kartu' : 'Buka kartu'}
          className="shrink-0 p-1 text-dimmer transition hover:text-dim"
        >
          <IconChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3.5 space-y-4">
          {/* Konfirmasi ganti tipe (inline, bukan modal). */}
          {typeWarning && (
            <div className="rounded-smc border border-[color-mix(in_srgb,var(--warn)_50%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2">
              <p className="text-[12.5px] text-ink">
                Ganti tipe ke <strong>{QUESTION_TYPE_LABELS[typeWarning]}</strong> akan menghapus jawaban yang
                sudah diisi. Lanjutkan?
              </p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={confirmTypeChange}
                  className="text-[12.5px] text-accent underline-offset-2 hover:underline"
                >
                  Ya, ganti tipe
                </button>
                <button
                  type="button"
                  onClick={() => setTypeWarning(null)}
                  className="text-[12.5px] text-dimmer underline-offset-2 hover:underline"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* Baris tipe — dropdown compact, bukan grid kartu. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              value={draft.type || 'single'}
              disabled={locked}
              onChange={(e) => changeType(e.target.value)}
              aria-label="Tipe soal"
              className="rounded-smc border border-line bg-bg2 px-2 py-1 text-[13px] text-ink disabled:opacity-60"
            >
              {Object.keys(QUESTION_TYPES).map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {/* Poin selalu terlihat ringkas di header area — sering diubah. */}
            <label className="flex items-center gap-1.5">
              <span className="eyebrow">Poin</span>
              <input
                type="number"
                min="1"
                max="100"
                value={draft.points ?? 10}
                disabled={locked}
                onChange={(e) => patch({ ...draft, points: e.target.value })}
                aria-label="Poin soal"
                className="w-16 rounded-smc border-b border-linestrong bg-transparent px-1 py-0.5 text-[13px] text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          {/* Input pertanyaan — auto-grow, gaya Forms (garis bawah, tanpa kotak). */}
          <textarea
            ref={promptRef}
            value={draft.prompt || ''}
            disabled={locked}
            onChange={(e) => {
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
              patch({ ...draft, prompt: e.target.value });
            }}
            rows={2}
            placeholder="Tulis pertanyaan di sini… (Markdown + LaTeX didukung)"
            aria-label="Teks pertanyaan"
            className="min-h-[2.75rem] w-full resize-none rounded-smc border-b-2 border-linestrong bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
          />

          {/* Field khusus tipe — langsung tampil, tanpa expand tambahan. */}
          <QuestionCardTypeFields value={draft} onChange={patch} disabled={locked} />

          {/* Detail lanjutan — collapsed by default. */}
          {showDetails && (
        <QuestionCardDetails
          idPrefix={detailIdPrefix}
          value={draft}
          onChange={patch}
          topics={topics}
          disabled={locked}
        />
      )}

          {/* Hint kelengkapan / error — per kartu, bukan toast global. */}
          {hint && (
            <p className={`text-[12px] ${state === 'error' ? 'text-danger' : 'text-warn'}`}>{hint}</p>
          )}
        </div>
      )}
    </li>
  );
}
