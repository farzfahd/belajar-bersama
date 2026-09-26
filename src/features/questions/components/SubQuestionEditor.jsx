import { SUB_QUESTION_TYPES, MAX_SUB_QUESTIONS } from '../utils/questionTypeFields';
import { QUESTION_TYPE_LABELS } from '../../../lib/constants';
import Button from '../../../shared/ui/Button';

// Editor sub-soal untuk soal `case_study`. SATU tingkat saja: tiap sub-soal
// hanya boleh bertipe yang dinilai otomatis (lihat SUB_QUESTION_TYPES), dan
// tidak punya editor anak — nested >1 tingkat ditolak oleh `normalizeSubQuestions`
// maupun Firestore Rules.
//
// Nilai yang diedit di sini dikirim apa adanya ke `createQuestion`; validasi
// final tetap di service (satu sumber kebenaran).
export default function SubQuestionEditor({ value = [], onChange, disabled = false }) {
  const subs = Array.isArray(value) ? value : [];

  const patch = (index, next) => {
    onChange(subs.map((s, i) => (i === index ? { ...s, ...next } : s)));
  };
  const remove = (index) => onChange(subs.filter((_, i) => i !== index));
  const add = () => {
    if (subs.length >= MAX_SUB_QUESTIONS) return;
    onChange([...subs, { type: 'single', options: ['', ''], answerIndex: 0 }]);
  };
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= subs.length) return;
    const next = [...subs];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const field =
    'min-h-[36px] w-full rounded-smc border border-line bg-bg2 px-2 py-1.5 text-[13px] text-ink disabled:opacity-60';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          Sub-soal ({subs.length}/{MAX_SUB_QUESTIONS}) — opsional
        </span>
        <Button size="sm" variant="ghost" onClick={add} disabled={disabled || subs.length >= MAX_SUB_QUESTIONS}>
          ＋ Tambah sub-soal
        </Button>
      </div>

      {subs.length === 0 ? (
        <p className="rounded-smc border border-dashed border-linestrong px-3 py-3 text-[12.5px] text-dimmer">
          Tanpa sub-soal, kasus dinilai otomatis penuh (poin soal dibagi rata ke semua sub-soal saat
          pengerjaan). Tambahkan bila kasus perlu dipecah menjadi beberapa pertanyaan.
        </p>
      ) : (
        <ul className="space-y-2">
          {subs.map((sub, index) => (
            <SubQuestionRow
              key={index}
              sub={sub}
              index={index}
              total={subs.length}
              field={field}
              disabled={disabled}
              onPatch={(next) => patch(index, next)}
              onRemove={() => remove(index)}
              onMove={(delta) => move(index, delta)}
            />
          ))}
        </ul>
      )}
    </div>
  );

// Satu baris sub-soal: tipe + field khusus tipenya. Dipisah agar file utama
// tetap ringkas dan mudah dipindai.
function SubQuestionRow({ sub, index, total, field, disabled, onPatch, onRemove, onMove }) {
  const type = sub.type || 'single';
  const options = Array.isArray(sub.options) ? sub.options : ['', ''];
  const pairs = Array.isArray(sub.pairs) && sub.pairs.length ? sub.pairs : [{ left: '', right: '' }];
  const items = Array.isArray(sub.items) && sub.items.length ? sub.items : [''];

  const setOption = (oi, v) => onPatch({ options: options.map((o, i) => (i === oi ? v : o)) });
  const toggleCorrect = (oi) => {
    const list = Array.isArray(sub.correctIndices) ? sub.correctIndices : [];
    onPatch({
      correctIndices: list.includes(oi) ? list.filter((x) => x !== oi) : [...list, oi].sort((a, b) => a - b)
    });
  };

  return (
    <li className="space-y-2 rounded-smc border border-line bg-bg2 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={type}
          onChange={(e) => onPatch({ type: e.target.value })}
          disabled={disabled}
          aria-label={`Tipe sub-soal ${index + 1}`}
          className={field}
        >
          {SUB_QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="subtle" onClick={() => onMove(-1)} disabled={disabled || index === 0}>
            ↑
          </Button>
          <Button size="sm" variant="subtle" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>
            ↓
          </Button>
          <Button size="sm" variant="danger" onClick={onRemove} disabled={disabled}>
            Hapus
          </Button>
        </div>
      </div>

      {(type === 'single' || type === 'multiple') && (
        <div className="space-y-1.5">
          {options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type={type === 'single' ? 'radio' : 'checkbox'}
                name={`sub-key-${index}`}
                checked={type === 'single' ? sub.answerIndex === oi : (sub.correctIndices || []).includes(oi)}
                onChange={() => (type === 'single' ? onPatch({ answerIndex: oi }) : toggleCorrect(oi))}
                disabled={disabled}
                aria-label={`Kunci sub-soal ${index + 1} opsi ${oi + 1}`}
                className="accent-accent"
              />
              <input
                value={opt}
                onChange={(e) => setOption(oi, e.target.value)}
                disabled={disabled}
                aria-label={`Opsi ${oi + 1} sub-soal ${index + 1}`}
                placeholder={`Opsi ${oi + 1}`}
                className={field}
              />
              {options.length > 2 && (
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => onPatch({ options: options.filter((_, i) => i !== oi) })}
                  disabled={disabled}
                >
                  −
                </Button>
              )}
            </div>
          ))}
          {options.length < 20 && (
            <Button size="sm" variant="subtle" onClick={() => onPatch({ options: [...options, ''] })} disabled={disabled}>
              ＋ Opsi
            </Button>
          )}
        </div>
      )}


      {type === 'boolean' && (
        <div className="flex items-center gap-3 text-[13px] text-ink">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`sub-bool-${index}`}
              checked={sub.correctBoolean === true}
              onChange={() => onPatch({ correctBoolean: true })}
              disabled={disabled}
              className="accent-accent"
            />
            Benar
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`sub-bool-${index}`}
              checked={sub.correctBoolean === false}
              onChange={() => onPatch({ correctBoolean: false })}
              disabled={disabled}
              className="accent-accent"
            />
            Salah
          </label>
        </div>
      )}

      {type === 'short_answer' && (
        <input
          value={(sub.acceptedAnswers || []).join(', ')}
          onChange={(e) => onPatch({ acceptedAnswers: e.target.value.split(',') })}
          disabled={disabled}
          aria-label={`Jawaban diterima sub-soal ${index + 1}`}
          placeholder="Jawaban diterima (pisahkan dengan koma)"
          className={field}
        />
      )}

      {type === 'matching' && (
        <div className="space-y-1.5">
          {pairs.map((pair, pi) => (
            <div key={pi} className="flex items-center gap-2">
              <input
                value={pair.left}
                onChange={(e) => onPatch({ pairs: pairs.map((p, i) => (i === pi ? { ...p, left: e.target.value } : p)) })}
                disabled={disabled}
                aria-label={`Kiri pasangan ${pi + 1}`}
                placeholder="Kiri"
                className={field}
              />
              <span className="text-dimmer">→</span>
              <input
                value={pair.right}
                onChange={(e) => onPatch({ pairs: pairs.map((p, i) => (i === pi ? { ...p, right: e.target.value } : p)) })}
                disabled={disabled}
                aria-label={`Kanan pasangan ${pi + 1}`}
                placeholder="Kanan"
                className={field}
              />
            </div>
          ))}
          <Button size="sm" variant="subtle" onClick={() => onPatch({ pairs: [...pairs, { left: '', right: '' }] })} disabled={disabled}>
            ＋ Pasangan
          </Button>
        </div>
      )}

      {type === 'ordering' && (
        <div className="space-y-1.5">
          {items.map((item, ii) => (
            <input
              key={ii}
              value={item}
              onChange={(e) => onPatch({ items: items.map((x, i) => (i === ii ? e.target.value : x)) })}
              disabled={disabled}
              aria-label={`Item urutan ${ii + 1}`}
              placeholder={`Item ${ii + 1} (urutan benar)`}
              className={field}
            />
          ))}
          <Button size="sm" variant="subtle" onClick={() => onPatch({ items: [...items, ''] })} disabled={disabled}>
            ＋ Item
          </Button>
        </div>
      )}

      {type === 'numerical' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={sub.correctValue ?? ''}
            onChange={(e) => onPatch({ correctValue: e.target.value })}
            disabled={disabled}
            aria-label={`Nilai numerik sub-soal ${index + 1}`}
            placeholder="Nilai benar"
            className={field}
          />
          <span className="text-[12.5px] text-dimmer">toleransi</span>
          <input
            type="number"
            min="0"
            value={sub.tolerance ?? 0}
            onChange={(e) => onPatch({ tolerance: e.target.value })}
            disabled={disabled}
            aria-label={`Toleransi sub-soal ${index + 1}`}
            className={field}
          />
        </div>
      )}
    </li>
  );
}

}
