// Generator galeri ikon statis.
//
// Membaca setiap src/shared/icons/Icon*.jsx, mengambil isi dalam <svg>, lalu
// menulis satu file HTML mandiri yang bisa dibuka langsung (tanpa dev server,
// tanpa build, tanpa CDN).
//
//   node scripts/gen-icon-gallery.mjs
//
// Output: docs/icons.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ICON_DIR = 'src/shared/icons';
const OUT = 'docs/icons.html';

// Atribut <svg> yang dipakai semua ikon (lihat aturan di shared/icons/index.js).
const SVG_ATTRS = [
  'viewBox="0 0 24 24"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="1.5"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
  'aria-hidden="true"'
].join(' ');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const files = readdirSync(ICON_DIR)
  .filter((f) => /^Icon[A-Za-z]+\.jsx$/.test(f))
  .sort();

const icons = [];
for (const f of files) {
  const src = readFileSync(join(ICON_DIR, f), 'utf8');
  const inner = src.match(/<svg\b[\s\S]*?>([\s\S]*?)<\/svg>/);
  if (!inner) {
    console.warn('  Lewati (tidak ada <svg>):', f);
    continue;
  }
  // Buang atribut khusus React; sisanya sudah berupa HTML/SVG valid.
  const body = inner[1]
    .replace(/className=\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  icons.push({ name: f.replace(/\.jsx$/, ''), body });
}

// Kelompokkan berdasarkan nama supaya grid-nya mudah dipindai.
const GROUPS = [
  ['Navigasi', /^Icon(Dashboard|Today|Learn|Roadmap|Quiz|Tasks|Discuss|Projects|Progress|Achievements|Notifications|Settings|Menu|Search|ChevronExpand)$/],
  ['Aksi', /^Icon(Edit|Trash|Close|Plus|Minus|Move|Swap|Copy|Restore|ExternalLink|Share|Flag|Link|Bookmark)$/],
  ['Isi & konten', /^Icon(Notes|Folder|Book|Books|Doc|Cap|Chart|Blocks|Film|Image|Paperclip|Eye|Target|Key|Play|Puzzle|Question|Mind|Globe|Lock|Mail)$/],
  ['Markdown', /^Icon(Bold|Italic|Heading|List|Checklist|Code|Quote|Table|Image)$/],
  ['Status & arah', /^Icon(Check|Warn|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ChevronDown|ChevronRight)$/],
  ['Tema & orang', /^Icon(ThemeDark|ThemeLight|User|Users|Greeting)$/],
  ['Kosong', /^IconEmpty/]
];

const groupOf = (name) => {
  for (const [label, re] of GROUPS) if (re.test(name)) return label;
  return 'Lainnya';
};

// Jaga agar ikon baru tidak diam-diam hilang dari galeri.
const orphan = icons.filter((i) => groupOf(i.name) === 'Lainnya');
if (orphan.length) {
  console.warn('  [!] belum ada kelompoknya:', orphan.map((i) => i.name).join(', '));
}

const sizes = (body) =>
  [16, 20, 28]
    .map((s) => `<span class="box s${s}"><svg ${SVG_ATTRS} width="${s}" height="${s}">${body}</svg></span>`)
    .join('');

const sections = GROUPS.map(([label]) => {
  const items = icons.filter((i) => groupOf(i.name) === label);
  if (!items.length) return '';
  return `
    <section>
      <h2>${esc(label)} <span class="count">${items.length}</span></h2>
      <div class="grid">
${items
  .map(
    (i) => `        <figure class="cell">
          <div class="sizes">${sizes(i.body)}</div>
          <figcaption>${i.name}</figcaption>
        </figure>`
  )
  .join('\n')}
      </div>
    </section>`;
}).join('\n');

export { icons, sections };

const CSS = `
  :root {
    --bg: #fbfaf7; --panel: #fff; --line: #e4e0d6;
    --ink: #1f1d1a; --dim: #6b6559; --dimer: #9a9384; --accent: #3f6f4e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16150f; --panel: #1e1d16; --line: #33302a;
      --ink: #f2efe6; --dim: #b3ac9d; --dimer: #7d766a; --accent: #7fb894;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px;
    background: var(--bg); color: var(--ink);
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 8px; }
  h1 { font: 600 26px/1.2 ui-serif, Georgia, "Times New Roman", serif; margin: 0 0 6px; }
  .sub { color: var(--dim); font-size: 13.5px; margin: 0; }
  .sub code { font: 12px/1 ui-monospace, Consolas, monospace; color: var(--accent); }
  h2 {
    font: 600 15px/1 ui-monospace, Consolas, monospace;
    text-transform: uppercase; letter-spacing: .08em;
    color: var(--dim); margin: 40px 0 14px;
    display: flex; align-items: center; gap: 8px;
  }
  .count {
    background: var(--line); color: var(--dim);
    border-radius: 6px; padding: 2px 7px; font-size: 11px; letter-spacing: 0;
  }
  .grid {
    display: grid; gap: 1px; background: var(--line);
    border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  }
  .cell {
    margin: 0; padding: 16px 14px 12px; background: var(--panel);
    display: flex; flex-direction: column; gap: 10px;
  }
  .sizes { display: flex; align-items: center; gap: 14px; }
  .box { display: inline-flex; color: var(--ink); }
  .box svg { display: block; }
  figcaption {
    font: 11.5px/1.3 ui-monospace, Consolas, monospace;
    color: var(--dimer); cursor: pointer; user-select: all;
  }
  .cell:hover { background: var(--bg); }
  .cell:hover figcaption { color: var(--accent); }
  footer {
    margin-top: 48px; padding-top: 16px;
    border-top: 1px solid var(--line); color: var(--dimer); font-size: 12.5px;
  }`;

const JS = `
  // Klik nama ikon untuk menyalin nama komponennya.
  document.addEventListener('click', async (e) => {
    const cap = e.target.closest('figcaption');
    if (!cap) return;
    const cell = cap.closest('.cell');
    const name = cap.textContent.replace(/^tersalin: /, '');
    try {
      await navigator.clipboard.writeText(name);
      cap.textContent = 'tersalin: ' + name;
    } catch {
      // clipboard API butuh https/localhost; pilih manual sebagai gantinya.
      const r = document.createRange();
      r.selectNodeContents(cap);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    setTimeout(() => { cap.textContent = name; }, 1200);
  });`;

const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Galeri Ikon — Belajar Bersama</title>
<!--
  DIBUAT OTOMATIS oleh scripts/gen-icon-gallery.mjs — jangan diedit manual.
  Jalankan ulang:  node scripts/gen-icon-gallery.mjs
  Sumber:          src/shared/icons/Icon*.jsx
-->
<style>${CSS}</style>
</head>
<body>
  <header>
    <h1>Galeri Ikon</h1>
    <p class="sub">
      ${icons.length} ikon &middot; satu file per ikon di <code>src/shared/icons/</code> &middot;
      ditampilkan pada 16 / 20 / 28 px. Klik nama untuk menyalin.
    </p>
  </header>
${sections}
  <footer>
    Semua ikon memakai aturan yang sama: viewBox 0 0 24 24, stroke 1.5,
    currentColor, linecap/linejoin round. Ikon dibuat sendiri, bukan kloning
    library ikon apa pun.
  </footer>
<script>${JS}</script>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log(`${OUT} ditulis — ${icons.length} ikon.`);

