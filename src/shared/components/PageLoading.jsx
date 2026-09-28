import Spinner from './Spinner';

// Keadaan memuat untuk seluruh halaman/panel. Dipakai di banyak tempat dengan
// markup yang hampir identik (`flex justify-center` + padding yang
// berbeda-beda), sehingga tinggi dan jarak antar halaman tidak seragam.
//
// Dua hal yang dijaga di sini:
//  - `label` selalu tampil sebagai teks (lihat Spinner), jadi halaman tidak
//    pernah hanya menampilkan ring tanpa keterangan apa yang sedang dimuat.
//  - `min-h` memberi tinggi minimum supaya pergantian konten → daftar tidak
//    terasa "melompat" naik-tiba di halaman yang isinya pendek.
//
// `compact` untuk panel yang menempel di dalam halaman/dialog: pendek dan
// tanpa tinggi minimum. Ini memakai prop, BUKAN `className="py-8"`, karena
// kelas padding di dalam `className` tidak otomatis mengalahkan `py-12`
// bawaan — urutan kelas CSS ditentukan Tailwind, bukan urutan penulisan, jadi
// override seperti itu diam-diam tidak berlaku.
export default function PageLoading({ label, size = 28, className = '', compact = false }) {
  return (
    <div
      className={`flex items-center justify-center ${compact ? 'min-h-0 py-8' : 'min-h-[9rem] py-12'} ${className}`.trim()}
    >
      <Spinner size={size} label={label} />
    </div>
  );
}
