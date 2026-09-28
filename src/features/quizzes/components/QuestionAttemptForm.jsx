// Penampil satu soal untuk pengerjaan kuis (CP2 attempt engine).
//
// Sengaja memakai komponen UI yang sudah ada (Input/Badge) dan token warna
// design system — tidak membuat pola visual baru. Dua mode: `answered` (saat
// mengerjakan) dan `review` (halaman hasil: kunci jawaban + pembahasan).
import Badge from '../../../shared/ui/Badge';
import Input from '../../../shared/ui/Input';
import { QUESTION_TYPE_LABELS } from '../../../lib/constants';
import { MatchingAnswer } from '../../questions/components/MatchingBoard';

function OptionRow({ selected, onSelect, disabled, showKey, isKey, label }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-smc border px-3 py-2.5 text-[14px] transition ${
        isKey
          ? 'border-ok bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]'
          : selected
            ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
            : 'border-linestrong bg-bg2'
      } ${disabled ? 'cursor-default opacity-70' : ''}`}
    >
      <input
        type="radio"
        className="mt-1 accent-[var(--accent)]"
        checked={Boolean(selected)}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0 flex-1 text-ink">{label}</span>
      {isKey && <Badge tone="ok">Kunci</Badge>}
    </label>
  );
}

export default function QuestionAttemptForm({ question, value, onChange, review = false, disabled = false }) {
  // `Input` menurunkan id dari label saja ("field-nilai"), sedangkan komponen ini
  // dirender sekali per soal. Tanpa awalan unik, semua soal numerik/isian di
  // halaman hasil memakai id yang sama dan `<label for>` menunjuk input yang
  // salah. Awalan diambil dari `question.id` supaya unik per soal.
  const idPrefix = question?.id ? `q-${question.id}` : null;
  const fieldId = (name) => (idPrefix ? `${idPrefix}-${name}` : undefined);

  if (!question || question.available === false) {
    // Kasus tepi, bukan kondisi normal. Entri `unavailable` hanya muncul bila
    // soalnya sudah hilang SEBELUM attempt dimulai (sudah dihapus, atau private
    // sehingga tidak terlihat oleh yang mengerjakan). Attempt yang sudah punya
    // snapshot lengkap TIDAK pernah sampai ke sini walau soalnya dihapus
    // sesudahnya — isinya sudah tersalin di `questionSnapshot`.
    return (
      <p className="text-[13.5px] text-dimmer">
        Soal ini sudah tidak tersedia ketika attempt dimulai, jadi tidak bisa
        dikerjakan. Attempt ini menunggu penilaian manual.
      </p>
    );
  }

  const type = question.type || 'single';
  const set = (next) => {
    if (!disabled) onChange?.(next);
  };
  const options = Array.isArray(question.options) ? question.options : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="eyebrow">{QUESTION_TYPE_LABELS[type] || type}</div>
      <p className="text-[15px] leading-relaxed text-ink">{question.prompt}</p>

      {/* Tipe 1 — single */}
      {type === 'single' &&
        options.map((opt, i) => (
          <OptionRow
            key={i}
            label={opt}
            selected={value === i}
            onSelect={() => set(i)}
            disabled={disabled}
            showKey={review}
            isKey={review && question.answerIndex === i}
          />
        ))}

      {/* Tipe 3 — benar/salah */}
      {type === 'boolean' &&
        [
          [true, 'Benar'],
          [false, 'Salah']
        ].map(([val, label]) => (
          <OptionRow
            key={String(val)}
            label={label}
            selected={value === val}
            onSelect={() => set(val)}
            disabled={disabled}
            showKey={review}
            isKey={review && Boolean(question.correctBoolean) === val}
          />
        ))}

      {/* Tipe 2 — multi select */}
      {type === 'multiple' &&
        options.map((opt, i) => {
          const arr = Array.isArray(value) ? value : [];
          const on = arr.includes(i);
          const isKey = review && (question.correctIndices || []).includes(i);
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded-smc border px-3 py-2.5 text-[14px] transition ${
                isKey
                  ? 'border-ok bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]'
                  : on
                    ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                    : 'border-linestrong bg-bg2'
              } ${disabled ? 'cursor-default opacity-70' : ''}`}
            >
              <input
                type="checkbox"
                className="mt-1 accent-[var(--accent)]"
                checked={on}
                disabled={disabled}
                onChange={() => set(on ? arr.filter((x) => x !== i) : [...arr, i].sort((a, b) => a - b))}
              />
              <span className="min-w-0 flex-1 text-ink">{opt}</span>
              {isKey && <Badge tone="ok">Kunci</Badge>}
            </label>
          );
        })}

      {/* Tipe 4 — isian singkat */}
      {type === 'short_answer' && (
        <Input
          label="Jawaban"
          id={fieldId('answer')}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
          hint={
            review && question.acceptedAnswers?.length
              ? `Jawaban diterima: ${question.acceptedAnswers.join(', ')}`
              : undefined
          }
        />
      )}

      {/* Tipe 5 — uraian (dinilai manual) */}
      {type === 'essay' && (
        <textarea
          className="min-h-32 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer focus:outline-2 focus:outline-offset-1 focus:outline-accent"
          placeholder="Tulis jawabanmu…"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      )}

      {/* Tipe 6 - menjodohkan: peta { kiri: kanan }. Sambungan dibuat satu ke
          satu (ketuk/seret), bukan dropdown, jadi satu item kanan tidak bisa
          terpakai dua kali. Kolom kanan sudah diacak dan tidak ada penanda
          benar/salah saat menjawab; hasil baru muncul di mode review. */}
      {type === 'matching' && (
        <MatchingAnswer
          pairs={question.pairs}
          value={value}
          seed={question.id || question.questionId || 'q'}
          disabled={disabled}
          review={review}
          onChange={(next) => set(next)}
        />
      )}

      {/* Tipe 7 — mengurutkan */}
      {type === 'ordering' && (
        <ul className="flex flex-col gap-1.5">
          {(Array.isArray(value) && value.length ? value : question.items || []).map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex items-center gap-3 rounded-smc border border-linestrong bg-bg2 px-3 py-2 text-[14px] text-ink"
            >
              <span className="font-mono text-[12px] text-dimmer">{i + 1}</span>
              <span className="min-w-0 flex-1">{String(item)}</span>
              {review && (question.items || [])[i] === item && <Badge tone="ok">Benar</Badge>}
            </li>
          ))}
        </ul>
      )}

      {/* Tipe 8 — numerik */}
      {type === 'numerical' && (
        <Input
          label="Nilai"
          id={fieldId('nilai')}
          type="number"
          value={value ?? ''}
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
          hint={review ? `Nilai benar: ${question.correctValue}` : undefined}
        />
      )}

      {/* Tipe 9 — kode (dinilai manual) */}
      {type === 'code' && (
        <textarea
          className="min-h-40 w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 font-mono text-[13px] text-ink focus:outline-2 focus:outline-offset-1 focus:outline-accent"
          placeholder={question.starterCode || '// tulis kode di sini'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      )}

      {/* Tipe 10 — studi kasus: sub-soal dinilai per tipenya sendiri */}
      {type === 'case_study' && (
        <div className="flex flex-col gap-3">
          <p className="rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] leading-relaxed text-ink">
            {question.caseText}
          </p>
          {(question.subQuestions || []).map((sub, idx) => {
            const subVal = (value && value[idx]) ?? null;
            return (
              <div key={idx} className="flex flex-col gap-2">
                <div className="eyebrow">Sub-soal {idx + 1}</div>
                <p className="text-[14px] text-ink">{sub.prompt}</p>
                {sub.type === 'single' &&
                  (sub.options || []).map((opt, i) => (
                    <OptionRow
                      key={i}
                      label={opt}
                      selected={subVal === i}
                      disabled={disabled}
                      onSelect={() => set({ ...(value || {}), [idx]: i })}
                      showKey={review}
                      isKey={review && sub.answerIndex === i}
                    />
                  ))}
                {sub.type === 'boolean' &&
                  [
                    [true, 'Benar'],
                    [false, 'Salah']
                  ].map(([val, label]) => (
                    <OptionRow
                      key={String(val)}
                      label={label}
                      selected={subVal === val}
                      disabled={disabled}
                      onSelect={() => set({ ...(value || {}), [idx]: val })}
                      showKey={review}
                      isKey={review && Boolean(sub.correctBoolean) === val}
                    />
                  ))}
                {sub.type === 'short_answer' && (
                  <Input
                    label="Jawaban"
                    id={fieldId(`sub-${idx}-answer`)}
                    value={typeof subVal === 'string' ? subVal : ''}
                    onChange={(e) => set({ ...(value || {}), [idx]: e.target.value })}
                    disabled={disabled}
                  />
                )}
                {sub.type === 'numerical' && (
                  <Input
                    label="Nilai"
                    id={fieldId(`sub-${idx}-nilai`)}
                    type="number"
                    value={subVal ?? ''}
                    onChange={(e) =>
                      set({ ...(value || {}), [idx]: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    disabled={disabled}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
