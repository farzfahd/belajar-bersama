import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

// Pratinjau Markdown: marked -> DOMPurify -> KaTeX.
// urutan penting: sanitasi dulu, baru sisipkan HTML KaTeX (output katex sudah
// aman sendiri dan tidak memakai trust/http, jadi tidak bisa menyuntik URL).
// LaTeX: blok $$...$$ (display) dan inline $...$.

// Tambah atribut aman pada tautan & gambar hasil marked.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    const href = node.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else {
      node.removeAttribute('target');
    }
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(src)) node.removeAttribute('src');
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

// $$ blok lebih dulu, baru $ inline. Tanda $ yang di-escape (\$) bukan math.
const MATH_SPLIT = /(?<!\\)(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/;
const SKIP_PARENTS = new Set(['CODE', 'PRE', 'KBD', 'SCRIPT', 'STYLE', 'TEXTAREA']);

function renderMathIn(root) {
  if (typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP_PARENTS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return MATH_SPLIT.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const parts = node.nodeValue.split(MATH_SPLIT);
    if (parts.length < 2) continue;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      const display = part.startsWith('$$');
      const isMath = display || (part.startsWith('$') && part.endsWith('$'));
      if (!isMath) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }
      const expression = display ? part.slice(2, -2) : part.slice(1, -1);
      const span = document.createElement('span');
      span.className = display ? 'md-math-block' : 'md-math';
      try {
        span.innerHTML = katex.renderToString(expression, {
          displayMode: display,
          throwOnError: false,
          output: 'htmlAndMathml',
          strict: false
        });
      } catch {
        // LaTeX rusak: tampilkan sumbernya apa adanya, jangan hilang.
        span.textContent = part;
      }
      fragment.appendChild(span);
    }
    node.parentNode?.replaceChild(fragment, node);
  }
}

export default function Markdown({ text = '', className = '' }) {
  const html = useMemo(() => {
    if (!text) return '';
    const raw = marked.parse(String(text), { breaks: true, gfm: true });
    const out = typeof raw === 'string' ? raw : String(raw);
    const clean = DOMPurify.sanitize(out, { USE_PROFILES: { html: true } });

    if (typeof document === 'undefined') return clean;
    const holder = document.createElement('div');
    holder.innerHTML = clean;
    renderMathIn(holder);
    return holder.innerHTML;
  }, [text]);

  if (!html) return null;
  // eslint-disable-next-line react/no-danger
  return <div className={`md-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
