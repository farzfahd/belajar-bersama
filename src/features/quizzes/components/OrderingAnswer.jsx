// Komponen jawaban untuk soal "mengurutkan" (ordering) di sisi attempt.
//
// Versi lama merender `question.items` sebagai `<ul>` statis: item kunci
// jawaban tampil apa adanya, tidak ada satu pun jalur untuk mengubahnya, dan
// jawaban kosong ikut terhitung "Benar" saat review. Komponen ini menggantinya
// dengan daftar yang benar-benar bisa disusun peserta.
//
// Aksesibilitas:
//   - setiap baris adalah `<li>` dengan `tabIndex`, jadi bisa difokuskan;
//   - tombol Naik/Turun adalah `<button>` asli (44px, `icon-btn`) dengan
//     `aria-label` yang menyebut nama item — jalur utama di layar sentuh;
//   - panah atas/bawah saat baris difokuskan memindahkan item;
//   - fokus mengikuti item yang baru dipindah, karena tombol Naik di posisi teratas
//     (dan tombol Turun di posisi terbawah) otomatis jadi disabled — tanpa
//     pemindahan fokus, alur keyboard terputus tepat di batas daftar;
//   - perubahan urutan diumumkan lewat `aria-live="polite"`.
//
// Urutan item, validasi, dan penilaian review ada di `orderingAnswer.js` supaya
// bisa diuji tanpa DOM.
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp } from '../../../shared/icons';
import StatusNote from '../../../shared/ui/StatusNote.jsx';
import {
  cleanOrderingItems,
  moveOrderingItem,
  moveTargetFromKey,
  orderingReviewOutcome,
  orderingStateFromAnswer,
  sameOrder
} from '../../questions/utils/orderingAnswer.js';

const DRAG_MIME = 'application/x-belajar-bersama-ordering';

/** Penanda posisi benar/salah, hanya muncul setelah attempt selesai. */
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

function MoveButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="icon-btn shrink-0 text-dim transition hover:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function OrderingAnswer({ question, value, onChange, review = false, disabled = false }) {
  // Dua sumber data, dan ini bukan detail kecil:
  //   `orderItems` - himpunan item, TANPA urutan benar. Ada di entri snapshot v3
  //                  dan di dokumen soal publik.
  //   `items`      - urutan BENAR. Hanya ada di dokumen privat / entri v2.
  //
  // Kalau `items` ikut dipakai sebagai sumber daftar pada entri v3, urutan
  // benar ikut tampil di layar peserta. Karena itu daftar selalu dibangun dari
  // `orderItems` dulu; `items` hanya jadi sumber pada soal lama yang belum punya
  // `orderItems` (kuncinya sudah dipisah ke dokumen privat barunya).
  const pool = useMemo(
    () => cleanOrderingItems(question?.orderItems ?? question?.items),
    [question?.orderItems, question?.items]
  );
  // Penanda "Benar/Belum tepat" hanya boleh muncul kalau kunci benar-benar ada.
  const hasKey = useMemo(
    () => cleanOrderingItems(question?.items).length > 0,
    [question?.items]
  );
  const seed = question?.id || question?.questionId || 'q';
  const [state, setState] = useState(() => orderingStateFromAnswer(pool, value, seed));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [notice, setNotice] = useState('');
  const [focusIndex, setFocusIndex] = useState(null);
  const rowRefs = useRef([]);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Nilai dari luar berubah: jawaban tersimpan (reload, pindah soal, atau
  // kembali dari soal lain). Urutan sama -> tidak ada yang perlu di-setState,
  // jadi tidak ada loop antara efek ini dan `applyMove`.
  useEffect(() => {
    const incoming = orderingStateFromAnswer(pool, value, seed);
    if (sameOrder(incoming.order, stateRef.current.order)) return;
    setState(incoming);
  }, [value, pool, seed]);

  // Fokus mengikuti item yang dipindah.
  useEffect(() => {
    if (focusIndex === null) return;
    rowRefs.current[focusIndex]?.focus();
    setFocusIndex(null);
  }, [focusIndex]);

  // Di review tidak ada yang boleh diedit, dan tanpa item tidak ada yang bisa
  // disusun. Keduanya membuat daftar interaktif tidak perlu dirender sama sekali.
  const canEdit = !review && !disabled && pool.length > 0;

  if (!pool.length) {
    return (
      <StatusNote tone="warn">
        Soal ini tidak punya item untuk disusun, jadi tidak bisa dijawab.
      </StatusNote>
    );
  }

  const applyMove = (from, to, followFocus) => {
    const current = stateRef.current.order;
    const next = moveOrderingItem(current, from, to);
    if (next === current) return;
    setState({ order: next, answered: true });
    onChange?.(next);
    setNotice(`"${String(next[to])}" dipindahkan ke posisi ${to + 1}.`);
    if (followFocus) setFocusIndex(to);
  };

  const onRowKeyDown = (i) => (event) => {
    if (!canEdit) return;
    const target = moveTargetFromKey(event.key, i, pool.length);
    if (target === null) return;
    // Tanpa preventDefault, panah ikut menggulir halaman.
    event.preventDefault();
    applyMove(i, target, true);
  };

  // ---- Review: yang ditampilkan HANYA jawaban peserta (`value`), bukan state
  // daftar lokal, supaya penanda posisi selalu dibandingkan dengan jawaban yang
  // benar-benar dinilai. Kalau tidak dijawab, tidak ada daftar sama sekali —
  // tidak ada satu pun baris yang bisa terlihat "Benar".
  if (review) {
    const outcome = orderingReviewOutcome(question?.items, value);
    if (!outcome.answered) {
      return (
        <StatusNote tone="warn" title="Tidak dijawab">
          Soal ini tidak dijawab, jadi nilainya 0.
        </StatusNote>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1.5">
          {outcome.positions.map((correct, i) => (
            <li
              key={`or-${i}-${String(value[i])}`}
              className="flex min-h-[44px] items-center gap-2 rounded-smc border border-linestrong bg-bg2 px-2.5 py-2 text-[14px]"
            >
              <span className="w-5 shrink-0 text-center font-mono text-[12px] text-dimmer">{i + 1}</span>
              <span className="min-w-0 flex-1 text-ink">{String(value[i])}</span>
              {hasKey && <ReviewBadge correct={correct} />}
            </li>
          ))}
        </ul>
        {hasKey && (
          <StatusNote tone={outcome.correctCount === outcome.total ? 'ok' : 'warn'}>
            {outcome.correctCount} dari {outcome.total} item berada di posisi benar.
          </StatusNote>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-dimmer">
        Susun item dari atas ke bawah. Tekan tombol panah, atau fokuskan satu baris lalu tekan tombol
        panah atas/bawah di keyboard.
      </p>
      <ul className="flex flex-col gap-1.5">
        {state.order.map((item, i) => (
          <li
            key={`oo-${i}-${String(item)}`}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            tabIndex={canEdit ? 0 : undefined}
            onKeyDown={onRowKeyDown(i)}
            draggable={canEdit}
            onDragStart={(e) => {
              e.dataTransfer?.setData(DRAG_MIME, String(i));
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              setDragFrom(i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDragOver(i)}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer?.getData(DRAG_MIME));
              setDragFrom(null);
              setDragOver(null);
              if (Number.isInteger(from)) applyMove(from, i, false);
            }}
            aria-label={`Posisi ${i + 1} dari ${pool.length}: ${String(item)}`}
            className={`flex min-h-[44px] items-center gap-2 rounded-smc border px-2.5 py-2 text-[14px] transition ${
              dragFrom === i
                ? 'border-accent bg-accentsoft opacity-70'
                : dragOver === i
                  ? 'border-accent bg-accentsoft'
                  : 'border-linestrong bg-bg2'
            } ${canEdit ? 'cursor-grab' : ''}`}
          >
            <span className="w-5 shrink-0 text-center font-mono text-[12px] text-dimmer">{i + 1}</span>
            <span className="min-w-0 flex-1 text-ink">{String(item)}</span>
            {canEdit && (
              <>
                <MoveButton
                  label={`Naikkan ${String(item)} ke posisi ${i}`}
                  disabled={i === 0}
                  onClick={() => applyMove(i, i - 1, true)}
                >
                  <IconArrowUp size={15} />
                </MoveButton>
                <MoveButton
                  label={`Turunkan ${String(item)} ke posisi ${i + 2}`}
                  disabled={i === pool.length - 1}
                  onClick={() => applyMove(i, i + 1, true)}
                >
                  <IconArrowDown size={15} />
                </MoveButton>
              </>
            )}
          </li>
        ))}
      </ul>
      {/* Wilayah pengumuman: selalu ada di DOM (live region kosong diam-diam),
          di luar jangkauan mata tapi tetap dibaca pembaca layar. */}
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>
      {!state.answered && (
        <StatusNote tone="info">
          Urutan di atas sudah diacak dan belum dihitung sebagai jawaban. Nilai 0 selama tidak ada
          yang kamu ubah.
        </StatusNote>
      )}
    </div>
  );
}
