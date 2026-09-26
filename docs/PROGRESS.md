# PROGRESS — Belajar Bersama

Status umum tanggal **2026-09-26**: **Checkpoint 1–4, CP2.4 Resources, CP2.5 Heatmap/Riwayat, CP2.6 Chart/Badge, CP2.7 Tags & pencarian global, dan item CP7 Dashboard/Settings/Data SELESAI di kode**. BrowserRouter dipakai agar URL navigasi bersih, export JSON lokal, penghapusan materi pribadi + akun Auth, serta SECURITY.md sudah ditambahkan. **Build hijau, unit 23/23, audit dependency produksi 0 kerentanan.** Privasi notes/resources ditegakkan server-side dengan pola dual-listener. Emulator tetap persisten (`--import/--export-on-exit` via `npm run emulators`).

## 1. Ringkasan status

| Area | Status | Catatan |
|---|---|---|
| Scaffold React+Vite+Tailwind+Firebase | ✅ Selesai | emulator-first; offline-ready (font sistem) |
| Auth email/password + verifikasi email | ✅ Selesai | verified wajib utk create/join |
| Auth Google (produksi) | ✅ Kode siap | otomatis nonaktif saat mode emulator |
| Space 2-user + undangan kode sekali pakai | ✅ Selesai | tanpa batch lintas-koleksi (rules emulator tak lihat tulisan batch); 2 langkah + cleanup yatim |
| Firestore Security Rules (deny-by-default) | ✅ Selesai | 59 tes; **run terakhir 59/59 lulus** (2026-09-26) |
| Tes aturan (59) | ✅ Lulus | 2026-09-26; regresi sinkronisasi visibility state, cek-keberadaan ruang saat create, validasi `validParent`, dan regex URL ketat |
| Unit test utilitas murni (`test:units`) | ✅ Lulus | **23/23** (2026-09-26): navigasi, progress, privasi pencarian, utilitas pohon topik |
| E2E privasi dua akun | ✅ Lulus | `npm run test:privacy:e2e` **37/37** (2026-09-26); termasuk dialog "Cari di ruang"; menggantikan uji manual A/B |
| Tema "buku catatan/jurnal akademik" | ✅ Selesai | token + komponen dasar + semua layar |
| Layout & navigasi (CP2) | ✅ Selesai | sidebar 216px, bottom-nav 7 ikon + drawer, topbar solid, semua menu + placeholder |
| **Roadmap / Topik (CP3)** | ✅ Selesai | pohon 3 level expand/collapse + CRUD (tambah/ubah/hapus/pindah/urutkan) + detail topik ber-tab + import template |
| Halaman shell Dashboard/Learn (CP2) | ✅ Selesai | seksi konten diisi CP4–7 |
| Settings | ✅ Selesai | profil, ruang, tema, keamanan |
| **Notes (editor + states)** | ✅ Selesai | CP4 — editor, daftar, bookmark/"dipahami", soft-delete/Sampah, purge; E2E 37/37 & test:rules 59/59 |
| **Resources & reading list (CP2.4/CP5)** | ✅ Selesai | link-only resource + form create/edit, filter topik/path, status baca per-user, checkbox "Sudah dilihat", private/shared, hapus |
| **Progress & Achievements (CP2.5/CP2.6)** | ✅ Selesai | heatmap dashboard 8/12 minggu, Riwayat 7×24 + jurnal, chart SVG, badge derivatif dari snapshot |
| **Tags & Pencarian global (CP2.7)** | ✅ Selesai | Fuse.js dari Topbar; cari topik/catatan/resource/tag/path; tag filter; private/deleted difilter sebelum index |
| Dashboard minimal + export/hapus data | ✅ Selesai | CP7; export lokal, hapus materi sendiri + akun Auth |
| Deploy (GitHub Pages / hosting) | ⚠️ Siap dengan fallback | BrowserRouter, base `./`, perlu `404.html`/rewrite untuk refresh deep-link + konfigurasi Console manual |

Catatan penghapusan: Rules melarang penghapusan profil Firestore dan space secara client-side. Karena itu alur hanya menghapus dokumen Notes/Resources/state milik akun, melepaskan `spaceId`, lalu menghapus akun Auth; data partner dan space tidak disentuh.

Catatan backlog: `noteReports` sudah menyimpan laporan pembaca secara aman, tetapi belum memiliki UI inbox. Report akan dihubungkan ke fitur Notifikasi pada fase lanjutan; sementara ini dapat diperiksa melalui Firestore Emulator UI.

### 2026-09-26 — Audit keamanan dan kesiapan deploy
- Audit konfigurasi produksi menemukan `.env.production.local` terisi dan `VITE_USE_EMULATORS=false`; nilai lokal tetap tidak dilacak Git.
- App Check Enterprise, CSP reCAPTCHA, dan validasi konfigurasi Firebase diperketat; konfigurasi inti yang tidak lengkap sekarang tidak dianggap siap produksi.
- Workflow `.github/workflows/deploy-pages.yml` ditambahkan untuk build/deploy GitHub Pages menggunakan GitHub Repository Variables.
- Folder export emulator lokal (`firebase-export-*/`) ditambahkan ke `.gitignore` agar data akun/data uji tidak ikut ter-upload.
- Verifikasi: `npm run build` ✅, `npm run test:units` ✅ 23/23, `npm run test:rules` ✅ 77/77, `npm audit --omit=dev --offline` ✅ 0 kerentanan.

### 2026-09-26 — Migrasi App Check ke reCAPTCHA Enterprise
- Provider App Check produksi di `src/lib/firebase.js` diubah dari `ReCaptchaV3Provider` ke `ReCaptchaEnterpriseProvider`.
- Emulator tetap melewati App Check; site key produksi tetap diisi melalui `VITE_RECAPTCHA_SITE_KEY`.
- `npm run build` ✅.

### 2026-09-26 — Deploy fallback dan coverage report
- Build sekarang menjalankan `postbuild` untuk menyalin `dist/index.html` menjadi `dist/404.html`, sehingga GitHub Pages dapat melayani fallback untuk deep-link BrowserRouter.
- Vite dev server dikunci ke `127.0.0.1` agar harness Chrome E2E dapat mengakses modul Vite pada lingkungan offline.
- Tes Rules ditambah untuk `noteReports`: hanya anggota yang membaca note shared dapat membuat report, dan report dapat dibaca pelapor atau pemilik note; update/delete ditolak.
- `npm run build` ✅ menghasilkan `dist/404.html`.
- `npm run test:rules` ✅ **77/77** setelah emulator aktif dihentikan secara graceful; coverage `noteReports` ikut lulus.

### 2026-09-26 — Perbaikan Notes: alur baca/edit, deskripsi, report, dan hapus akun
- **Hapus akun:** alur tidak lagi mencoba mengosongkan `users/{uid}.spaceId`, karena Rules hanya mengizinkan perubahan tersebut pada kondisi ruang yang sudah hilang. Materi pribadi tetap dihapus, lalu akun Auth dihapus; Space dan data partner tidak disentuh.
- **Edit note:** effect pemuatan form kini menunggu snapshot note tersedia sebelum menandai note sebagai sudah dibuka, sehingga data lama tidak lagi tampil kosong saat masuk mode edit.
- **Tampilan note:** daftar `/learn` menampilkan judul dan `description` singkat. `/notes/{id}` menjadi halaman baca; pemilik mendapat tombol Edit dan pembaca hanya mendapat Report.
- **Report:** pembaca dapat mengirim jenis `error` atau `feedback` dengan pesan maksimal 2.000 karakter. Data disimpan di `spaces/{spaceId}/noteReports`; belum ada inbox UI sampai fase Notifikasi.
- **Verifikasi:** `npm run build` ✅ dan `npm run test:units` ✅ 23/23. `npm run test:rules` belum dapat dimulai karena proses Java emulator lama masih memegang resource emulator; tidak dihentikan paksa sesuai aturan `AGENTS.md`.

### 2026-09-26 — Penutupan item Fase 1 CP7
- Dashboard menampilkan Notes terbaru milik sendiri, resource berstatus sedang dibaca, Notes shared partner, serta statistik topic completed dan Notes shared.
- Settings kini menyediakan export JSON lokal yang menyertakan hanya data yang sedang dapat dibaca akun, plus konfirmasi ketik `HAPUS AKUN` untuk menghapus materi pribadi dan akun Auth.
- Router menggunakan BrowserRouter agar URL bersih seperti `/roadmap`; GitHub Pages memerlukan fallback `404.html` untuk refresh deep-link.
- `SECURITY.md` ditambahkan dengan model ancaman, kontrol Rules/App Check, konfigurasi Console, batasan Spark/no backend, penghapusan, rotasi key, dan prosedur verifikasi.
- Verifikasi: `npm run build` ✅; `npm run test:units` ✅ 23/23; `npm audit --omit=dev --offline` ✅ 0 vulnerability. `test:rules` dan privacy E2E memerlukan emulator sesuai SOP.

## 2. Riwayat pekerjaan

### 2026-09-26 — CP3 (baru) T1: skema data + rules untuk Questions/Quiz/Tasks/Today/Progress
- **Keputusan pengguna:** lanjut ke CP3 (pekerjaan baru: quiz/task & progress dengan status+skor), cakupannya **Questions (bank soal), Quiz (soal+skor), Tasks (penugasan), dan Today (rencana harian)**; status & skor disimpan **per topik per user**; "commit/sinkron" dimaknai **sinkron live saja** (onSnapshot), tanpa fitur commit terpisah.
- **T1 selesai — 5 koleksi baru** (`questions`, `quizAttempts`, `topicProgress`, `tasks`, `dailyPlans`) dengan rules + 17 tes baru. Rincian field & aturan ada di `ROADMAP-AI.md` §3.1. `npm run test:rules` **76/76**.
- **Keputusan skema yang dipaksakan oleh keterbatasan bahasa rules** (penting untuk AI berikutnya):
  - `options` harus **tepat 4** — rules tidak punya loop/`List.all()`, jadi indeks 0–3 hanya bisa divalidasi satu per satu.
  - `changed().affectedKeys().hasOnly([...])` **tidak didukung** emulator proyek ini; daftar field terlarang untuk assignee ditulis terbalik (`!changed().hasAny([...])`). **Konsekuensi: field baru di `validTask()` wajib ditambahkan ke daftar itu**, kalau tidak assignee bisa mengubahnya.
  - `dailyPlans.items` memakai **map** (bukan list) agar toggle satu item tidak menulis ulang dokumen; isi entri tidak divalidasi rules.
  - `quizAttempts` hanya boleh ditulis sekali (`update`/`delete` = `false`) supaya skor tidak bisa dimanipulasi setelah tercatat.
  - `tasks`: `status == 'done'` harus disertai `doneAt` — membuka lagi wajib mengirim `doneAt: null`.
- **Dua regresi yang saya buat sendiri lalu tertangkap tes** (keduanya sudah diperbaiki): (a) `validTask` awalnya menulis `... && d.assigneeId == null || (...)` — karena `&&` mengikat lebih kuat, aturan bisa lolos hanya karena `assigneeId == null`; kini diapit kurung dan ada tes regresi (`assigneeId` angka/boolean/kosong ditolak). (b) Tes sempat menulis `query(db, collectionRef, where(...))` — argumen `db` yang kelewat itu membuat error palsu `_freezeSettings`; koreksinya `query(collectionRef, where(...))` dan cabang shared **wajib dua filter** (`visibility` + `deletedAt == null`) sesuai pola dual-listener.
- **Yang belum (T2–T6):** service/hook/halaman Questions, alur quiz+skor, Tasks, Today, dan pemakaian skor pada Progress/Achievements. Rincian di `ROADMAP-AI.md` §3.1.

### 2026-09-26 — Penutupan 10 gap audit CP2/CP6 (CP2.5 & CP2.6 kini terverifikasi penuh)
- **Tujuan:** menutup seluruh 10 gap presisi dari entri audit di bawah sebelum masuk CP7, masing-masing dengan bukti tes — bukan sekadar penyesuaian tampilan.
- **Privacy (CP6/CP2.7) — dari "tanpa tes" jadi 37/37 E2E.** Unit `tests/visibility.test.mjs` memverifikasi `visibleActiveNotes`/`visibleActiveResources`: materi privat partner, soft-delete, dan tag count terbuang sebelum index. E2E kini benar-benar membuka dialog **Cari di ruang**: judul privat → "0 hasil" tanpa fragmen body; judul shared → muncul; path topik tampil; chip & filter tag privat partner tidak muncul (padahal tag yang sama dipakai materi privat A, jadi filter tag tidak bisa "menghidupkan" materi privat); owner sendiri tetap bisa mencari materi & tag privatnya.
- **Tag privat khusus untuk mendeteksi kebocoran tag:** note privat A memakai tag `rahasia-tag`; jika tag bocor ke partner, chip `#rahasia-tag` akan muncul di dialog B — sekarang tidak.
- **Roadmap (CP2.2):** urutan sibling di-*renumber* `0..n-1` (`renumberSiblings`/`reorderSiblings`, bukan tukar-dua-nilai) dan topik hasil pindah selalu masuk **akhir** grup tujuan. Kemajuan subtree dihitung menyeluruh (`progressStats`) di halaman Subject maupun subtopic, bukan hanya anak langsung. Jumlah note/resource dan seluruh aksi ( tambah/pindah/naik/turun/edit/hapus) kini terjangkau di lebar mobile — hanya membungkus ke baris kedua, bukan hilang di balik breakpoint.
- **Rules (deny-by-default):** `validParent(spaceId, d, topicId)` mewajibkan dokumen induk ada **dan** `parent.level == level - 1`; memakai `existsAfter`/`getAfter` agar commit batch template tetap sah.Digabung dengan level 0–2 + aturan ini membuat siklus dan rujukan level salah mustahil, bukan sekadar dicegah UI. Regex URL diperketat ke `(?i)^https?://[A-Za-z0-9._~%][^\s]*$` agar setara `isHttpUrl` (menolak `https://`, `https://:80`, `https:///path`, whitespace).
- **Template & design system:** label jadi `＋ Import template roadmap`; roadmap non-kosong tidak lagi ditolak — meminta konfirmasi lalu menumpuk materi baru setelah materi lama (`rootOrder` = max `order` topic root + 1). Sel heatmap & riwayat memakai `rounded-smc` (6px). Klaim "satu-satunya kotak penuh" diluruskan: achievement satu-satunya di **konten**, `Modal`/`Toast` adalah pengecualian overlay yang disengaja (ONBOARDING-AI §6).
- **Pencarian:** `buildSearchRecords` kini memetakan `description` note (resource sudah), dan import search memakai ekstensi `.js` agar bisa diuji di Node.
- **Verifikasi:** `npm run build` hijau · `npm run test:units` **23/23** (script baru, menyatukan navigasi/progress/visibilitas/pohon topik) · `npm run test:rules` **59/59** · `npm run test:config` **3/3** · `npm run test:progress` **5/5** · `npm run test:privacy:e2e` **37/37** · `npm run test:cleanup` 0 akun/0 ruang sisa.
- **Catatan flakes yang ditangani di harness:** (a) chip tag dirender `uppercase` via CSS sehingga pencocokan teks harus case-insensitive; (b) setelah subscribe/unsubscribe banyak, Firestore client kadang perlu beberapa detik untuk online kembali — harness kini menunggu `users/<uid>` bisa dibaca (dengan retry) sebelum probing sesi berikutnya, alih-alih gagal dengan "client is offline".
- **Keputusan emulator vs produksi** tetap berlaku: emulator menyaring list berdasarkan *rule*, bukan *query constraint*, jadi query `visibility == 'shared'` milik owner ikut mengembalikan dokumen privatnya sendiri. Bukan bug produksi.

### 2026-09-26 — Audit checkpoint CP2/CP6 + 3 regresi privasi yang ditemukan & diperbaiki
- **Tujuan:** verifikasi klaim "SELESAI" di `ROADMAP-AI.md` terhadap kode nyata, plus membangun E2E privasi dua akun yang belum pernah ada (sebelumnya hanya "uji manual" yang disarankan). Hasil: **hampir semua klaim terverifikasi**, tetapi audit membongkar **3 regresi fatal** yang tak terlihat karena tidak pernah diuji end-to-end.
- **REGRESI 1 — `createSpace()` mustahil bagi user baru (DIPERBAIKI).** `spaceService.createSpace` memanggil `getDoc(spaces/space_<uid>)` untuk mengecek keberadaan ruang; dokumen itu belum ada, sehingga `isMemberOf()` fail-closed → **permission-denied**. Akibatnya tidak ada user baru yang bisa membuat ruang (onboarding buntu). Perbaikan: helper rules baru `ownPendingSpace(spaceId)` — mengizinkan `get` **hanya** untuk `space_<uid>` sendiri **dan** hanya bila dokumen itu tidak ada (`!exists`), jadi tidak ada data yang bisa bocor.
- **REGRESI 2 — kode undangan sah selalu gagal join (DIPERBAIKI).** `joinSpaceByCode` membaca dokumen ruang **sebelum** jadi anggota → rules menolak (fail-closed) → partner tidak pernah bisa bergabung. Perbaikan: hapus prabaca; `memberIds` disusun dari `inviteData.createdBy` (undangan dijamin rules hanya dibuat saat ruang beranggota 1, dan `canJoin()` tetap memvalidasi ulang 1→2 anggota + keabsahan undangan). Jalur pemulihan: undangan `used` oleh uid sendiri langsung menautkan profil tanpa join ulang. `permission-denied` saat commit → pesan ramah "kode tidak lagi berlaku".
- **REGRESI 3 — `noteVisibility`/`resourceVisibility` terkunci immutable (DIPERBAIKI).** Field mirror visibility tidak boleh berubah, padahal harus sinkron saat owner mengubah visibilitas konten. Di Rules: `immutable(['uid','noteId'])` / `immutable(['uid','resourceId'])`; verifikasi ke dokumen asli tetap. Ditutup 2 tes regresi.
- **`firestore.indexes.json`:** composite index `notes(visibility ASC, deletedAt ASC)`; index legacy notes/resources yang tidak lagi dipakai dibuang.
- **Harness `tests/privacy-e2e.mjs` diperbaiki:** CDP `sessionId` jadi field top-level (bukan di dalam `params`); signup/signin lewat `authSvc` (instance Auth bukan namespace); `createSpace` retry + cetak klaim `email_verified`; query ganda notes/resources memakai **SDK Firestore yang sama dengan app** (dep Vite `/node_modules/.vite/deps/firebase_firestore.js?v=<hash>`) alih-alih REST `:runQuery` yang ditolak emulator v1.19.8 (`Payload isn't valid for request` untuk semua bentuk `from[].parent`); helper `fsDocData` untuk memeriksa isi dokumen; detail check UI satu baris + potongan sekitar string yang bocor. Marker body note privat dipisah dari note shared (sebelumnya sama-sama memakai "jangan bocorkan" → check privacy false positive).
- **Tertangkap oleh E2E (dua pedoman, bukan bug app):** emulator menyaring list **berdasarkan rule, bukan query constraint** - jadi query `visibility == "shared"` milik A ikut mengembalikan note privat A (A adalah owner). Di produksi query tersebut tetap menyaring; check E2E ditulis tahan terhadap perbedaan ini.
- **Verifikasi:** `npm run test:rules` **56/56** (emulator dimatikan via Ctrl+C), `npm run test:privacy:e2e` **29/29**, `npm run build` hijau. `tests/tmp-probe.mjs` (probe diagnostik) dihapus. Emulator dibersihkan total: 0 akun / 0 ruang / 0 profil / 0 undangan (artefak probe & 10 ruang sisa run E2E yang gagal dihapus satu per satu berdasarkan UID/nama, bukan massal).
- **⚠️ `ROADMAP-AI.md` §2 "Kriteria selesai CP2" — item "uji manual dua akun" sekarang TERPENUHI oleh E2E 29/29** (bukan hanya manual): A membuat ruang, B gabung via kode, A buat note/resource privat+shared, seluruh aturan privat/403 B diuji via REST dan UI, soft-delete→Sampah→restore, tanpa error konsol.
- **Hasil audit (ringkas, detail di `ROADMAP-AI.md` §2.1):** CP2.1, CP2.2, CP2.3, CP2.4, CP6 → terverifikasi. CP2.5/CP2.6 → terverifikasi dengan 4 gap presisi. Gap yang tercatat: (a) **CP6 privacy tidak punya tes otomatis sama sekali** (dialog cari tidak pernah dibuka di E2E); (b) jumlah notes/resources per node Roadmap disembunyikan di lebar <640px (`hidden sm:inline`), tombol pindah-parent di <640px & urutkan di <768px — tidak terjangkau di mobile; (c) "Kemajuan subtopic" hanya menghitung anak **langsung** (di halaman Subject = jumlah Topic, bukan subtopic); (d) badge bukan satu-satunya kotak penuh — `Modal.jsx` & `ToastProvider.jsx` juga bg+border+shadow (overlay, bukan content card); (e) sel heatmap `rounded-[2px]`, bukan 6px §6; (f) urutan (`order`) di Roadmap ditukar dua nilai, bukan renumber → dua sibling dengan `order` sama membuat urutkan diam-diam; (g) label tombol template adalah "＋ Template" (bukan "Import template roadmap"); (h) rules tidak memverifikasi `parentId` **ada** & `parent.level == level-1` (hanya tipe) — UI yang menjaga; (i) catatan `description` (diizinkan rules) tidak diindeks Fusion, berbeda dari resource.

### 2026-09-25 — CP2.4/CP5 Resources + CP6 Tags & pencarian global
- **Resources & reading list selesai:** `ResourceFormModal` untuk create/edit link-only resource, filter topik dan subtree di Learn/Topic Detail, status per-user (`reading`/`completed`), serta checkbox **"Sudah lihat"**. Resource private/shared, tag, author, estimasi waktu, jenis, difficulty, dan hapus permanen mengikuti pola existing.
- **Hardening CP5:** `resourceService` kini menolak payload di luar batas/format (URL http/https, enum, estimasi bilangan bulat) tanpa memotong diam-diam; `resourceVisibleTo` mewajibkan uid dan memblokir `deletedAt`; panel menangani loading/error dan menjelaskan kebutuhan topic.
- **CP6 selesai:** Topbar membuka dialog **Cari di ruang**. `Fuse.js` mengindeks title, isi/deskripsi, author/URL, tag, dan breadcrumb topik. Filter private/shared + deleted diterapkan sebelum index/tag count, sehingga materi partner yang tidak terlihat tidak bocor. Klik topik/catatan menuju route; resource membuka URL eksternal.
- **Verifikasi:** `npm run build` hijau (127 modul); `npm run test:rules` **43/43** termasuk LIST resource; probe resource **18 lulus, 0 gagal**; smoke test search memverifikasi privacy, path topik, tag, dan fuzzy typo. Uji manual dua akun tetap disarankan.
- **Tidak mengubah `firestore.rules`** pada checkpoint ini; privacy queryable tetap memakai filter aplikasi yang sudah disepakati untuk M10/M12. **[USANG — lihat entri 2026-09-26: privasi kini ditegakkan kembali di `firestore.rules` lewat dual-listener.]**

### 2026-09-25 — CP2.5/CP2.6 Progress & Achievements
- Heatmap kontribusi tampil di Dashboard (8 minggu) dan halaman Progress (12 minggu), dengan warna fase mulai/belajar/selesai. Riwayat menampilkan grid 7×24 dan jurnal perubahan dari timestamp `topics`, `notes`, `resources`, `noteStates`, dan `resourceStates`; data private/deleted difilter sebelum dihitung.
- Chart lokal menggunakan SVG tanpa CDN/dependency baru: line chart skor materi, bar chart fase, grid/tick mengikuti CSS variable. Enam badge achievement dihitung dari snapshot Learning Together.
- Route `/progress` dan `/achievements` replaces placeholder; `npm run test:progress` 5/5, `npm run test:config` 3/3, dan `npm run build` hijau. Skor/activity adalah snapshot timestamp, bukan audit trail atau skor quiz.
- Catatan: `npm run test:rules` tetap perlu dijalankan ulang setelah emulator dihentikan dengan Ctrl+C untuk memverifikasi perubahan rules sebelumnya.

- Permintaan user: mengetik semudah Word — tombol bold/italic/link tanpa menulis sintaks markdown manual. Karena env offline (tak bisa pasang TipTap/Quill, tanpa CDN) dan data catatan tersimpan sebagai markdown, dipilih pendekatan **"bantuan markdown"** (disetujui user).
- `NoteEditorPage.jsx`: toolbar di atas textarea (B, I, H = sub judul `## `, 🔗 link, • daftar, ☑ checklist, kode inline, ❞ kutipan) — membungkus teks terpilih / menyisipkan awalan baris, kursor tetap dipilih setelah sisip.
- **Pintasan:** Ctrl+B (bold), Ctrl+I (miring), Ctrl+K (buka dialog link). Tombol **🔗** membuka panel kecil: Teks (terisi otomatis dari seleksi) + URL (validasi `isHttpUrl`, pesan bila bukan http/https), tombol Sisipkan → `[teks](url)`. Data tetap markdown → pratinjau & fitur lama utuh.
- **Lanjutan (sesi sama):** **undo/redo tuntas** — riwayat body dipegang sendiri (`past`/`future` refs), jadi **Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z berlaku untuk pengetikan maupun operasi toolbar** (bold/italic/link/daftar/dll), granularitas pengetikan digabung per ~700ms atau perubahan besar (paste/hapus blok). **Editor live-highlight** (`MarkdownEditor.jsx`): textarea teks transparan di atas lapisan render hasil parse — penanda markdown (`**`, `#`, backtick, braket link) tampil **samar**, teks `**bold**` benar-benar **bold**, `*miring*` miring, `[teks](url)` berwarna terracotta, penanda daftar/judul/checklist **berwarna zaitun** — persis seperti tampilan preview, sambil tetap menyimpan markdown; scroll disinkronkan.
- **Perbaikan masukan pengguna (sesi yang sama): (a) Enter melanjutkan list** — baris berpenanda (`- `, `* `, `+ `, `1. `, `> `, `- [ ] `) yang dienter membuat baris baru dengan penanda sama (nomor bertambah otomatis); Enter pada baris list kosong menutup list. Sebelumnya baris lanjutan tanpa penanda digabung `marked` (dengan `breaks:true`) ke `<li>` sebelumnya sehingga di pratinjau list tampak tidak lanjut. **(b) Toggle bold/italic** — Ctrl+B pada teks yang sudah `**tebal**` kini melepas pembungkus (kasus: seleksi memuat penanda utuh → buang penanda; penanda tepat di luar seleksi → buang; selain itu bungkus), bukan menambah bintang. Berlaku juga untuk toolbar & Ctrl+I.
- **Kombinasi bold+italic (tindak lanjut):** tempatkan `*` tunggal yang menempel bintang ganda — saat `**teks**` dictrl+I jadinya `***teks***` (bold italic, bintang bold tidak hilang); Ctrl+I lagi pada seleksi di dalam `***teks***` melepas **satu** bintang tiap sisi → kembali `**teks**` (bukan menjadi `****teks****`). `***teks***` dirender marked sebagai `<em><strong>`. Urutan benda yang tampak benar disimulasikan: `**teks**`+I→`***teks***`, itu+I→`**teks**`, `*teks*`+I→`teks`, `**teks**`+B→`teks`, `*teks*`+B→`***teks***`.
- `npm run build` hijau (116→117 modul). Tidak menyentuh `firestore.rules`.

### Penambahan: buat topik dari editor catatan
- **Buat topik langsung saat membuat catatan:** dropdown "Topik" di `/notes/new` sekarang punya tombol **＋** yang membuka `TopicFormModal` (mode subject tingkat atas). Setelah tersimpan, topik baru **otomatis terpilih** sebagai `topicId` catatan. `TopicFormModal` menerima prop baru `onSaved(id)`. Jika ruang belum punya topik sama sekali, muncul hint: "Belum ada topik di ruang ini. Klik ＋…". Sebelumnya dropdown hanya menampilkan topik yang sudah ada (buntu bila ruang kosong → catatan tidak bisa disimpan "Pilih topik…").
- **Diagnostik "tidak bisa tambah topik":** jalur server diverifikasi bekerja (create topik sebagai user asli via emulator berhasil; E2E penuh di browser: daftar→verifikasi→ruang→`/roadmap`→＋ Subject→Simpan→topik muncul, 0 exception). Penyebab sesungguhnya ditemukan dari keterangan pengguna: ia mencoba menambah topik **dari editor catatan** (dropdown kosong karena ruang berisi 0 topik) — diatasi oleh fitur di atas.

### 2026-09-25 — Perbaikan M11 & M12 + persistensi emulator (permintaan: "perbaiki galat dulu sebelum CP5")
- **M11 (toast "Akses ditolak" sesaat di VerifyScreen) — DIPERBAIKI.** Akar: `ensureProfile` melakukan `getDoc(users/{uid})` pasca-daftar sebelum email terverifikasi; rule baca `users` lama hanya mengizinkan `verified()` → deny → toast. Perbaikan di `firestore.rules`: rule *get* `users` kini `if signedIn() && (uid == request.auth.uid || (verified() && resource.data.spaceId is string && isMemberOf(resource.data.spaceId)))` — **profil sendiri bisa dibaca sebelum terverifikasi** (Gate/VerifyScreen aman); masih selamat di sisi partner-butuh-verifikasi. Tes baru: 'profil sendiri bisa dibaca user yang belum terverifikasi (M11)'.
- **M12 (rule baca `resources` non-queryable) — DIPERBAIKI.** Pola sama seperti M10: rule baca `resources` dilonggarkan jadi `allow read: if isMember(spaceId);` (wajib queryable — `resource.data` tak tersedia untuk LIST). Privasi (visibility private `addedBy`) difilter di aplikasi lewat helper baru `src/features/resources/utils/visibility.js` (`resourceVisibleTo`/`visibleActiveResources`), dipakai di `TopicDetailPage` (daftar per topik + dep `user?.uid`) dan `RoadmapPage` (jumlah `🔗` per subtree + footer counts). Tes di-update: 'resource private: rule READ longgar (isMember) — privasi dijaga di filter aplikasi (M12)' (`assertSucceeds` partner-veryfikasi & owner), dan 'create/edit/hapus resource hanya addedBy (owner)' tetap ketat (bob ditolak update/delete/setDoc dengan `addedBy` alice).
- **Persistensi emulator — AKTIF.** `package.json` script `"emulators"` menjadi `firebase emulators:start --import .firebase/emulator-export --export-on-exit` (flag `--export-on-exit` tanpa nilai = dir import; data disimpan tiap shutdown **secara graceful** via Ctrl+C). **Verifikasi round-trip:** probe doc ditulis (REST `Bearer owner`) → ekspor ke `.firebase/emulator-export` (layout hub: `firebase-export-metadata.json` + `firestore_export/`) → emulator di-kill force → `npm run emulators` (import) → **probe terbaca**; probe dihapus & state kosong diekspor ulang. Catatan: `--export-on-exit` baru menulis saat shutdown graceful — jangan `Stop-Process -Force` bila ingin menyimpan perubahan. `.firebase/` menjadi data lokal yang boleh masuk `.gitignore`.
- **`npm run test:rules` = ALL TESTS PASSED (43/43)** (emulator dimatikan dulu — port 8080 bentrok); **`npm run build` hijau** (116 modul; hanya warning chunk-size tidak berubah).

### 2026-09-25 — CP2.3/CP4 Notes TUNTAS: root cause "Topik kosong di editor" (M10) + E2E 27/27 + rules 42/42
- **M10 terpecahkan:** "select Topik di editor kosong" disebabkan **rule baca `notes` di `firestore.rules` memakai `resource.data.visibility`** — di query LIST (`collection('notes')...where('spaceId','==',...)`), SDK/emulator menolak karena variabel `resource` tidak tersedia untuk `list` → `useNotes` selalu kosong → daftar catatan & opsi topik di editor tak pernah termuat. (Gejala "topik kosong" pun sebenarnya efek domino: daftar catatan kosong membuat topik yang punya catatan jadi tak tampil di pilihan.)
- **Solusi (disetujui user, kompromi trade-off):** rule baca `notes` dilonggarkan menjadi `allow read: if isMember(spaceId);` (queryable). Privasi dipertahankan **di aplikasi** lewat helper baru `src/features/notes/utils/visibility.js` (`noteVisibleTo(note, uid)` & `visibleActiveNotes(notes, uid)`), dipakai di `NotesPanel` (daftar aktif), `TopicDetailPage` (tab Notes), `RoadmapPage` (jumlah `📝` per subtree; tambah `useAuthState` → `user?.uid`), dan `NoteEditorPage` (baca catatan partner tak terlihat → `null`). Rule baca `noteStates`/`resourceStates` tetap ketat via `get()`; `topics` tidak berubah.
- **Tes rules diperbarui:** dua baris asersi baca partner (note private & note shared soft-deleted) berubah `assertFails`→`assertSucceeds` dengan komentar trade-off. Satu tes lama `batch create space + taut profil` ternyata **tidak mencerminkan pola app** → diubah ke pola nyata `createSpace()` (dua tulis terpisah; rules `get()` emulator tak melihat doc yang ditulis batch yang sama). `writeBatch` di-import dibuang.
- **E2E headless final (cp23-e2e.mjs): 27/27 langkah OK, 0 exception** — daftar→verify→onboarding→ruang→dashboard→roadmap→import template→editor baru→topik termuat→isi→tersimpan→pratinjau markdown→badge/tag→bookmark/dipahami→edit→rename→soft-delete (Sampah 1)→restore (Sampah 0)→kembali aktif→hapus→**purge → daftar Sampah kosong**. Perbaikan tambahan di harness: clear storage/sesi di awal tiap run, `tersimpan` menunggu 120 dtk (write SDK pertama setelah emulator start ~55 dtk — webchannel dingin, bukan bug app), cari teks case-insensitive (CSS `uppercase`), buka ConfirmModal dulu lalu klik Permanen.
- **`npm run build` hijau**; **`npm run test:rules` = ALL TESTS PASSED (42/42)**.
- **Belajar: emulator Firestore berjalan TANPA `--data-dir`** → data hanya di memori (lihat Seksi 3). Jangan restart emulator bila ingin mempertahankan data; gunakan `--import`/`--export-on-exit` bila perlu persistensi.

### 2026-09-25 — Rebranding: "Learning Berdua" → **Belajar Bersama**
- Perubahan seluruh label UI & judul: `index.html` (title), `SplashScreen`, `Sidebar`/`Topbar`/`Drawer`, `LandingPage`, `AuthScreen`; nama paket `package.json` → `belajar-bersama` (+`package-lock.json` 2×), `AGENTS.md`, `ONBOARDING-AI.md`, `PROGRESS.md`.
- **Tidak diganti:** project id Firebase `demo-learning-berdua` (seluruh data emulator terikat padanya —; ganti = data baru), hasil tes, `docs/checkpoint-2.md` (dokumen historis).
- Minta user hard-refresh sekali setelah ini. Build hijau (7.57s); grep memastikan "Learning Berdua" bersih dari `src` & `dist/index.html`.

### 2026-09-25 — CP2.3/CP4: Notes (editor + daftar + states + Sampah) — KODE SELESAI
- **Service** `src/features/notes/services/noteService.js`: `createNote`, `updateNote`, `softDeleteNote` (`deletedAt`), `restoreNote` (`deletedAt:null`), `purgeNote`, `setNoteState` (upsert `setDoc` id `${noteId}_${uid}` — create/update diizinkan rules).
- **Hook** `useNoteStates` (live `noteStates` subkoleksi); `Markdown.jsx` pratinjau aman (marked + DOMPurify; LaTeX dibiarkan teks) + blok `.md-body` di `index.css`.
- **Halaman** `NoteEditorPage` rute `/notes/new` & `/notes/:noteId`: create/edit (field Judul, Topik, Status, Visibilitas, Kesulitan, Tag koma, body markdown max 100.000), pratinjau, read-only untuk catatan milik partner, `?from=` untuk tautan Kembali.
- **UI** `NoteCard` (chip owner, badge status/visibilitas, tag, pratinjau line-clamp, toggle Buku/Dipahami, aksi hak-owner + aksi Sampah) dan `NotesPanel` (hub daftar di tab Notes halaman Learn: filter topik, toggle Sampah owner-only, sort updatedAt, ConfirmModal hapus/purge).
- **Integrasi:** `LearnPage` tab Notes → `<NotesPanel/>` (tab Resources tetap placeholder CP2.5); `TopicDetailPage` tab Notes → daftar `NoteCard` + tombol "＋ Catatan" + menghapus via `softDeleteNote`; rute `/notes/*` di `router.jsx`.
- Build hijau (`7.78s`). `firestore.rules` **tidak disentuh** → `test:rules` tak diperlukan.

### 2026-09-25 — Verifikasi CP2.3 belum tuntas (E2E) — dicatat di "Yang tersisa"
- Harness headless dibangun ulang (`cp23-e2e.mjs`): helper `window.__S`, `nav()` = Page.navigate + re-inject helper (navigasi penuh menghapus variabel global), `wait()` menolak string `EXC:`, bobot retry dev-verify + createSpace.
- **Dev-verify emulator ternyata flaky** — sekali gagal (run `dbg3`): akun tetap unverified → `createSpace` di-deny → SpaceGate tetap Onboarding. Bukan bug aplikasi (verifikasi + createSpace sukses di run lain untuk akun uji; ruang asli user sehat). Harness kini mengulang "Tandai" + createSpace hingga 3×.
- Saat verifikasi E2E berhenti: bagian hulu LULUS (daftar → verify → onboarding → ruang → dashboard → roadmap → **import template tampil** → `/learn` → "＋ Catatan" → editor siap). Bagian Open: **editor `/notes/new` tidak memuat daftar topik** (select Topik hanya "Pilih topik…") → `createNote` terblokir validasi → tidak ada catatan → seluruh rangkaian catatan gagal.
- **Ketidakcocokan belum dipahami:** di ruang uji `qmQSv1UVRVAfLYnF3iiV` (run awal) import template **benar-benar menulis** 3 topik (Probability/Mathematics/Bayes) dan editor tetap tak memuatnya; pada 2 run berikutnya roadmap *tampak* menampilkan pohon (text "Mathematics"/"Bayes") padahal REST ruang tsb 0 topik. Perlu rekonsiliasi: dari mana pohon roadmap yang tidak ada di DB itu — kemungkinan artefak state/watch SDK di sesi yang sama vs data DB yang diperiksa, atau `importTemplateRoadmap` sukses semu pada sebagian run.

### 2026-09-25 — Ruang user terpulihkan & SpaceGate dapat menyembuhkan ruang yang hilang
- **Insiden:** user melaporkan "Akses ditolak. Data ini bukan untuk Anda, atau Anda belum terverifikasi." lagi — kali ini beberapa layar (Roadmap/Learn/Settings). Akar: saat membersihkan artefak uji **semua** dokumen `spaces` sempat terhapus — termasuk ruang asli milik user (`spaces/xCYfDnn46d9M3gBmDdS2`, milik akun `alfahdphotograph`, uid `YKtyN0…`). `profile.spaceId` masih menunjuk sana, tetapi dokumennya tidak ada → `isMemberOf` pada rules **fail-closed** (get dokumen yang hilang ≠ not-found; tetap *permission-denied*).
- **Pemulihan data:** dokumen space dibuat ulang via Firestore emulator REST (`PATCH` + `Bearer owner`): `name: "Our Space"`, `memberIds: [uid user]`, `createdAt`, `schemaVersion: 1` → terverifikasi GET 200. Subkoleksi `topics`/`notes` di space tersebut = 0 (tidak ada isi yang hilang).
- **Perbaikan kode (pencegahan kelas masalah):** `SpaceGate` kini mendeteksi ruang "tidak bisa dimuat" — baik dokumen benar-benar tidak ada (`data null` tanpa error) **maupun deny `permission-denied`** (tanda utama dokumen hilang/keanggotaan rusak, karena dokumen yang hilang memunculkan deny, bukan not-found) → **fallback ke `OnboardingScreen`** alih-alih banjir toast "Akses ditolak" dari semua halaman. `useSpace` kini mengekspos `errorCode`. Error jaringan/transient lain tidak dialihkan (hanya `permission-denied` yang kena fallback).
- **Verifikasi E2E headless (0 exception, deny 0):** daftar akun baru → bangun ruang → Dashboard → **hitung lalu hapus dokumen space miliknya** via REST → reload `/` → sesi tetap masuk → **OnboardingScreen tampil** (bukan deny), `path=/dashboard`, 0 exception. Akun uji dibersihkan; hanya dua akun asli tersisa. Build sukses (`index-CRnCLGcC.js`). Tidak menyentuh `firestore.rules`.
- **SOP cleanup ke depan:** jangan hapus semua dokumen `spaces`; hanya ruang yang member-nya terdiri atas uid akun uji (lindungi `Nd6ZR…` & `YKtyN0…`).

### 2026-09-25 — Masuk dan Daftar jadi dua route terpisah (/login & /daftar)
- Keluhan pengguna: berpindah ke "Masuk" seharusnya route berbeda pula dengan "Daftar" (sebelumnya `Daftar` hanya param `?mode=signup` di `/login`).
- **Perubahan:** rute publik kini `"/"` (landing), `"/login"` (masuk), dan `"/daftar"` (daftar). `AuthScreen` menentukan mode **dari pathname**, bukan state: `mode = location.pathname === '/daftar' ? 'signup' : 'login'`. Kedua tab di kartu menjadi `<Link>` ke `/login` & `/daftar` (URL ikut berubah saat pindah tab). Tombol "Daftar" di landing → navigate `/daftar`; label tombol Google dan pesan gagal menyesuaikan mode.
- **Verifikasi E2E headless (0 exception):** landing → `Daftar` → **`/daftar`** dengan form daftar (field nama ada, tab Daftar aktif); `/login` murni login (tanpa field nama, ada "Lupa kata sandi?"); daftar → `/dashboard` + VerifyScreen → dev-verify → Onboarding → buat ruang → Dashboard → `/settings` → **Keluar → URL `/` (landing)** → login lagi → langsung Dashboard. Artefak uji dibersihkan. Build sukses (105 modul, `index-BcL-QByl.js`). Tidak menyentuh `firestore.rules`.

### 2026-09-25 — Landing page di root + logout selalu kembali ke root
- Keluhan pengguna: aplikasi langsung menampilkan layar login; dan setelah **Keluar** tetap "menyimpan" path sebelumnya (mis. URL masih `/settings`) — diinginkan kembali ke halaman awal (root).
- **Perubahan routing** (`router.jsx` + `LandingPage` baru): "/" dan "/login" kini **publik** (didefinisikan di atas route `Gate`). `"/"` = **landing page** (eyebrow, judul serif, daftar fitur & "Cara mulai" gaya border-b, tombol Masuk/Daftar). Dashboard pindah dari `/` → **`/dashboard`** (`navConfig.js` + pengecekan `end` NavLink di Sidebar/BottomNav/Drawer).
- **Gate**: user belum masuk → `<Navigate to="/" replace />` — keluar dari mana pun selalu berakhir di root/landing, tidak menyimpan path sebelumnya. `AuthScreen` → `/login` (dari landing: `/login?mode=signup`); sudah ber-sesi → redirect `/dashboard`; submit login/daftar/Google sukses → `/dashboard` (Gate menangani Verify/Onboarding). `SettingsPage.logout` → `navigate('/', { replace: true })`; "Keluar" di VerifyScreen/Onboarding ikut ter-redirect otomatis lewat Gate.
- Landing sekaligus pintu masuk ulang: pengguna ber-sesi yang membuka `/` langsung di-redirect ke `/dashboard`.
- **Verifikasi E2E headless (0 exception):** landing di `/` → `Daftar` → `/login?mode=signup` → daftar → `/dashboard` + VerifyScreen → dev-verify → Onboarding → buat ruang → Dashboard → `/settings` → **Keluar → URL `/` + halaman landing (bukan login, bukan `/settings`)** → login lagi dari landing → langsung Dashboard. Artefak uji dibersihkan; hanya dua akun asli tersisa. `npm run build` → sukses (105 modul, `index-zXqZKIKy.js`). Tidak menyentuh `firestore.rules`.

### 2026-09-25 — M1: restruktur routing single-`<Routes>` (navigasi tak butuh refresh)
- **Akar masalah terkonfirmasi:** dulu `router.jsx` memakai satu `<Route path="*" element={<Gate/>}>` di level atas lalu `AppShell` punya `<Routes>` KEDUA di dalamnya — komponen `<Gate/>` stabil sehingga cabang dalam tidak ikut berganti saat lokasi berubah.
- **Perbaikan (opsi 2 diagnosis):** `router.jsx` kini punya **satu `<Routes>` top-level** dengan pola layout-route: `Gate` → (AuthScreen/VerifyScreen) atau `<Outlet/>`; `SpaceGate` → (OnboardingScreen) atau `<SpaceProvider>` + `<Outlet/>`; `AppShell` → `<Layout>` + `<Outlet/>`; lalu rute penuh (`/`, `/learn`, `/roadmap`, `/roadmap/:topicId`, `/settings`, item `comingSoon`, fallback `*` → redirect `/`).
- **File baru:** `src/features/space/SpaceContext.jsx` (`SpaceProvider` + `useSpaceId`) — `spaceId` mengalir dari `SpaceGate` ke halaman; `AppShell` jadi layout-route (tanpa `<Routes>` sendiri). Halaman Dashboard/Learn/Roadmap/TopicDetail/Settings baca `spaceId` via `useSpaceId()` (prop dihapus).
- **Efek samping positif:** setiap perubahan URL kini memicu match ulang rute secara kanonik v6 (tidak perlu `<Routes key={pathname}>`), state antar-navigasi tetap dipertahankan.
- **Catatan deploy statis tetap berlaku (CP7):** BrowserRouter butuh fallback `index.html` (mis. `404.html` di GitHub Pages) untuk deep-link/refresh.
- `npm run build` → sukses (104 modul). Tidak menyentuh `firestore.rules`.

### 2026-09-25 — Verifikasi E2E headless & perbaikan dev-verify VerifyScreen
- **Uji menyeluruh via CDP (headless Chromium + Auth/Firestore emulator):** daftar akun → dev-verify → buat ruang → Dashboard → navigasi client-side `/`→`/roadmap`→`back`→`/settings` **tanpa reload** (penanda `window.__e2e_marker` tetap) → **Keluar → kembali AuthScreen langsung tanpa reload. Zero exception sepanjang cold-login path.** Kesimpulan: kode navigasi & logout benar; gejala "perlu refresh"/"logout tak ke login" pada browser user = sesi/tab lama (bundle pra-perbaikan) — tutup semua tab & coba Incognito.
- **Bug nyata diperbaiki:** tombol "(Dev/emulator) Tandai email terverifikasi" di `VerifyScreen` memakai `PATCH /emulator/v1/projects/{p}/accounts/{uid}` yang dapat **404** di versi emulator terpasang → akun baru mentok di layar verifikasi. Diganti pola Admin SDK emulator: `POST /identitytoolkit.googleapis.com/v1/accounts:update?key={projectId}` + header `Authorization: Bearer owner`, body `{ localId, emailVerified: true }` (terverifikasi 200 OK). CSP `connect-src http://127.0.0.1:*` sudah menampung.
- **Observasi (non-blokir):** saat rantai sekali jalan daftar→verifikasi→buat ruang, Firestore SDK sempat melempar `INTERNAL ASSERTION FAILED: Unexpected state` (bagian `WatchChangeAggregator`) saat listener remount cepat; **tidak terpicu pada cold-login/data normal**, UI tetap berfungsi setelah reload. Ditandai sebagai catatan SDK, bukan bug aplikasi.
- Artefak uji (akun & space E2E) dibersihkan dari emulator; semua headless Chrome dimatikan. `npm run build` → sukses (104 modul). Tidak menyentuh `firestore.rules`.

### 2026-09-25 — Root cause "Roadmap kosong sampai refresh": cache persisten vs emulator (DIPERBAIKI)
- Keluhan pengguna berlanjut: berpindah ke **Roadmap dengan data topik nyata** → halaman tampil kosong/beku sampai hard refresh. Direproduksi di headless: Dashboard→Roadmap mula-mula render OK (0.84s), lalu SDK Firestore 10.14.1 melempar **`FIRESTORE ... INTERNAL ASSERTION FAILED: Unexpected state`** (stack di `WatchChangeAggregator`/`TargetState.Oe`) → aliran data live mati → Roadmap (dan halaman ber-data lain) tak pernah ter-update lagi sampai reload. Total 19 exception dalam satu sesi uji.
- **Root cause:** `persistentLocalCache` memakai resume-token per target; saat listener koleksi dibongkar-pasang cepat di *emulator*, keadaan target klien tak sinkron dengan perubahan watch yang datang → SDK hard-assert dan membekukan koneksi. Bukan bug aplikasi/Router (URL & routing sudah benar), tapi efek samping SDK+persistence+emulator.
- **Perbaikan:** di `src/lib/firebase.js`, **mode emulator memakai `memoryLocalCache()`** (tanpa resume-token persisten); **produksi tetap `persistentLocalCache` + `persistentMultipleTabManager`** (offline & sync antar-tab utuh). Perubahan tidak menyentuh `firestore.rules`.
- **Verifikasi ulang (E2E headless penuh):** login → Dashboard (0 exception) → klik Roadmap: pohon 3 level render **0.43s, tanpa reload, 0 exception** → detail `/roadmap/:topicId` OK → `history.back()` OK → **3× siklus Learn↔Roadmap** semua OK, penanda anti-reload tetap hidup, **total exception 0**. `npm run build` → sukses (104 modul, `index-Z1Db3iz2.js`).
- **Catatan untuk deployment (CP7):** jika keluhan serupa muncul di lingkungan asli, revisi opsi transport (`experimentalForceLongPolling`) atau batasi churn listener; untuk pengembangan emulator-first masalah ini tuntas.

### 2026-09-25 — Bug "Akses ditolak" saat bangun ruang: batch tak bisa lihat tulisannya sendiri (DIPERBAIKI)
- Keluhan pengguna: klik **"Buat ruang"** → toast `⚠️ Akses ditolak. Data ini bukan untuk Anda, atau Anda belum terverifikasi.` (kode error Firestore `permission-denied`).
- **Reproduksi headless:** daftar akun baru → dev-verify → Onboarding → klik "Buat ruang belajar" → toast deny yang SAMA, **0 exception JS** (jadi ini murni penolakan rules, bukan crash SDK).
- **Root cause:** `createSpace` menulis dalam SATU batch: `set spaces/{id}` + `update users/{uid}.spaceId`. Aturan update mewajibkan `spaceIdChangeOk → isMemberOf(spaceId)` dengan `get(spaces/{id})`; tetapi **di dalam batch, rules (emulator) TIDAK melihat tulisan batch itu sendiri** → `get` space yang baru dibuat nihil → deny → seluruh batch atomik gagal. Tercermin juga di `joinSpaceByCode` (profil di-link di batch yang sama dengan perubahan memberIds space → deny serupa).
- **Perbaikan (kode saja, rules TIDAK diubah):** `createSpace` dipecah jadi dua operasi sekuensial — `setDoc(spaceRef)` dulu, lalu `updateDoc(users/{uid}, {spaceId})` (cleanup `deleteDoc` bila penautan gagal). `joinSpaceByCode`: batch kini hanya `space memberIds + _joinCode` dan `invite used`; penautan `users/{uid}.spaceId` dipindah SETELAH batch. Isi rules tetap ketat (bukti keanggotaan via `isMemberOf` tetap dievaluasi terhadap data ter-persist).
- **Verifikasi E2E headless:** daftar → verifikasi → buat ruang → **toast `✅ Ruang belajar dibuat` → masuk Dashboard, 0 exception**. Emulator dibersihkan (akun/space/invites uji dihapus; dua akun asli `asdf` & `alfahdphotograph` dipertahankan, keduanya spaceId null & siap bangun ruang). `npm run build` → sukses (104 modul, `index-DSwtlnYM.js`). Tidak menyentuh `firestore.rules` → tidak perlu `test:rules`.
- Jika suatu saat ingin kembali atomik dengan mempertahankan batch, opsi: buat space duluan lalu update profil pada lingkup `bundle`/transaction, atau perubahan rules (melemahkan bukti `isMemberOf` di `spaceIdChangeOk`) — tidak dipilih agar model keamanan tetap utuh.

### 2026-09-25 — Perbaikan bug kecil M3–M9 (Roadmap/Topik)
- **M3**: `TopicFormModal` tidak lagi ter-reset saat snapshot Firestore membuat ulang objek `initial` — reset hanya saat `open` berubah dan kunci sesi (`initial?.id` / `parent?.id` / `new`) berbeda (`openedKey` ref).
- **M4**: `MoveTopicModal` reset `selected` setiap modal dibuka → tidak ada sisa pilihan sesi sebelumnya.
- **M5**: saran "Belum ada subtopik" disembunyikan untuk topik level 2 (daun).
- **M6**: daftar notes baca kolom `body` (bukan `content`) sesuai `validNote` rules → snippet tidak kosong lagi.
- **M7**: chip pemilik resource baca `addedBy` (bukan `authorId`) sesuai `validResource` rules.
- **M8**: copy empty-state Roadmap memakai `&quot;＋ Template&quot;` (bukan dua kutip tegak literal).
- **M9**: calon induk di `MoveTopicModal` kini mengecualikan induk sekarang (tombol pindah hanya untuk induk berbeda + guard `doMove` pertahankan order bila target == induk sekarang) → `order` tak duplikat.
- `npm run build` → sukses (103 modul). Tidak menyentuh `firestore.rules` → tidak perlu `test:rules`.

### 2026-09-25 — Perbaikan routing: HashRouter → BrowserRouter
- Keluhan pengguna: URL navigasi memakai `#/...` (mis. `http://localhost:5173/roadmap#/learn` — path `/roadmap` menggantung, hash `#/learn` ditambahkan). `src/app/router.jsx` diganti `HashRouter` → `BrowserRouter` agar URL bersih (`/learn`, `/roadmap/:id`).
- Semua tautan memakai `Link/NavLink to="/..."` sehingga tidak ada perubahan komponen lain. Vite dev punya SPA fallback (deep-link + refresh jalan).
- **Catatan deploy statis (CP7):** BrowserRouter butuh fallback index.html untuk path dalam URL, mis. `404.html` = salinan `index.html` di GitHub Pages (base `./` + `<base href>` saat perlu path repo).

### 2026-09-25 — Checkpoint 3: Roadmap / Topik
- Service `topicService` (CRUD topik, `setTopicOrders` batch untuk urutan/pindah, `deleteTopics` cascade, `importTemplateRoadmap` seed Mathematics→Probability→Bayes).
- Hook live `useTopics` + `useNotes` + `useResources` (pola `onSnapshot`, sortir client — tanpa ketergantungan indeks komposit).
- Util pohon `tree.js`: `indexTopics`, `treeRoots`, `descendantIds`, `topicPath`, `subtreeTotals`.
- `RoadmapPage` ditulis ulang: pohon 3 level (Subject→Topic→Subtopic) expand/collapse + garis vertikal `border-l`, badge status, jumlah `📝/🔗` per subtree, tombol ＋/⇄/↑↓/✎/🗑 per node, "Buka/Tutup semua", empty state + import template.
- `TopicDetailPage` baru: breadcrumb `Roadmap / …`, header (ikon/warna/status/difficulty), batang "Kemajuan subtopik" (dari subtopik `completed`), tab Notes | Resources | Questions/Quiz (placeholder); daftar notes/resource membaca koleksi asli (visibility difilter server).
- Modal baru: `TopicFormModal` (judul wajib, emoji ikon, swatch warna, status, difficulty), `MoveTopicModal` (radio induk valid, level dipertahankan), `ConfirmModal` (destruktif generik, busy + error inline, pesan dampak hapus).
- Shared baru: `Select` (gaya `Input`), `utils/status.js` (`statusTone`/`statusLabel`), konstanta `LEVEL_LABEL`; rute `/roadmap/:topicId` di `AppShell`.
- `npm run build` → sukses (103 modul). Tidak menyentuh `firestore.rules` → tidak perlu `test:rules`.
- Laporan lengkap: `docs/checkpoint-3.md`.

### 2026-09-25 — Checkpoint 2: Layout, navigasi, tema
- Layout jadi menyeluruh: `navConfig.js` (13 menu + bottom-nav 7 ikon), `Topbar` (solid sticky: status sinkron, tema, avatar), `Sidebar` 216px (aktif = border-left 2px accent + tebal), `BottomNav` mobile 7 ikon (+safe-area), `Drawer` full-menu mobile (Escape/backdrop menutup), `Layout` pembungkus, `ComingSoonPage` untuk seluruh item placeholder.
- `AppShell` ditulis ulang jadi kontainer rute konten (Dashboard, Learn, Roadmap, Settings, + 9 placeholder "Segera hadir"); `router.jsx` tidak berubah (Gate tetap berlaku).
- Halaman baru: `DashboardPage` (hero sapaan + batang progres + 3 seksi Personal/Partner/Together dengan empty state — diisi CP7), `LearnPage` (tab Notes/Resources via `?tab=`), `RoadmapPage` (shell), `SettingsPage` fungsional (profil: nama/emoji/warna, ruang: rename + anggota + InviteCard, tampilan: tema, keamanan: reset password + keluar + catatan tanpa MFA, data: placeholder ekspor/hapus untuk CP7).
- Palet identitas `IDENTITY.colors` di-update dari neon ke kalem (terracotta/olive/mustard/dll), selaras tema.
- `npm run build` → sukses (91 modul). Tidak menyentuh `firestore.rules` → tidak perlu `test:rules`.
- Laporan lengkap: `docs/checkpoint-2.md`.

### 2026-09-24 — Sesi desain & dokumentasi
- Tema **"buku catatan/jurnal akademik"** diterapkan: palet terracotta/olive/mustard (light+dark), radius 6/8px, tipografi serif (heading/angka) + sans (body) + mono (label), aturan "dua tingkat kotak" (elemen besar di-flatten hanya border-bottom).
- Semua komponen dasar di-resskin: Button (primary **invers solid**, tanpa gradient/glow), Input (label eyebrow mono, min-height 44), Badge (pill mono), Avatar (serif/tinted), Toast, Modal, EmptyState.
- Layar di-resskin: AuthScreen, VerifyScreen, OnboardingScreen, AppShell (hero serif + batang progres, daftar anggota jurnal, topbar solid), SplashScreen.
- Dihapus: `Ambient.jsx` + seluruh sisa token neon (`cyan/green/amber/violet`, `.hero-card`, ring progres, gradient).
- Dokumentasi AI dibuat: `ONBOARDING-AI.md`, `PROGRESS.md`, `ROADMAP-AI.md`.
- `npm run build` → sukses.
- **Peristiwa (akibat cek database):** `DELETE /emulator/v1/.../accounts` di Auth Emulator terpicu → seluruh akun Auth emulator terhapus. Sebelumnya Firestore berisi 1 profil (`users/PAKO...`, `spaceId: null`) & 0 space — makanya di layar "bangun ruang". Akibat: sesi login basi; perlu masuk/daftar ulang setelah ini.

### 2026-09-23/24 — Sesi "index-5.html" & stabilitas (ringkas)
- Coba tiru desain tracker `index-5.html` (palet identik; ambient blob, hero card ring, avatar gradien) — **& → digantikan** oleh tema buku catatan di atas (desain terakhir yang berlaku).
- Perbaikan alur create-space:
  - `firestore.rules`: `get(path).exists` rusak → fungsi `exists()`; helper `noteVisibleTo`/`resourceVisibleTo` **wajib menerima `spaceId`** (variabel wildcard induk = null di function top-level); users update dipagari `resource.data is map`.
  - `spaceService`: `ensureProfile(uid)` sebelum batch create/join (update doc yang belum ada hanya berisi field yang ditulis → `validUser` gagal).
  - `router.jsx` Gate: dep `useEffect` → `[user?.uid, toast]` agar profil diensure ulang setelah refresh token.
  - `VerifyScreen`: `confirmVerified` = `reload()` → `getIdToken(true)` (rules baca klaim token, bukan field).
  - Test runner ASCII `[OK]/[FAIL]` + `ALL TESTS PASSED` (PowerShell rusak non-ASCII); fsDb di-memoize (WeakMap).
  - Tombol **Keluar** di layar OnboardingScreen.

### Sebelumnya (Checkpoint 1, tersimpan di `docs/checkpoint-1.md`)
- Fondasi project, emulator config, `.firebaserc`, Java Path, rules lengkap (users/spaces/topics/notes/noteStates/resources/resourceStates/invites) + 34 tes.
- 32/32 tes lulus pada run terakhir yang diverifikasi.

## 3. Keadaan database emulator saat ini

- **Persistensi AKTIF sejak 2026-09-25:** emulator kini dijalankan via `npm run emulators` dengan `--import .firebase/emulator-export --export-on-exit`. Data Firestore (dan Auth) **disimpan otomatis saat shutdown graceful** (Ctrl+C / tutup terminal) ke `.firebase/emulator-export` dan **dimuat kembali** saat emulator dinyalakan. `Stop-Process`/kill paksa = data tidak diekspor (hanya hilang jika emulator belum pernah diekspor sebelumnya).
- **Database saat ini KOSONG**: restart hari ini (sebelum persistensi aktif) menghapus seluruh Firestore — termasuk dua akun lama (`asdf`/`alfahdphotograph`, ruang `xCYfDnn…`). Dengan persistensi aktif, data baru (akun, ruang, catatan) akan bertahan antar-restart.
- Konsekuensi UX bila akun Auth tetap ada tapi profil/space-nya kosong: login berhasil, `ensureProfile` membuat ulang profil (spaceId null) → diarahkan ke Onboarding → user membangun ruang baru.

## 4. Yang tersisa / terblokir

1. ~~**E2E CP2.3/CP4**~~ — **selesai & terotomasi**: 27/27 (2026-09-25) lalu **37/37** termasuk privasi dua akun & dialog "Cari di ruang" (2026-09-26). Uji manual di browser tetap opsional sebagai kewarasan (create/edit/pratinjau/delete/restore/purge). Emulator sudah persisten: curahkan perubahan dengan **menghentikan emulator secara graceful** (Ctrl+C di terminal `npm run emulators`).
2. ~~**Uji manual CP2.4/CP5 + CP6 dua akun**~~ — **selesai & terotomasi**: resource, visibility, dialog cari, filter tag, dan path topik semuanya tercakup E2E 37/37 plus unit `test:units` 23/23.
3. ~~**Gap presisi hasil audit 2026-09-26**~~ (10 item, `ROADMAP-AI.md` §2.1) — **selesai 2026-09-26**; CP2.5 & CP2.6 kini terverifikasi penuh, tidak perlu masuk CP7.
4. **CP7**: Dashboard minimal + export/hapus data, lalu deploy & audit. Ini satu-satunya sisa utama sebelum deploy.
5. Polish opsional: regression UI Notes/Resources setelah perubahan visibilitas.

## 5. Masalah tercatat (KNOWN ISSUES — belum diperbaiki, direkam dari laporan pengguna 2026-09-25)

### M10 — Select Topik editor `/notes/new` kosong / import template inkonsisten (**DIPERBAIKI 2026-09-25**)
- **Root cause:** rule baca `notes` memakai `resource.data.visibility` → **list query ditolak emulator** (`resource` tak tersedia untuk `list`) → `useNotes` selalu kosong → daftar & opsi topik di editor kosong. Gejala "topik kosong" adalah efek domino dari daftar catatan kosong.
- **Perbaikan:** rule baca `notes` dilonggarkan jadi `allow read: if isMember(spaceId)`; privasi (visibility private + soft-deleted) dipindah ke filter aplikasi `notes/utils/visibility.js`. Detail & file yang disentuh: riwayat di atas.

### M12 — Rule baca `resources` non-queryable (**DIPERBAIKI 2026-09-25**)
- `firestore.rules` `resources` memakai pola yang sama seperti M10 (filter `resource.data.visibility` di read) → query LIST `useResources` akan ditolak emulator. **Perbaikan:** read dilonggarkan ke `if isMember(spaceId)`; privasi (visible = `shared` dan tidak `deletedAt`, atau `addedBy` = uid) difilter di aplikasi via `resources/utils/visibility.js` (`visibleActiveResources`), dipakai di `TopicDetailPage` & `RoadmapPage`. Detail & file yang disentuh: riwayat di atas.

### M11 — Toast "Akses ditolak" muncul sesaat di VerifyScreen (**DIPERBAIKI 2026-09-25**)
- **Gejala:** setelah daftar, layar verifikasi kadang menampilkan "⚠️ Akses ditolak. Data ini bukan untuk Anda, atau Anda belum terverifikasi." (muncul dari `ensureProfile` getDoc yang di-deny rule `users` sebelum `emailVerified`; kosmetik, tidak menghentikan alur).
- **Perbaikan:** rule *get* `users` kini memperbolehkan `signedIn() && uid == request.auth.uid` (baca profil sendiri tanpa syarat terverifikasi); baca profil partner tetap wajib `verified()`. Tes 'profil sendiri bisa dibaca user yang belum terverifikasi (M11)' ditambahkan.

### M1 — Navigasi: URL berubah benar, tapi konten tidak muncul sampai refresh manual (**DIPERBAIKI 2026-09-25**)
- **Perbaikan:** tunggal `<Routes>` top-level dengan pola layout-route (`Gate`/`SpaceGate`/`AppShell` memakai `<Outlet/>`), rute penuh dinyatakan eksplisit, `spaceId` via `SpaceContext`. Lihat entry riwayat di atas.
- **Belum diverifikasi secara manual di browser** — uji: pindah `/` → `/roadmap` → `/learn` → `/settings`, ganti tab `?tab=...`, lalu deep-link refresh `/learn` & `/roadmap/:id`.

### M2 — "Belum bisa menambahkan resources" (**DIPERBAIKI 2026-09-25**)
- **Gejala awal:** di tab Resources (halaman detail topik & halaman Learn) tidak ada tombol tambah; daftar selalu kosong/placeholder.
- **Perbaikan:** CP2.4/CP5 menambahkan `ResourceFormModal`, alur create/edit, filter topik/subtree, status baca, checkbox **"Sudah lihat"**, visibility, tag, difficulty, estimasi waktu, dan hapus. Detail di entry riwayat CP2.4/CP5 di atas.

### Hasil audit kode menyeluruh 2026-09-25 (semua sudah diperbaiki pada 2026-09-25, sesi berikutnya)

- **M3 — Form edit topik ter-reset saat snapshot datang (sudah).** Diperbaiki 2026-09-25: reset form hanya saat `open` berubah via kunci `openedKey` (`initial?.id` / `parent?.id` / `new`), bukan saat `initial` dibuat ulang oleh snapshot. Lihat `TopicFormModal.jsx`.
- **M4 — `MoveTopicModal` memakai sisa pilihan dari sesi lain (sudah).** Diperbaiki: `useEffect` reset `selected` saat `open` jadi `true`.
- **M5 — Copy menyesatkan untuk subtopik daun (sudah).** Baris saran "Belum ada subtopik" disembunyikan bila `topic.level === 2`.
- **M6 (latent, kena saat CP4) — Mismatch kolom notes (sudah).** Daftar notes baca `body` (fallback `content` untuk data lama).
- **M7 (latent, saat CP5) — Mismatch kolom resources (sudah).** Chip pemilik resource baca `addedBy`.
- **M8 — Copy tipografi di empty state (sudah).** Pakai `&quot;＋ Template&quot;`.
- **M9 — `doMove` bisa menghasilkan `order` duplikat (sudah).** Calon induk di modal mengecualikan induk sekarang + guard `doMove` bila target == induk sekarang.
