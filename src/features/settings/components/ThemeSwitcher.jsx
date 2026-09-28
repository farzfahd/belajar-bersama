import { useEffect } from 'react';
import Badge from '../../../shared/ui/Badge';
import { loadPreviewHeadFonts } from '../../../app/themeFonts';
import { COLOR_THEMES } from '../../../app/themes';
import { useTheme } from '../../../app/providers';

// Pratinjau tiap tema memakai token NYATA: elemen pembungkus diberi
// `data-color-theme` + `data-mode`, jadi kartu di bawah membaca blok CSS yang
// sama dengan halaman — bukan salinan hex di JS yang bisa basi begitu palet
// diubah. Warna di dalam kartu otomatis benar untuk 12 kombinasi.
//
// Bentuknya sengaja datar: kartu dikotak penuh dengan radius 6px dan garis
// 1px, tanpa gradient/glow/shadow, sesuai design language "buku catatan".
// Yang ditandai "aktif" hanya lewat border accent + Badge, bukan fill warna.
export default function ThemeSwitcher() {
  const { mode, colorTheme, setColorTheme } = useTheme();

  // Pratinjau "Aa" memakai font heading asli tiap tema, jadi enam family
  // heading dimuat saat halaman ini dibuka (body & mono TIDAK dimuat — cukup
  // untuk contoh heading, dan memuat 15 family akan membuat halaman ini berat).
  // Saat offline semua fallback sistem tetap terbaca.
  useEffect(() => {
    loadPreviewHeadFonts(COLOR_THEMES.map((t) => t.id));
  }, []);

  return (
    <div>
      <div className="eyebrow mb-2 block">Tema</div>
      <p className="mb-3 text-[12px] leading-relaxed text-dimmer">
        Warna + font. Tersimpan di perangkat ini, tidak memengaruhi akun partner.
        Terang/gelap diatur terpisah di bawah.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_THEMES.map((theme) => {
          const active = theme.id === colorTheme;
          return (
            <button
              key={theme.id}
              type="button"
              // `data-mode` WAJIB ikut dipasang di sini: blok warna di
              // src/index.css selector-nya `[data-color-theme][data-mode]`, jadi
              // tanpa atribut ini kartu pratinjau tidak pernah mendapat token
              // temanya dan keenam palet akan tampak sama.
              data-color-theme={theme.id}
              data-mode={mode}
              aria-pressed={active}
              onClick={() => setColorTheme(theme.id)}
              className={`rounded-smc border p-3 text-left transition ${
                active
                  ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg'
                  : 'border-line hover:border-linestrong'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="font-head text-[19px] leading-tight"
                  style={{ color: 'var(--text)' }}
                >
                  Aa
                </span>
                {active && <Badge tone="accent">aktif</Badge>}
              </div>

              <div className="mt-1 text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                {theme.label}
              </div>
              <div
                className="font-mono text-[10px] uppercase tracking-[.06em]"
                style={{ color: 'var(--text-dimmer)' }}
              >
                {theme.hint}
              </div>

              {/* Strip palet: bg, panel, aksen, lalu tiga warna status — supaya
                  peran semantiknya (hijau=sukses, kuning=peringatan,
                  merah=error) kelihatan, bukan cuma satu warna dekoratif. */}
              <div className="mt-2.5 flex gap-1" aria-hidden="true">
                {['--bg', '--bg-elevated', '--accent', '--ok', '--warn', '--danger'].map((token) => (
                  <span
                    key={token}
                    className="h-3 flex-1 rounded-[3px]"
                    style={{
                      backgroundColor: `var(${token})`,
                      boxShadow: 'inset 0 0 0 1px var(--border)'
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
