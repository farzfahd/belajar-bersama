import { useMemo, useRef } from 'react';

// Editor markdown live-highlight: textarea dengan teks transparan diletakkan di
// atas lapisan render hasil parse. Penanda markdown tampil samar (m-dim),
// teks yang diformat langsung terlihat hasilnya (bold/italic/kode/link),
// penanda daftar/judul berwarna — persis seperti hasil preview. Tekstarea
// tetap sumber asli (markdown), jadi data & undo tidak berubah.
// Scroll dua lapisan disinkronkan; font/padding/pembungkusan harus identik.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Elemen inline: kode, bold, coret, link, miring — diproses satu arah.
function inlineToHtml(str) {
  const out = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    const rest = str.slice(i);
    if (rest.startsWith('`')) {
      let run = 0;
      while (str[i + run] === '`') run += 1;
      const close = str.indexOf('`'.repeat(run), i + run);
      if (close !== -1) {
        out.push(`<span class="m-dim">${escapeHtml(str.slice(i, i + run))}</span>`);
        out.push(`<code>${escapeHtml(str.slice(i + run, close))}</code>`);
        out.push(`<span class="m-dim">${escapeHtml(str.slice(close, close + run))}</span>`);
        i = close + run;
        continue;
      }
    }
    if (rest.startsWith('**')) {
      const close = str.indexOf('**', i + 2);
      if (close !== -1) {
        out.push('<span class="m-dim">**</span>');
        out.push(`<strong>${escapeHtml(str.slice(i + 2, close))}</strong>`);
        out.push('<span class="m-dim">**</span>');
        i = close + 2;
        continue;
      }
    }
    if (rest.startsWith('~~')) {
      const close = str.indexOf('~~', i + 2);
      if (close !== -1) {
        out.push('<span class="m-dim">~~</span>');
        out.push(`<s>${escapeHtml(str.slice(i + 2, close))}</s>`);
        out.push('<span class="m-dim">~~</span>');
        i = close + 2;
        continue;
      }
    }
    if (rest.startsWith('[')) {
      const rb = str.indexOf('](', i);
      if (rb !== -1) {
        const close = str.indexOf(')', rb + 2);
        if (close !== -1) {
          const text = str.slice(i + 1, rb);
          const url = str.slice(rb + 2, close);
          if (text && /^https?:\/\//i.test(url)) {
            out.push('<span class="m-dim">[</span>');
            out.push(`<span class="m-link">${escapeHtml(text)}</span>`);
            out.push(`<span class="m-dim">](${escapeHtml(url)})</span>`);
            i = close + 1;
            continue;
          }
        }
      }
    }
    if (rest.startsWith('*') && rest[1] !== '*') {
      const close = str.indexOf('*', i + 1);
      if (close !== -1) {
        const inner = str.slice(i + 1, close);
        if (inner && !inner.includes('*')) {
          out.push('<span class="m-dim">*</span>');
          out.push(`<em>${escapeHtml(inner)}</em>`);
          out.push('<span class="m-dim">*</span>');
          i = close + 1;
          continue;
        }
      }
    }
    out.push(escapeHtml(str[i]));
    i += 1;
  }
  return out.join('');
}

// Parse satu baris: penanda blok (judul/checklist/daftar/kutipan/garis) + inline.
// Glyph asli dipertahankan persis agar baris sejajar dengan textarea.
function lineToHtml(line) {
  let m = line.match(/^(\s*)(-|\*|\+)(\s+)\[([ xX])\](\s+)(.*)$/);
  if (m) {
    return `${escapeHtml(m[1])}<span class="m-marker">${m[2]}</span>${escapeHtml(m[3])}<span class="m-marker">[${m[4]}]</span>${escapeHtml(m[5])}${inlineToHtml(m[6])}`;
  }
  m = line.match(/^(#{1,6})(\s+)(.*)$/);
  if (m) {
    return `<span class="m-dim">${m[1]}</span><strong class="m-heading">${escapeHtml(m[2])}${inlineToHtml(m[3])}</strong>`;
  }
  m = line.match(/^(\s*)(>)(\s?)(.*)$/);
  if (m) {
    return `${escapeHtml(m[1])}<span class="m-quote">${m[2]}</span>${escapeHtml(m[3])}${inlineToHtml(m[4])}`;
  }
  m = line.match(/^(\s*)(-{3,}|\*{3,})\s*$/);
  if (m) {
    return `<span class="m-dim">${line}</span>`;
  }
  m = line.match(/^(\s*)(\d+)\.(\s+)(.*)$/);
  if (m) {
    return `${escapeHtml(m[1])}<span class="m-marker">${m[2]}.</span>${escapeHtml(m[3])}${inlineToHtml(m[4])}`;
  }
  m = line.match(/^(\s*)(-|\*|\+)(\s+)(.*)$/);
  if (m) {
    return `${escapeHtml(m[1])}<span class="m-marker">${m[2]}</span>${escapeHtml(m[3])}${inlineToHtml(m[4])}`;
  }
  return inlineToHtml(line);
}

function sourceHtml(src) {
  if (!src) return '';
  const lines = src.split('\n');
  let out = '';
  for (let i = 0; i < lines.length; i += 1) {
    out += lineToHtml(lines[i]);
    if (i < lines.length - 1) out += '\n';
  }
  return out;
}

export default function MarkdownEditor({
  id,
  inputRef,
  value = '',
  onChange,
  onKeyDown,
  placeholder = '',
  maxLength
}) {
  const renderRef = useRef(null);
  const html = useMemo(() => sourceHtml(value), [value]);

  const syncScroll = (e) => {
    const el = renderRef.current;
    if (el) {
      el.scrollTop = e.target.scrollTop;
      el.scrollLeft = e.target.scrollLeft;
    }
  };

  return (
    <div className="md-source">
      <div
        aria-hidden="true"
        ref={renderRef}
        className="md-source-render"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        className="md-source-input"
      />
    </div>
  );
}