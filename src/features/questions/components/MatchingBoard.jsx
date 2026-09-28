// Komponen penjodohhan untuk builder dan attempt. Dua mode, satu bahasa visual
// dan satu alur interaksi supaya tidak ada dua sistem yang berbeda:
//
//   MatchingEditor - builder. Dua kolom bisa diketik, lalu disambung dengan
//                    seret-lepas, ketuk, atau keyboard.
//   MatchingAnswer - attempt. Teks item tidak bisa diubah, kolom kanan sudah
//                    diacak (lihat matchingPairs.js) dan tidak ada penanda
//                    benar/salah saat menjawab.
//
// Aksesibilitas: setiap aksi adalah <button> asli, jadi Tab + Enter/Space
// sudah jalan tanpa drag pun. Seret-lepas (HTML5 DnD) tidak jalan di layar
// sentuh, jadi ketuk adalah jalur utama di mobile, bukan cadangan.
import { useEffect, useRef, useState } from 'react';
import IconClose from '../../../shared/icons/IconClose.jsx';
import IconPlus from '../../../shared/icons/IconPlus.jsx';
import IconSwap from '../../../shared/icons/IconSwap.jsx';
import IconTrash from '../../../shared/icons/IconTrash.jsx';
import StatusNote from '../../../shared/ui/StatusNote.jsx';
import {
  MATCHING_MIN_PAIRS,
  addSlot,
  answerFromState,
  assignPair,
  assignedRightIndex,
  matchingCompletion,
  matchingStateForEditor,
  matchingStateFromAnswer,
  removeSlot,
  serializePairDraft,
  serializePairs,
  setLeftText,
  setRightText,
  unassignPair
} from '../utils/matchingPairs.js';

const DRAG_MIME = 'application/x-belajar-bersama-matching';

/** Alur "pilih kiri lalu pilih kanan", dipakai kedua mode. */
function useConnectFlow() {
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [draggingRight, setDraggingRight] = useState(null);
  const [dragOverLeft, setDragOverLeft] = useState(null);
  // Tanpa ini, menekan tombol kanan saat belum ada item kiri terpilih terlihat
  // seperti tidak merespons sama sekali: tidak ada yang berubah, tidak ada
  // penjelasan. Di desktop masih ada jalan lain (drag), tapi di layar sentuh
  // tidak ada — jadi pengguna bisa buntu. `notice` ditampilkan lewat
  // StatusNote dan dibersihkan begitu alur berjalan lagi.
  const [notice, setNotice] = useState(null);

  return {
    selectedLeft,
    notice,
    clearNotice: () => setNotice(null),
    // Prasyarat sebelum connects: item kiri harus terpilih. Mengembalikan false
    // kalau belum, supaya pemanggil bisa berhenti tanpa menutup feedback.
    requireLeft: () => {
      if (selectedLeft !== null) {
        setNotice(null);
        return true;
      }
      setNotice('Pilih atau ketuk kotak kiri dulu, baru pilih item kanan yang mau disambung.');
      return false;
    },
    selectLeft: (index) => {
      setNotice(null);
      setSelectedLeft((cur) => (cur === index ? null : index));
    },
    draggingRight,
    setDraggingRight,
    dragOverLeft,
    setDragOverLeft,
    connect: (state, leftIndex, rightIndex) => {
      setSelectedLeft(null);
      setDragOverLeft(null);
      setNotice(null);
      return assignPair(state, leftIndex, rightIndex);
    },
    clearDrag: () => {
      setDraggingRight(null);
      setDragOverLeft(null);
    }
  };
}

function dropHandlersFor(index, onDrop) {
  return {
    onDragOver: (e) => {
      e.preventDefault();
    },
    onDrop: (e) => {
      e.preventDefault();
      const raw = Number(e.dataTransfer?.getData(DRAG_MIME));
      if (Number.isInteger(raw) && raw >= 0) onDrop(raw);
    }
  };
}

function leftRowClass({ selected, connected, isDropTarget }) {
  if (selected || connected || isDropTarget) return 'border-accent bg-accentsoft';
  return 'border-line bg-bg2';
}

function MatchingShell({ leftTitle, rightTitle, hint, left, right }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="eyebrow">{leftTitle}</p>
          <div className="space-y-1.5">{left}</div>
        </div>
        <div className="space-y-1.5">
          <p className="eyebrow">{rightTitle}</p>
          <div className="space-y-1.5">{right}</div>
        </div>
      </div>
      {hint && <p className="text-[12px] text-dimmer">{hint}</p>}
    </div>
  );
}

function UnmatchButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="icon-btn shrink-0 text-dim transition hover:text-danger disabled:opacity-40"
    >
      <IconClose size={15} />
    </button>
  );
}

function ConnectedBadge({ right, onUnassign, leftLabel, disabled }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <IconSwap size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 truncate text-[13px] text-accent">{right}</span>
      <UnmatchButton label={`Lepas pasangan ${leftLabel}`} onClick={onUnassign} disabled={disabled} />
    </span>
  );
}

function ConnectButton({ selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-smc border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[.06em] transition disabled:opacity-40 ${
        // `--accent-solid` + `--on-accent`, bukan `bg-accent text-white`:
        // putih di atas #5b6ef5 hanya 4.21:1 dan gagal WCAG AA untuk teks kecil.
        selected
          ? 'border-accentsolid bg-accentsolid text-onaccent'
          : 'border-line bg-elevated text-dim hover:border-accent hover:text-accent'
      }`}
    >
      <IconSwap size={13} />
      {selected ? 'Pilih kanan' : 'Sambung'}
    </button>
  );
}

/** Penanda hasil di mode review (hanya setelah attempt selesai). */
function ReviewBadge({ correct }) {
  return (
    <span
      className={`shrink-0 rounded-smc border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[.06em] ${
        correct
          ? 'border-[color-mix(in_srgb,var(--ok)_34%,transparent)] bg-oksoft text-ok'
          : 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] bg-dangersoft text-danger'
      }`}
    >
      {correct ? 'Benar' : 'Belum tepat'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* BUILDER                                                            */
/* ------------------------------------------------------------------ */

export function MatchingEditor({ pairs, pairDraft, onChange, disabled = false }) {
  // Urutan baca state: `pairDraft` dulu (draft editor yang otoritatif), baru
  // `pairs`. Soal lama tanpa `pairDraft` otomatis pakai answer key-nya.
  const [state, setState] = useState(() => matchingStateForEditor(pairDraft, pairs));
  const stateRef = useRef(state);
  stateRef.current = state;
  // Perbandingan dirty memakai SELURUH state editor (serialisasi draft), bukan
  // hanya `pairs`. Kalau hanya `pairs` yang dibandingkan, perubahan yang tidak
  // menyentuh answer key - mengedit teks baris yang belum dipasangkan, atau
  // "Lepas pasangan" saat masih ada >= 2 pasangan - akan dianggap "tidak
  // berubah" lalu ditimpa kembali oleh props, dan draft-nya hilang.
  const lastEmitted = useRef(JSON.stringify(serializePairDraft(state)));
  const dirty = useRef(false);
  const flow = useConnectFlow();

  // Props berubah = perubahan dari luar (muat ulang, edit dari perangkat lain).
  // Draft lokal yang belum sempat tersimpan TIDAK boleh ditimpa di sini, jadi
  // kegagalan autosave tidak menghapus ketikan pengguna.
  useEffect(() => {
    const incoming = matchingStateForEditor(pairDraft, pairs);
    const propJson = JSON.stringify(serializePairDraft(incoming));
    if (propJson === lastEmitted.current) {
      dirty.current = false;
      return;
    }
    if (dirty.current) return;
    lastEmitted.current = propJson;
    setState(incoming);
  }, [pairs, pairDraft]);

  const update = (next) => {
    // Dua nilai sekaligus: answer key (hanya pasangan lengkap, untuk attempt &
    // grading) dan draft editor (SEMUA baris, termasuk yang belum dipasangkan).
    const answerKey = serializePairs(next);
    const draft = serializePairDraft(next);
    lastEmitted.current = JSON.stringify(draft);
    dirty.current = true;
    setState(next);
    onChange?.(answerKey, draft);
  };

  const status = matchingCompletion(state);
  const canRemove = state.lefts.length > MATCHING_MIN_PAIRS;

  return (
    <div className="space-y-2">
      <MatchingShell
        leftTitle="Item Kiri"
        rightTitle="Item Kanan (kunci jawaban)"
        hint="Ketik kedua kolom, lalu sambungkan: seret ikon panah ke kotak kiri, atau tekan Sambung lalu pilih item kanan. Satu item kanan hanya bisa dipakai satu kali."
        left={state.lefts.map((left, i) => {
          const rightIndex = assignedRightIndex(state, i);
          const connected = rightIndex !== -1;
          return (
            <div
              key={`l-${i}`}
              {...dropHandlersFor(i, (rightIdx) => update(flow.connect(stateRef.current, i, rightIdx)))}
              onDragEnter={() => flow.setDragOverLeft(i)}
              className={`flex min-h-[44px] items-center gap-2 rounded-smc border px-2.5 py-2 transition ${leftRowClass({
                selected: flow.selectedLeft === i,
                connected,
                isDropTarget: flow.dragOverLeft === i
              })}`}
            >
              <input
                type="text"
                value={left}
                disabled={disabled}
                placeholder="Ketik item kiri"
                aria-label={`Item kiri baris ${i + 1}`}
                onChange={(e) => update(setLeftText(stateRef.current, i, e.target.value))}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-dimmer focus:outline-none disabled:opacity-50"
              />
              {connected ? (
                <ConnectedBadge
                  leftLabel={left || `baris ${i + 1}`}
                  right={state.rights[rightIndex]}
                  disabled={disabled}
                  onUnassign={() => update(unassignPair(stateRef.current, i))}
                />
              ) : (
                <ConnectButton
                  selected={flow.selectedLeft === i}
                  disabled={disabled || !left.trim()}
                  onClick={() => flow.selectLeft(i)}
                />
              )}
            </div>
          );
        })}
        right={state.rights.map((right, j) => {
          const taken = state.assigned.findIndex((v) => v === j) !== -1;
          return (
            <div
              key={`r-${j}`}
              className={`flex min-h-[44px] items-center gap-2 rounded-smc border px-2.5 py-2 transition ${
                flow.draggingRight === j ? 'border-accent bg-accentsoft' : 'border-line bg-bg2'
              }`}
            >
              <button
                type="button"
                draggable={!disabled}
                disabled={disabled}
                onDragStart={(e) => {
                  e.dataTransfer?.setData(DRAG_MIME, String(j));
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  flow.setDraggingRight(j);
                }}
                onDragEnd={flow.clearDrag}
                onClick={() => {
                  if (!flow.requireLeft()) return;
                  update(flow.connect(stateRef.current, flow.selectedLeft, j));
                }}
                aria-label={`Sambungkan ${right || `item kanan baris ${j + 1}`}`}
                title="Seret ke kotak kiri, atau pilih kotak kiri lalu tekan ini"
                className="icon-btn shrink-0 text-dim transition hover:text-accent disabled:opacity-40"
              >
                <IconSwap size={15} />
              </button>
              <input
                type="text"
                value={right}
                disabled={disabled}
                placeholder="Ketik item kanan"
                aria-label={`Item kanan baris ${j + 1}`}
                onChange={(e) => update(setRightText(stateRef.current, j, e.target.value))}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-dimmer focus:outline-none disabled:opacity-50"
              />
              {taken && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] text-ok">
                  terpakai
                </span>
              )}
              {canRemove && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => update(removeSlot(stateRef.current, j))}
                  aria-label={`Hapus baris pasangan ${j + 1}`}
                  title="Hapus baris pasangan"
                  className="icon-btn shrink-0 text-dimmer transition hover:text-danger disabled:opacity-40"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          );
        })}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => update(addSlot(stateRef.current))}
        className="flex w-full items-center justify-center gap-1.5 rounded-smc border border-dashed border-line py-2 font-mono text-[11px] uppercase tracking-[.06em] text-dim transition hover:border-accent hover:text-accent disabled:opacity-40"
      >
        <IconPlus size={13} /> Tambah pasangan
      </button>
      {flow.notice && <StatusNote tone="warn">{flow.notice}</StatusNote>}
      {status.connected >= MATCHING_MIN_PAIRS ? (
        <StatusNote tone="ok">
          {status.connected} pasangan tersambung dan siap disimpan.
          {status.total - status.connected > 0 && (
            <> Baris yang belum disambung tetap ikut tersimpan sebagai draft.</>
          )}
        </StatusNote>
      ) : (
        <StatusNote tone="warn">
          Minimal {MATCHING_MIN_PAIRS} pasangan tersambung agar soal bisa disimpan dan dipakai. Saat ini{' '}
          {status.connected} dari {status.total} baris - sambungkan lagi atau hapus barisnya.
        </StatusNote>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ATTEMPT                                                            */
/* ------------------------------------------------------------------ */

export function MatchingAnswer({
  pairs,
  value,
  onChange,
  seed,
  disabled = false,
  review = false
}) {
  const flow = useConnectFlow();
  const clean = (Array.isArray(pairs) ? pairs : []).filter((p) => p?.left && p?.right);
  const [state, setState] = useState(() => matchingStateFromAnswer(clean, value, seed));
  const stateRef = useRef(state);
  stateRef.current = state;

  // Kalau nilai dari luar berubah (muat attempt/reset), ikut disinkronkan.
  // Setelah emit, nilainya sama dengan state jadi tidak terjadi loop.
  useEffect(() => {
    const incoming = JSON.stringify(value || {});
    if (incoming === JSON.stringify(answerFromState(stateRef.current))) return;
    setState(matchingStateFromAnswer(clean, value, seed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (next) => {
    setState(next);
    onChange?.(answerFromState(next));
  };

  const status = matchingCompletion(state);
  const pending = status.total - status.connected;
  const correctMap = new Map((Array.isArray(pairs) ? pairs : []).map((p) => [p.left, p.right]));

  return (
    <div className="space-y-2">
      <MatchingShell
        leftTitle="Pasangkan"
        rightTitle="Pilihan"
        hint="Ketuk kotak kiri lalu ketuk item yang tepat, atau seret ikon panah ke kotak kiri. Satu item hanya bisa dipakai satu kali."
        left={state.lefts.map((left, i) => {
          const rightIndex = assignedRightIndex(state, i);
          const connected = rightIndex !== -1;
          const correct = review && connectedMapHas(state, i, correctMap);
          return (
            <div
              key={`la-${i}`}
              {...dropHandlersFor(i, (rightIdx) => emit(flow.connect(stateRef.current, i, rightIdx)))}
              onDragEnter={() => flow.setDragOverLeft(i)}
              className={`flex min-h-[44px] items-center gap-2 rounded-smc border px-2.5 py-2 transition ${leftRowClass({
                selected: flow.selectedLeft === i,
                connected,
                isDropTarget: flow.dragOverLeft === i
              })}`}
            >
              <span className="min-w-0 flex-1 text-[14px] text-ink">{left}</span>
              {connected ? (
                <ConnectedBadge
                  leftLabel={left}
                  right={state.rights[rightIndex]}
                  disabled={disabled}
                  onUnassign={() => emit(unassignPair(stateRef.current, i))}
                />
              ) : (
                <ConnectButton
                  selected={flow.selectedLeft === i}
                  disabled={disabled}
                  onClick={() => flow.selectLeft(i)}
                />
              )}
              {review && <ReviewBadge correct={correct} />}
            </div>
          );
        })}
        right={state.rights.map((right, j) => {
          const taken = state.assigned.findIndex((v) => v === j) !== -1;
          return (
            <button
              key={`ra-${j}`}
              type="button"
              draggable={!disabled}
              disabled={disabled || taken}
              onDragStart={(e) => {
                e.dataTransfer?.setData(DRAG_MIME, String(j));
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                flow.setDraggingRight(j);
              }}
              onDragEnd={flow.clearDrag}
              onClick={() => {
                if (!flow.requireLeft()) return;
                emit(flow.connect(stateRef.current, flow.selectedLeft, j));
              }}
              aria-label={`Pasangkan ${right}`}
              aria-pressed={taken}
              className={`flex min-h-[44px] w-full items-center gap-2 rounded-smc border px-2.5 py-2 text-left transition disabled:cursor-not-allowed ${
                taken ? 'border-ok bg-oksoft' : flow.draggingRight === j ? 'border-accent bg-accentsoft' : 'border-line bg-bg2 hover:border-accent'
              }`}
            >
              <IconSwap size={15} className={`shrink-0 ${taken ? 'text-ok' : 'text-dim'}`} />
              <span className="min-w-0 flex-1 text-[14px] text-ink">{right}</span>
              {taken && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] text-ok">
                  terpakai
                </span>
              )}
            </button>
          );
        })}
      />
      {flow.notice && <StatusNote tone="warn">{flow.notice}</StatusNote>}
      {pending > 0 ? (
        <StatusNote tone="warn">
          {pending} dari {status.total} item belum dipasangkan. Soal tetap bisa dikirim, tapi
          pasangan yang kosong tidak dapat poin.
        </StatusNote>
      ) : (
        review && <StatusNote tone="ok">Semua item sudah dipasangkan.</StatusNote>
      )}
    </div>
  );
}

function connectedMapHas(state, leftIndex, correctMap) {
  const left = state.lefts[leftIndex];
  const rightIndex = assignedRightIndex(state, leftIndex);
  if (!left || rightIndex === -1) return false;
  return correctMap.get(left) === state.rights[rightIndex];
}
