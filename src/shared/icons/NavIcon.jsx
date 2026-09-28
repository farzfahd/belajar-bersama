import { ICONS } from './index';

// Render ikon navigasi berdasarkan kunci string dari navConfig.
// Dipisah jadi komponen karena JSX tidak bisa menulis `<ICONS[k] />`.
//
// PENTING: span pembungkus memakai `flex`, BUKAN `inline-flex`.
// `inline-flex` ikut line-box dan duduk di atas baseline teks, sehingga
// line box menyisakan ruang descender di bawahnya -> ikon terdorong ke ATAS
// relatif terhadap label (terukur 2.8px di rail sidebar). `flex` tidak
// membentuk line box sama sekali. Sebagai flex item langsung, `inline-flex`
// juga akan di-blockify jadi `flex`, jadi mengubahnya tidak mengubah apa pun
// di BottomNav/Drawer.
export default function NavIcon({ name, size = 18, className = '' }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return (
    <span
      className={`flex shrink-0 items-center justify-center leading-none ${className}`.trim()}
      aria-hidden="true"
    >
      <Icon size={size} />
    </span>
  );
}

