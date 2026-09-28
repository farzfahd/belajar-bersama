// Field khusus tipe — dipakai KARTU INLINE (gaya Google Forms), bukan modal.
// Prinsip: semua field terlihat langsung tanpa expand tambahan; validasi tetap
// milik `questionTypeFields.js` (`buildTypeFields` dijalankan sebelum autosave),
// jadi komponen ini tidak mengarang aturan sendiri.
//
// Gaya input: garis bawah tipis saat fokus, tanpa kotak penuh. Baris-baris pakai
// `flex-wrap` + `min-w-0` supaya tidak overflow di mobile (<860px).
import { useState } from 'react';
import { IconClose } from '../../../shared/icons';
import { QUESTION_TYPE_LABELS } from '../../../lib/constants';
import {
  MAX_SUB_QUESTIONS,
  OPTION_MAX,
  OPTION_MIN,
  SUB_QUESTION_TYPES
} from '../../questions/utils/questionTypeFields';
import {
  adjustAnswerIndexOnOptionRemove,
  adjustCorrectIndicesOnOptionRemove
} from '../../questions/services/questionService';
import { MatchingEditor } from '../../questions/components/MatchingBoard';

const LINE =
  'w-full min-w-0 rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 text-[14px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none disabled:opacity-60';
const LINE_SMALL =
  'w-full min-w-0 rounded-smc border-b border-line bg-transparent px-1 py-1 text-[13px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none';

export default function QuestionCardTypeFields({ value, onChange, disabled = false }) {
  const draft = value || {};
  const type = draft.type || 'single';
  const set = (patch) => !disabled && onChange({ ...draft, ...patch });

  switch (type) {
    case 'single':
    case 'multiple':
      return <OptionsFields type={type} draft={draft} set={set} disabled={disabled} />;
    case 'boolean':
      return <BooleanFields draft={draft} set={set} disabled={disabled} />;
    case 'short_answer':
      return <ShortAnswerFields draft={draft} set={set} disabled={disabled} />;
    case 'essay':
      return <EssayFields draft={draft} set={set} disabled={disabled} />;
    case 'matching':
      return <MatchingFields draft={draft} set={set} disabled={disabled} />;
    case 'ordering':
      return <OrderingFields draft={draft} set={set} disabled={disabled} />;
    case 'numerical':
      return <NumericalFields draft={draft} set={set} disabled={disabled} />;
    case 'code':
      return <CodeFields draft={draft} set={set} disabled={disabled} />;
    case 'case_study':
      return <CaseStudyFields draft={draft} set={set} disabled={disabled} />;
    default:
      return null;
  }
}

// ---- Tipe 1 & 2: Pilihan Ganda / Kompleks --------------------------------
// Radio untuk single-choice, checkbox untuk multi-select — mengikuti tipe aktif.
function OptionsFields({ type, draft, set, disabled }) {
  const options = Array.isArray(draft.options) && draft.options.length ? draft.options : ['', ''];
  const answerIndex = Number(draft.answerIndex ?? 0);
  const correctIndices = Array.isArray(draft.correctIndices) ? draft.correctIndices : [];
  const multi = type === 'multiple';

  const removeOption = (i) => {
    if (options.length <= OPTION_MIN) return;
    // Helper yang sama dengan QuestionFormModal (sumber tunggal) supaya indeks
    // kunci ikut bergeser dengan benar.
    set({
      options: options.filter((_, idx) => idx !== i),
      ...(multi
        ? { correctIndices: adjustCorrectIndicesOnOptionRemove(i, correctIndices) }
        : { answerIndex: adjustAnswerIndexOnOptionRemove(i, answerIndex) })
    });
  };

  const toggleCorrect = (i) => {
    if (multi) {
      set({
        correctIndices: correctIndices.includes(i)
          ? correctIndices.filter((x) => x !== i)
          : [...correctIndices, i].sort((a, b) => a - b)
      });
    } else {
      set({ answerIndex: i });
    }
  };

  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => {
        const checked = multi ? correctIndices.includes(i) : answerIndex === i;
        return (
          <div key={i} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCorrect(i)}
              disabled={disabled}
              title={checked ? 'Kunci jawaban' : 'Tandai sebagai kunci'}
              aria-label={`Opsi ${i + 1}${checked ? ' (kunci)' : ''}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-dimmer transition hover:text-accent disabled:opacity-50"
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center border border-linestrong text-[10px] leading-none ${
                  multi ? 'rounded-[3px]' : 'rounded-full'
                } ${checked ? 'border-accent bg-accent text-bg' : ''}`}
              >
                {checked ? '✓' : ''}
              </span>
            </button>
            <input
              className={LINE}
              value={opt}
              onChange={(e) => set({ options: options.map((o, idx) => (idx === i ? e.target.value : o)) })}
              disabled={disabled}
              placeholder={`Opsi ${i + 1}`}
              aria-label={`Teks opsi ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              disabled={disabled || options.length <= OPTION_MIN}
              title={options.length <= OPTION_MIN ? `Minimal ${OPTION_MIN} opsi` : 'Hapus opsi'}
              aria-label={`Hapus opsi ${i + 1}`}
              className="shrink-0 px-1 text-dimmer opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
            >
              <IconClose size={15} />
            </button>
          </div>
        );
      })}
      {options.length < OPTION_MAX && (
        <button
          type="button"
          onClick={() => set({ options: [...options, ''] })}
          disabled={disabled}
          className="ml-10 text-[13px] text-accent underline-offset-2 hover:underline"
        >
          + Tambah opsi
        </button>
      )}
      <p className="ml-10 text-[12px] text-dimmer">
        {multi ? 'Centang semua opsi yang benar.' : 'Klik bulatan di kiri opsi untuk menandai kunci jawaban.'}
      </p>
    </div>
  );
}

// ---- Tipe 3: Benar/Salah -------------------------------------------------
function BooleanFields({ draft, set, disabled }) {
  return (
    <div className="flex flex-wrap gap-3">
      {[
        [true, 'Benar'],
        [false, 'Salah']
      ].map(([val, label]) => (
        <label key={String(val)} className="flex items-center gap-2 text-[14px] text-ink">
          <input
            type="radio"
            className="accent-[var(--accent)]"
            checked={Boolean(draft.correctBoolean) === val}
            disabled={disabled}
            onChange={() => set({ correctBoolean: val })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

// ---- Tipe 4: Isian Singkat (chip) ---------------------------------------
function ShortAnswerFields({ draft, set, disabled }) {
  const accepted = Array.isArray(draft.acceptedAnswers) ? draft.acceptedAnswers : [];
  const [entry, setEntry] = useState('');

  const commit = () => {
    const v = entry.trim();
    if (!v || disabled) return;
    if (!accepted.includes(v)) set({ acceptedAnswers: [...accepted, v] });
    setEntry('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {accepted.map((a, i) => (
          <span
            key={`${a}-${i}`}
            className="inline-flex items-center gap-1 rounded-smc border border-linestrong bg-bg2 px-2 py-1 text-[13px] text-ink"
          >
            {a}
            <button
              type="button"
              onClick={() => set({ acceptedAnswers: accepted.filter((_, idx) => idx !== i) })}
              disabled={disabled}
              aria-label={`Hapus "${a}"`}
              className="text-dimmer transition hover:text-danger"
            >
              <IconClose size={12} />
            </button>
          </span>
        ))}
        {accepted.length === 0 && <span className="text-[12.5px] text-dimmer">Belum ada jawaban diterima.</span>}
      </div>
      <input
        className={LINE}
        value={entry}
        disabled={disabled}
        placeholder="Ketik variasi jawaban, lalu tekan Enter"
        aria-label="Tambah jawaban diterima"
        onChange={(e) => setEntry(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
      <p className="text-[12px] text-dimmer">Bisa lebih dari satu — semua variasi ini dianggap benar.</p>
    </div>
  );
}

// ---- Tipe 5: Uraian (manual) --------------------------------------------
function EssayFields({ draft, set, disabled }) {
  return (
    <div className="space-y-1.5">
      <div className="eyebrow">Kunci jawaban (opsional)</div>
      <textarea
        className="min-h-24 w-full rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 text-[14px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
        value={draft.sampleAnswer || ''}
        onChange={(e) => set({ sampleAnswer: e.target.value })}
        disabled={disabled}
        placeholder="Referensi untuk penilaian manual oleh kamu atau partner."
      />
      <p className="text-[12px] text-warn">Tipe ini dinilai manual — tidak ada kunci jawaban otomatis.</p>
    </div>
  );
}

// ---- Tipe 6: Menjodohkan (sambungan satu-ke-satu) -------------------------
// Editor-nya dipakai bersama dengan modal bank soal (MatchingBoard), supaya
// cara menyusun pasangan tidak berbeda di dua tempat.
function MatchingFields({ draft, set, disabled }) {
  return (
    <MatchingEditor
      pairs={draft.pairs}
      // Draft editor dibaca lebih dulu supaya baris yang belum dipasangkan
      // tetap ada setelah reload; `pairs` hanya dipakai sebagai fallback.
      pairDraft={draft.pairDraft}
      disabled={disabled}
      onChange={(pairs, pairDraft) => set({ pairs, pairDraft })}
    />
  );
}

// ---- Tipe 7: Mengurutkan (urutan input = urutan benar) -------------------
function OrderingFields({ draft, set, disabled }) {
  const items = Array.isArray(draft.items) && draft.items.length ? draft.items : [''];
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right font-mono text-[12px] text-dimmer">{i + 1}</span>
          <input
            className={LINE}
            value={it}
            disabled={disabled}
            placeholder={`Item ${i + 1}`}
            aria-label={`Item urutan ${i + 1}`}
            onChange={(e) => set({ items: items.map((x, idx) => (idx === i ? e.target.value : x)) })}
          />
          <button
            type="button"
            onClick={() => set({ items: items.filter((_, idx) => idx !== i) })}
            disabled={disabled || items.length <= 2}
            title={items.length <= 2 ? 'Minimal 2 item' : 'Hapus item'}
            aria-label={`Hapus item ${i + 1}`}
            className="shrink-0 text-dimmer transition hover:text-danger"
          >
            <IconClose size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set({ items: [...items, ''] })}
        disabled={disabled}
        className="ml-7 text-[13px] text-accent underline-offset-2 hover:underline"
      >
        + Tambah item
      </button>
      <p className="ml-7 text-[12px] text-dimmer">Urutan di sini adalah urutan yang benar.</p>
    </div>
  );
}

// ---- Tipe 8: Numerik ----------------------------------------------------
function NumericalFields({ draft, set, disabled }) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
        <span className="eyebrow">Jawaban benar</span>
        <input
          type="number"
          className={LINE}
          value={draft.correctValue ?? ''}
          disabled={disabled}
          onChange={(e) => set({ correctValue: e.target.value })}
        />
      </label>
      <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
        <span className="eyebrow">Toleransi (±)</span>
        <input
          type="number"
          min="0"
          className={LINE}
          value={draft.tolerance ?? 0}
          disabled={disabled}
          onChange={(e) => set({ tolerance: e.target.value })}
        />
      </label>
    </div>
  );
}

// ---- Tipe 9: Soal Kode (manual, tanpa eksekusi) --------------------------
function CodeFields({ draft, set, disabled }) {
  const [tab, setTab] = useState('expectedOutput');
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Kode awal (starter code)</span>
        <textarea
          className="min-h-32 w-full rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 font-mono text-[13px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
          value={draft.starterCode || ''}
          disabled={disabled}
          placeholder="// kode awal untuk peserta"
          onChange={(e) => set({ starterCode: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {[
          ['expectedOutput', 'Output yang diharapkan'],
          ['sampleSolution', 'Solusi contoh']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`text-[12.5px] underline-offset-2 hover:underline ${tab === key ? 'text-accent' : 'text-dimmer'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="min-h-24 w-full rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 font-mono text-[13px] text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
        value={draft[tab] || ''}
        disabled={disabled}
        placeholder={tab === 'expectedOutput' ? 'Contoh keluaran yang diharapkan' : 'Contoh solusi'}
        onChange={(e) => set({ [tab]: e.target.value })}
      />
      <p className="text-[12px] text-warn">
        Dinilai manual — kode tidak dijalankan otomatis. Peserta hanya menulis jawaban; kamu atau partner menilai.
      </p>
    </div>
  );
}

// ---- Tipe 10: Studi Kasus (sub-soal sebagai kartu bersarang) -------------
//
// CATATAN PENTING: sub-soal HANYA boleh bertipe yang dinilai otomatis —
// `SUB_QUESTION_TYPES` (7 tipe). Ini bukan pilihan UI semata: `firestore.rules`
// (`validCaseStudy`) menolak `subQuestions[0].type` di luar daftar itu, jadi
// sub-soal uraian/kode akan ditolak server. Sub-soal pun maksimal 1 tingkat.
function CaseStudyFields({ draft, set, disabled }) {
  const subs = Array.isArray(draft.subQuestions) ? draft.subQuestions : [];

  const patch = (i, next) => set({ subQuestions: subs.map((s, idx) => (idx === i ? { ...s, ...next } : s)) });
  const remove = (i) => set({ subQuestions: subs.filter((_, idx) => idx !== i) });
  const add = () => {
    if (subs.length >= MAX_SUB_QUESTIONS) return;
    set({ subQuestions: [...subs, { type: 'single', options: ['', ''], answerIndex: 0 }] });
  };

  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Teks kasus / bacaan</span>
        <textarea
          className="min-h-28 w-full rounded-smc border-b border-linestrong bg-transparent px-1 py-1.5 text-[14px] leading-relaxed text-ink placeholder:text-dimmer focus:border-accent focus:outline-none"
          value={draft.caseText || ''}
          disabled={disabled}
          placeholder="Tuliskan kasus atau bacaan yang jadi dasar pertanyaan."
          onChange={(e) => set({ caseText: e.target.value })}
        />
      </label>

      {subs.length === 0 ? (
        <p className="rounded-smc border border-dashed border-line px-3 py-2.5 text-[12.5px] text-dimmer">
          Tanpa sub-soal, kasus ini dinilai otomatis penuh. Tambahkan sub-soal bila kasus perlu dipecah.
        </p>
      ) : (
        <ul className="space-y-2 border-l-2 border-line pl-3">
          {subs.map((sub, i) => (
            <li key={i} className="rounded-smc border border-line bg-bg2 p-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="eyebrow">Sub-soal {i + 1}</span>
                <select
                  className="rounded-smc border border-line bg-bg px-1.5 py-1 text-[12px] text-ink"
                  value={sub.type || 'single'}
                  disabled={disabled}
                  aria-label={`Tipe sub-soal ${i + 1}`}
                  onChange={(e) => patch(i, { type: e.target.value })}
                >
                  {SUB_QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={disabled}
                  aria-label={`Hapus sub-soal ${i + 1}`}
                  className="ml-auto text-dimmer transition hover:text-danger"
                >
                  <IconClose size={14} />
                </button>
              </div>
              {/* Skala lebih kecil: padding tipis, indentasi jelas, font 13px. */}
              <div className="[&_p]:text-[12px] [&_textarea]:min-h-16 [&_textarea]:text-[13px] [&_input]:text-[13px]">
                <QuestionCardTypeFields value={sub} onChange={(next) => patch(i, next)} disabled={disabled} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={disabled || subs.length >= MAX_SUB_QUESTIONS}
        title={subs.length >= MAX_SUB_QUESTIONS ? `Maksimal ${MAX_SUB_QUESTIONS} sub-soal` : undefined}
        className="text-[13px] text-accent underline-offset-2 hover:underline disabled:opacity-50"
      >
        + Tambah sub-soal
      </button>
    </div>
  );
}

