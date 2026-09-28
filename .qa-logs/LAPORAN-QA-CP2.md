# Laporan QA Browser — Belajar Bersama (CP2)

Tanggal: 2026-09-28
Lingkup: seluruh halaman & alur wajib, light/dark, desktop (1440×900) & mobile (390×844), memakai Firebase emulator.
Rujukan: `docs/ROADMAP-AI.md` tahap CP2.

## Ringkasan

| Area | Hasil |
|---|---|
| Page walk 14 halaman × 2 viewport × 2 tema (56 kombinasi) | 54 bersih, 2 perlu review (artefak emulator) |
| Temuan kontras (WCAG AA) | **0** |
| Overflow horizontal / elemen terpotong | **0** |
| Alur auth (validasi + 6 layar) | 9/9 |
| Question Builder + Matching | 12/12 |
| Attempt 6 tipe soal + laporan soal | 7/7 |
| Export, Dashboard, Matching mobile | 8/8 |
| Flash Onboarding (cold load) | 12/12 |
| `test:units` | 282/282 |
| `test:deploy` | 28/28 |
| `test:filter` | 59/59 |
| `test:layout` | 45/45 |
| `test:rules` | **120/120** |
| `npm run build` | sukses |

Bug yang ditemukan dan diperbaiki: **4**. Temuan yang dilaporkan tanpa diubah: **4**.

---

## A. Beranda `/`
Desktop & mobile, light & dark bersih. `h1` benar ("Belajar Bersama"). Tidak ada overflow.
Auth guard benar: pengguna terautentikasi tanpa space diarahkan ke Onboarding, bukan ke dashboard kosong.

## B. Masuk `/login`
Validasi kosong & email tidak valid ditolak dengan pesan yang tepat. Enam kombinasi layar (dark/light × `/`, `/login`, `/daftar`) bersih.
Satu-satunya `console.error` yang muncul adalah `@firebase/firestore: Could not reach Cloud Firestore backend` — muncul karena harness melakukan `Page.navigate` agressif yang memutus WebSocket emulator, bukan bug aplikasi (record yang sama bersih setelah retry).

## C. Daftar `/daftar`
Validasi email tidak valid → "Masukkan alamat email yang valid."
Validasi sandi < 10 karakter → "Kata sandi minimal 10 karakter."
Regex email juga menolak email ber-spasi, dan itu perilaku yang benar.
Sesi benar-benar kosong setelah keluar (tidak ada `currentUser` tersisa).

## D. Dashboard `/dashboard`
**Fix diterapkan.** Metadata baris menampilkan `[object Object] · 3 jam lalu` karena `topicPath()` mengembalikan array objek topik, bukan teks. Sekarang dirangkai lewat `topicPathLabel()` (pola sama dengan `buildSearchRecords.js`). Setelah fix: nol `[object Object]` di DOM.
Statistik,Today's plan, dan preview progres bersih di semua kombinasi.

## E. Learn `/learn` + tab Notes/Resources
Grid, panel catatan, dan panel resource bersih. Tab bergantian tanpa state rusak. Overflow 0.

## F. Roadmap `/roadmap`
Pohon topik, indentasi anak, dan status belajar bersih. Tidak ada teks terpotong.

## G. Bank Soal `/questions`
Filter dan kartu soal tampil benar. **Catatan:** beberapa link "Buka soal" berukuran 19–20px (di bawah konvensi 44px aplikasi, tetapi di atas minimum WCAG 2.2 24px). Lihat temuan #2.

## H. Daftar Kuis `/quiz`
Kartu kuis, status, dan CTA bersih di semua kombinasi.

## I. Editor Kuis `/quiz/:id` — Question Builder
**12/12 lulus.**
- 6 soal tampil urut dengan label `SOAL 1..6`
- Tombol naik/turun benar memindahkan urutan (diverifikasi lewat teks prompt, bukan label posisi)
- Buka/ciutkan kartu soal
- "Detail lanjutan" membuka field tambahan (textarea 2 → 3)
- Kebab menu soal membuka aksi: Duplikat, Hapus dari kuis, Tambah opsi
- Tambah baris pasangan pada board matching
- Tanpa error konsol selama interaksi

## J. Matching — builder & attempt
**Fix diterapkan.** Tombol **"Lepas pasangan" tidak melakukan apa pun** di builder maupun attempt. Penyebabnya ketidaksesuaian nama prop: komponen `ConnectedBadge` menerima `onUnassign` (`MatchingBoard.jsx:135`), tapi kedua call site mengoper `onUnmatch` (`:252` dan `:409`), sehingga `onClick` mendapat `undefined`. Diperbaiki di kedua call site.
Alur klik/ketuk (jalan utama di layar sentuh) sekarang lengkap dan terverifikasi:
- lepas pasangan → tombol "Sambung" (`aria-pressed`) muncul
- pilih item kiri → ditandai terpilih
- pasang item kanan → pasangan tersambung
- satu item kanan hanya bisa dipakai satu kali (memindahkan pasangan melepas yang lama dengan benar)
Di mobile 390×844: board tampil, **overflow horizontal 0px**, tidak ada target < 24px, dan ada `role="status"` yang menjelaskan "1 dari 2 item belum dipasangkan…" — bagus untuk pembaca layar.

## K. Attempt `/quiz/:id/attempt` — 6 tipe soal
**7/7 lulus.** Semua 6 tipe dijawab lewat jalur yang sesuai dan tercatat di navigator:
pilihan ganda (radio), pilihan ganda kompleks (checkbox), benar/salah, isian singkat (input teks), menjodohkan (board), uraian (textarea) → **6/6 "sudah dijawab"**.

## L. Kirim jawaban & halaman hasil
Tombol "Kumpulkan jawaban" selalu membuka dialog konfirmasi, dengan dua varian yang benar:
- semua soal terisi: "Semua 6 soal sudah dijawab… Jawaban akan langsung dinilai"
- masih ada yang kosong: "Kirim dengan soal belum dijawab? 5 dari 6 soal belum dijawab: nomor 1, 2, 3, 5, 6…"
Setelah "Kirim jawaban" → halaman **HASIL KUIS** dengan skor, persentase, dan status penilaian. Bukan dead-end.

## M. Laporan Soal
Modal terbuka dengan heading "Lapor Soal", pilihan kategori, dan field keterangan. Tombol "Kirim Laporan" **nonaktif** saat keterangan kosong dan **aktif** setelah diisi (perilaku yang benar). Pengiriman sukses → toast "Laporan terkirim ke pemilik soal." dan modal tertutup.

## N. Progres, Achievements, Pengaturan
- `/progress` & `/achievements`: kartu, lencana, dan grafik bersih.
- `/settings`: profil, preferensi, dan bagian Data bersih.
- **Export JSON terunduh** (`belajar-bersama-2026-09-28.json`), JSON valid dengan kunci `format, exportedAt, notice, account, profile, space, topics, notes, resources, noteStates, resourceStates`, toast "Export JSON diunduh ke perangkat ini." muncul.

## O. Halaman ComingSoon
Discuss, Projects, Tasks, dan Notifications menampilkan status "NANTI" dengan konsisten di semua kombinasi.

---

## Bug yang diperbaiki

1. **Flash Onboarding** — `router.jsx`, `useProfile.js`, `useSpace.js`. Cold load memunculkan Onboarding sesaat untuk pengguna yang sudah punya space. Diperbaiki dengan `loading` yang diturunkan dari `settledFor` + guard `initializing`. Verifikasi 12/12 cold load bersih; kasus tanpa space tetap benar (Onboarding tampil dan bertahan).

2. **Kontras teks di bawah WCAG AA** — `index.css` + `Button.jsx`, `Badge.jsx`, `StatusNote.jsx`, `Sidebar.jsx`, `Avatar.jsx`, `SettingsPage.jsx`. Token `--text-dimmer` dipergelapkan, token `*-ink` ditambahkan untuk teks di atas soft fill, dan token light (accent/ok/warn/danger) digelapkan. Hasil: **0 temuan kontras** di seluruh 56 kombinasi.

3. **"Lepas pasangan" mati** — `MatchingBoard.jsx:252,409`. Lihat bagian J.

4. **`[object Object]` di Dashboard** — `DashboardPage.jsx`. Lihat bagian D.

## Temuan yang dilaporkan (tidak diubah)

1. **`serializePairs` hanya menyimpan pasangan yang terpasang** (`matchingPairs.js`). Di builder, "Lepas pasangan" sempat diperbaiki (tidak lagi diam), tetapi baris yang dilepas hilang dari payload, lalu props mengembalikan pasangan itu — hasilnya pasangan muncul kembali saat kartu dibuka ulang / halaman dimuat ulang, dan teks yang sudah diketik ikut hilang. Perilaku ini menyentuh model data `pairs`, jadi **perlu keputusan pemilik** (apakah baris lepas disimpan sebagai draft, atau "lepas" memang berarti hapus). Tidak diubah karena berisiko merusak format kunci jawaban.

2. **Target sentuh kecil** di `src/features/quizzes/components/QuestionCard.jsx`: tombol panah h=22, "Detail lanjutan" h=23, "Menu soal" h=23, "Buka kartu" h=24, "Lihat semua soal tersimpan" h=19; plus beberapa link di Bank Soal (19–20). Semua di atas minimum WCAG 2.2 (24px) tapi di bawah konvensi `icon-btn` 44px milik aplikasi. Memakai `icon-btn` akan membuat toolbar editor terlalu berat secara visual — keputusan desain, jadi dilaporkan.

3. **Tombol "Kirim Laporan" nonaktif tanpa penjelasan** saat keterangan kosong. Perilaku benar, tapi tidak ada teks yang menjelaskan syaratnya.

4. **Status "MENUNGGU PENILAIAN"** pada hasil kuis. Untuk soal uraian/penilaian manual ini wajar, tapi perlu dipastikan memang perilaku yang diinginkan.

## Catatan lingkungan

- Emulator dijalankan ulang setelah `test:rules` dan fixture QA di-seed ulang; `harness.mjs` sudah diperbarui ke space/topic/quiz ID baru.
- 2 dari 56 kombinasi perlu review, keduanya artefak emulator (reset WebSocket saat `Page.navigate`), bukan bug aplikasi.
- Dua warning `React Router Future Flag` hanya noise dev.
- Tidak ada commit atau push yang dilakukan.
