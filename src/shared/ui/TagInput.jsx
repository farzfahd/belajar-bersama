import { useEffect, useId, useRef, useState } from 'react';
import { normalizeTag, normalizeTags } from '../utils/validate';

// Input tag: ketik + Enter (atau koma) untuk menambah, Backspace di kolom
// kosong menghapus tag terakhir. Saran autocomplete dari tag yang sudah dipakai
// di space ini; tag dinormalisasi (trim + lowercase) sebelum disimpan.
export default function TagInput({ value = [], onChange, suggestions = [], label = 'Tag', hint, max = 20 }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const tags = normalizeTags(value);
  const term = normalizeTag(draft);

  const options = suggestions
    .map((item) => (typeof item === 'string' ? item : item.tag))
    .filter((item) => item && !tags.includes(item) && (!term || item.includes(term)))
    .slice(0, 8);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const add = (raw) => {
    const tag = normalizeTag(raw);
    if (!tag) return false;
    if (tags.length >= max) return false;
    if (tags.includes(tag)) {
      setDraft('');
      return true;
    }
    onChange([...tags, tag]);
    setDraft('');
    setActive(0);
    return true;
  };

  const remove = (tag) => onChange(tags.filter((item) => item !== tag));

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && options[active] && normalizeTag(draft) !== options[active]) add(options[active]);
      else add(draft);
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
      return;
    }
    if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length) remove(tags[tags.length - 1]);
  };

  const full = tags.length >= max;

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={`${listId}-input`} className="eyebrow mb-1.5 block">
        {label}
      </label>

      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-smc border bg-bg2 px-2 py-1.5 ${
          full ? 'border-line' : 'border-linestrong'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[.05em] text-dim"
          >
            #{tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(tag);
              }}
              aria-label={`Hapus tag ${tag}`}
              className="text-dimmer transition hover:text-accent"
            >
              ✕
            </button>
          </span>
        ))}

        <input
          id={`${listId}-input`}
          ref={inputRef}
          value={draft}
          disabled={full}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={full ? `Maksimal ${max} tag` : 'ketik tag lalu Enter'}
          aria-describedby={`${listId}-hint`}
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          autoComplete="off"
          className="h-7 min-w-[8rem] flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-dimmer disabled:cursor-not-allowed"
        />
      </div>

      {open && options.length > 0 && !full && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-smc border border-line bg-bg shadow-none"
        >
          {options.map((item, index) => (
            <li key={item} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  add(item);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[.05em] ${
                  index === active ? 'bg-bg2 text-ink' : 'text-dim'
                }`}
              >
                <span>#{item}</span>
                <span className="text-dimmer">Enter</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id={`${listId}-hint`} className="mt-1 font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
        {full ? `Sudah ${tags.length}/${max} tag` : hint || `Enter untuk menambah · maksimal ${max} tag · huruf kecil`}
      </p>
    </div>
  );
}
