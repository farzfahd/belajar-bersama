# ROADMAP-AI — Tahapan yang Harus Diikuti AI Berikutnya

Dokumen ini berisi **aturan kerja** untuk AI yang melanjutkan pengembangan `learning-app`, lalu **urutan tahapan** Checkpoint 2 dan seterusnya. Baca `docs/ONBOARDING-AI.md` (struktur) dan `docs/PROGRESS.md` (status) dulu.

---

## 0. Aturan kerja (wajib, setiap sesi)

1. **Jangan commit/push** kecuali diminta eksplisit.
2. **Jangan membuat dokumentasi baru** (*.md) kecuali diminta.
3. Komentar kode **Bahasa Indonesia**, singkat. Jangan menambah komentar tanpa alasan.
4. Setelah setiap perubahan kode: `npm run build`. Setelah menyentuh `firestore.rules`: `npm run test:rules`.
5. **`npm run test:rules` HANYA jalan saat emulator Firestore :8080 dimatikan** (port bentrok). Stop emulator dulu, atau beri tahu pengguna.
6. **Jangan mengubah struktur rules** (`match /spaces/{spaceId}` sibling vs nested) tanpa memindahkan helper — helper harus menerima `spaceId` sebagai parameter.
7. **Jangan pakai** di rules: lambda `=>`, `List.all()`, `not in`, `duration(...)` → pakai pola di ONBOARDING-AI §7.
8. Götz **jangan menambah utility opacity Tailwind pada var warna hex** (`bg-ink/10`). Gunakan `bg-[color-mix(in_srgb,var(--x)_NN%,transparent)]`.
9. Ikuti **design system "buku catatan"** (ONBOARDING-AI §6): elemen besar di-flatten (border-bottom saja), kecil tetap boxed radius 6, tanpa gradien/glow, heading serif + label mono.
10. Saat mengubah tema/warna di `index.css`, pastikan **light & dark** keduanya konsisten (token pusat, Tailwind hanya memetakan var).
11. **Tanpa koneksi internet** di lingkungan dev: jangan bergantung pada CDN; font fallback sistem sudah ada. API eksternal selain emulator `localhost` tidak tersedia.

## 1. Sebelum mulai (wajib dipahami)

- Baca `docs/ONBOARDING-AI.md` §3 (alur Gate) dan §7 (rules).
- Konfirmasi ke pengguna: emulator jalan? data mau diapain? (baru di-reset?).

## 2. Checkpoint 2 — Fitur Konten (prioritas berikutnya)

Urutan tahapan **paling kecil dulu → teruji → lanjut**. Setiap tahap: implementasi + `npm run build` + (jika menyentuh rules) `npm run test:rules` + uji manual browser.

> **Keputusan 2026-09-25 (dikonfirmasi pengguna):**
> - **Penomoran.** Dua skema ber coexist di dokumen lama: `CP2.x` (isi checkpoint konten, dipakai di §2) dan `CP3`/`CP4-5` (pekerjaan lanjutan, §3). Label lama "CP4/CP5/CP6" pada `docs/PROGRESS.md` sebenarnya merujuk CP2.3/CP2.4/CP2.7 — **bukan** CP4/CP5/CP6 di §3. Baku yang dipakai: **CP2.x = konten (selesai), CP7+ = pekerjaan lanjutan (§3)**. `CP6` di bawah diubah menjadi **CP2.7** agar tidak bentrok.
> - Layout & navigasi (CP2.1) **SELESAI** — lihat `docs/checkpoint-2.md`.
> - Roadmap/Topik (CP2.2) **SELESAI** — lihat `docs/checkpoint-3.md`.
> - Notes (CP2.3) **SELESAI** — editor, visibility, states, Sampah; E2E privasi 29/29 + test:rules 56/56.
> - Resources & reading list (CP2.4) **SELESAI** — link-only resource, status per-user, filter topik/path, dan checkbox "Sudah lihat".
> - Tags & pencarian global (CP2.7) **SELESAI** — dialog Fuse.js dari Topbar dengan tag, path topik, catatan, dan resource. **Privacy-nya terverifikasi di kode tetapi belum punya tes otomatis** (lihat §2.1 gap 1).
> - Tampilan Roadmap = **pohon 3 level (Subject→Topic→Subtopic)**, expand/collapse + alur vertikal + halaman detail ber-tab Notes/Resources. **BUKAN** "timeline minggu + checklist per hari" (model tracker lama) — abaikan deskripsi model minggu di bawah.
> - **Heatmap & chart/badge (CP2.5–2.6) AKTIF** — Progress/Achievements sudah diimplementasikan dari snapshot data nyata; line/bar chart memakai SVG lokal agar tetap offline.

### CP2.1 Navigasi lengkap (kerangka)
- [x] Sidebar **216px** desktop (nav flat, aktif = `border-left: 2px accent` + bold, bukan kotak highlight), konten `max-width:1100px`.
- [x] Mobile `<860px`: **bottom-nav fixed** 7 ikon, aktif warna accent, semua target **min-height 44px**.
- [x] Item nav yang belum ada halamannya → menuju placeholder "Segera hadir" (jangan disembunyikan; jangan dibuatkan halaman kosong palsu).
- [x] Topbar **solid** (border-bottom tipis, tanpa blur) sesuai spesifikasi.

### CP2.2 Model data & Topics (roadmap topik)
- [x] Subkoleksi `spaces/{spaceId}/topics` dipakai: CRUD topik level 0–2 (parent/child), `order`, `status` (not_started/learning/completed), `difficulty`, `icon`, `color`. Rules sudah siap — verifikasi lewat tes.
- [x] Tidak ada aturan rules baru yang perlu ditambahkan pada CP2.2; regression tetap tercakup di `tests/firestore.rules.test.js`.
- [x] UI Roadmap (keputusan 2026-09-25): **pohon 3 level expand/collapse + alur vertikal**; tiap node tampilkan jumlah notes/resources + badge status.
- [x] CRUD: tambah, ubah (modal), hapus (konfirmasi dampak bila punya anak/materi), pindah parent, urutkan (`order`).
- [x] Halaman detail topik: breadcrumb, header, tab **Notes | Resources | (Questions, Quiz = placeholder)**; progress dari subtopic `completed`.
- [x] Tombol "Import template roadmap" (1 seed: Mathematics → Probability → Bayes).

### CP2.3 Notes
- [x] UI daftar + editor notes (draf→shared→reviewed…), visibility private/shared, tag, bookmark/understood via `noteStates` (rules sudah siap).
- [x] Soft-delete `deletedAt` dipakai di UI (trash owner-only).

### CP2.4 Resources & reading list
- [x] Koleksi `resources` (link saja, tanpa upload): jenis, URL divalidasi client + rules, status per-user via `resourceStates`.
- [x] UI reading-list (flattened, border-bottom) + checkbox "Sudah lihat".
- [x] Filter topik/subtree, create/edit, private/shared, tag, author, difficulty, estimasi waktu, dan hapus.

### CP2.7 Tags & pencarian global (Fuse.js)
- [x] Tombol pencarian di Topbar membuka dialog **Cari di ruang**.
- [x] Fuse.js mengindeks topik, catatan, resource, isi/deskripsi, author/URL, tag, dan breadcrumb topik.
- [x] Tag chips + jumlah, filter tag, batas hasil, dan navigasi ke topik/catatan serta URL resource.
- [x] Resource/catatan private milik partner dan dokumen `deletedAt` difilter sebelum index/tag count.

### CP2.5 Heatmap & riwayat — SELESAI
- [x] **Heatmap kontribusi** dua varian: dashboard (kolom/minggu, warna per fase) & "Riwayat" (grid 7×24, 3 tingkat opacity accent).
- [x] Halaman Riwayat berformat **jurnal**: baris per hari (pakai font mono utk tanggal kiri, heading body utk topik, status kanan berwarna ok/warn), pemisah minggu = nomor serif besar + rentang tanggal mono kanan (bukan kotak). Baris highlight: garis inset kiri accent.
- [x] Baris log didukung data nyata (dari topics/notes/resources/states), bukan mock.

### CP2.6 Chart & badge — SELESAI
- [x] Chart SVG lokal: line chart skor materi & bar chart fase; **warna grid/tick ditarik dari CSS var** (ikut tema). `chart-wrap` tanpa kotak.
- [x] Badge/achievement: satu-satunya kartu **boxed penuh** di layar konten (bg+border, radius 12); locked = ikon grayscale `opacity .35`, unlocked = border accent tanpa glow. **Pengecualian yang disengaja:** overlay `Modal` & `Toast` juga bg+border+shadow karena harus mengambang (lihat ONBOARDING-AI §6).
- [x] Sel heatmap/riwayat memakai radius kecil token (`rounded-smc`, 6px).

### Kriteria selesai CP2
- [x] Semua alur konten bisa dibuat/dibaca/diubah/dihapus oleh anggota yang berhak sesuai visibility dan ownership.
- [x] `npm run test:rules` hijau (56/56); `npm run build` hijau.
- [x] Uji dua akun (A & B) saling melihat sesuai aturan (shared/private) — **otomatis** lewat `npm run test:privacy:e2e` (**29/29**, 2026-09-26). Rinciannya: A daftar+verifikasi+buat ruang, B gabung via kode undangan, A buat note & resource privat+shared, B ditolak (403) untuk get privat, list polos, state partner, dan penimpaan; query ganda B hanya mengembalikan shared; `/notes/:id` privat B → "tidak ditemukan"; soft-delete → Sampah → restore. Uji manual di browser tetap opsional.

### 2.1 Hasil audit 2026-09-26 (bacalah sebelum mengklaim "SELESAI")

Audit membandingkan tiap klaim di atas dengan kode nyata. Temuan:
- **TERVERIFIKASI:** CP2.1 (sidebar `w-[216px]`, `min-[860px]`, 7 ikon, topbar solid tanpa blur), CP2.2 (subkoleksi topics, pohon 3 level, CRUD + pindah/urut, detail ber-tab, template Mathematics→Probability→Bayes), CP2.3, CP2.4, CP2.7/CP6 (termasuk filter private/deleted sebelum index & tag count).
- **TERVERIFIKASI dengan gap (lalu):** CP2.5, CP2.6 — 10 gap di bawah sudah ditutup 2026-09-26, keduanya kini terverifikasi penuh.
- **Yang tidak tertangkap klaim `[x]` dan sudah diperbaiki 2026-09-26:** `createSpace()` mustahil bagi user baru (prabaca ruang yang belum ada → deny), `joinSpaceByCode()` mustahil bagi partner (prabaca ruang sebelum jadi anggota → deny), `noteVisibility`/`resourceVisibility` terkunci immutable saat owner mengubah visibilitas.
- **10 gap presisi — sudah dikerjakan 2026-09-26:**
  1. ~~**Privacy CP2.7 tanpa tes otomatis**~~ → `tests/visibility.test.mjs` (unit: privat partner, soft-delete, tag count, tanpa uid, topic path, `description`) + `tests/privacy-e2e.mjs` membuka dialog "Cari di ruang": judul privat → 0 hasil, shared → muncul, path topik tampil, chip/filter tag privat partner tidak ada; owner tetap bisa cari materi & tag sendiri. **37/37.**
  2. ~~Jumlah/aksi tersembunyi di mobile~~ → jumlah note/resource tetap tampil; aksi tambah/pindah/naik/turun/edit/hapus tidak lagi di balik breakpoint, hanya membungkus ke baris kedua.
  3. ~~"Kemajuan subtopic" hanya anak langsung~~ → `progressStats()` menghitung seluruh keturunan; dipakai di halaman Subject & subtopic.
  4. ~~`order` Roadmap ditukar dua nilai~~ → `renumberSiblings()`/`reorderSiblings()` menomori `0..n-1`; `validParent` di rules mewajibkan `parent.level == level-1` → siklus/menunjuklevel salah mustahil.
  5. ~~Rules hanya validasi tipe `parentId`~~ → `validParent(spaceId, d, topicId)` (existsAfter/getAfter, aman untuk batch template); tes: induk hilang, level salah, self-parent, update, batch.
  6. ~~Badge bukan satu-satunya kotak penuh~~ → didokumentasikan: achievement satu-satunya kotak penuh di **konten**; `Modal`/`Toast` pengecualian overlay yang disengaja (ONBOARDING-AI §6).
  7. ~~Sel heatmap/riwayat `rounded-[2px]`~~ → `rounded-smc` (6px) di `ActivityHeatmap.jsx` & `HistoryGrid.jsx` + dicatat di ONBOARDING-AI §6.
  8. ~~Label "＋ Template" & hanya saat roadmap kosong~~ → label `＋ Import template roadmap`; roadmap non-kosong meminta konfirmasi lalu diimpor setelah materi lama (`rootOrder` = max order topic root + 1).
  9. ~~`description` note tidak diindeks~~ → `buildSearchRecords` memetakan `note.description` (resource sudah); import search juga diubah ke ekstensi `.js` agar bisa diuji di Node.
  10. ~~Regex URL rules lebih longgar dari `isHttpUrl`~~ → `(?i)^https?://[A-Za-z0-9._~%][^\s]*$`: menolak `https://`, `https://:80`, `https:///path`, whitespace; menerima IP/port, uppercase, path/query, punycode.
- **Catatan emulator vs produksi:** emulator menyaring LIST berdasarkan *rule*, bukan *query constraint* — query `visibility == 'shared'` milik owner ikut mengembalikan dokumen privatnya sendiri. Jangan mengira ini bug; di produksi query tetap menyaring.

## 3. Checkpoint lanjutan (referensi singkat)

> **Peringatan penamaan (2026-09-26).** Tiga hal yang sering disalah baca dari label lama:
> - `docs/checkpoint-1.md` "Checkpoint 1" = Fondasi/Auth/Space → **CP1** (selesai).
> - `docs/checkpoint-2.md` "Checkpoint 2" = Layout/Navigasi/Tema → kini **CP2.1** (selesai).
> - `docs/checkpoint-3.md` "Checkpoint 3" = Roadmap/Topik → kini **CP2.2** (selesai). **Jangan** menyebutnya "CP3".
> - `PROGRESS.md` baris "Dashboard minimal + export/hapus data | CP7" = **item ke-7 dari daftar checkpoint asli**, bukan "checkpoint ke-7 berikutnya".
> - Cp_abbreviation di bawah (`CP3`, `CP4-5`) = **pekerjaan baru yang belum ada di spec asli**. Nomor reuse, bukan urutan waktu.
>
> Baku penamaan going forward: konten lama = **CP2.x**; pekerjaan baru = **CP-SOAL/CP-QUIZ/CP-TASK/CP-PROGRESS** (lihat daftar di bawah). Kalau ragu, sebutkan nama fiturnya, bukan nomornya.

- **CP3 (baru) — Quiz/Task/Progress**: bank soal & latihan pilihan ganda per topik, daftar tugas/penugasan, status+skor per pengguna, dan sinkronisasi antar partner. **Dipilih pengguna 2026-09-26 sebagai tahap berikutnya.** Rencana bertahap & keputusan skema ada di §3.1.
- **CP4-5 (baru)**: proyek, achievements lanjutan, notifikasi, diskusi.
- **Deploy**: GitHub Pages (base `./`, BrowserRouter dengan fallback `404.html`/rewrite untuk deep-link), App Check, `npm audit`. Konfigurasi Firebase Console tetap manual.
- **Item spec asli CP7**: Dashboard minimal + export/hapus data sudah diimplementasikan; batasan penghapusan dijelaskan di `SECURITY.md`.

### 3.1 Rencana bertahap CP3 (baru)

> Aturan main: **paling kecil dulu → teruji → lanjut.** Tiap tahap: implementasi + `npm run build` + `npm run test:rules` (kalau menyentuh rules) + tes yang relevan.
> Cakupan disetujui pengguna 2026-09-26: **Questions (bank soal), Quiz (soal+skor), Tasks (penugasan), Today (rencana harian)**, progress per-topik per-user, dan sinkron antar partner **live saja** (tanpa fitur "commit" terpisah).

#### T1 — Skema data + rules + tes ✅ (2026-09-26)

Lima koleksi baru di bawah `spaces/{spaceId}`. Konvensi id per-user mengikuti `noteStates`: `< indukId>_<uid>`.

| Koleksi | Id dokumen | Field inti | Aturan kunci |
|---|---|---|---|
| `questions` | auto | `prompt`, `options` (**tepat 4**), `answerIndex` (0–3), `topicId`, `difficulty`, `visibility`, `tags`, `explanation`, `commentCount`, `deletedAt`, `createdBy` | Privasi `shared`/active atau milik sendiri (dual-listener, identik notes). `answerIndex` harus masuk 0–3; opsi kosong ditolak. |
| `quizAttempts` | auto | `uid`, `topicId`, `questionIds`, `total`, `correct`, `score` (0–100), `startedAt`, `finishedAt` | Tulis **sekali** untuk diri sendiri; `update`/`delete` = `false` (skor historis). Terbaca kedua anggota → skor partner langsung terlihat. |
| `topicProgress` | `<topicId>_<uid>` | `topicId`, `uid`, `status` (`not_started`/`learning`/`completed`), `score`, `attempts`, `lastStudiedAt` | Topik wajib ada. `score > 0` ⇒ `attempts > 0`. `uid`/`topicId` immutable. Kedua anggota boleh baca (sinkron). |
| `tasks` | auto | `title`, `detail`, `topicId` (boleh `''` = umum), `assigneeId` (string/null), `status` (`todo`/`doing`/`done`), `priority`, `dueAt`, `doneAt`, `createdBy` | `status == 'done'` ⇔ `doneAt` terisi. Creator bebas ubah; **assignee hanya boleh `status`/`doneAt`/`updatedAt`**. Hapus hanya creator. |
| `dailyPlans` | `<uid>_<YYYY-MM-DD>` | `uid`, `date`, `items` (**map** refId → `{kind, done, title}`), `note` | **Privat per user**: partner tidak bisa baca. `uid`/`date` immutable. |

Kendala bahasa rules yang membentuk skema (bukan pilihan gaya):
- Bahasa rules tidak punya loop/`List.all()` ⇒ `options` dikunci **tepat 4** agar indeks 0–3 bisa divalidasi satu per satu.
- `changed().affectedKeys().hasOnly([...])` **tidak didukung** emulator proyek ini ⇒ daftar field terlarang untuk assignee ditulis sebagai allow-list terbalik (`!changed().hasAny([...])`). **Konsekuensi: field baru di `validTask()` otomatis boleh diubah assignee — wajib masukkan ke daftar itu.**
- `items` memakai **map** (bukan list) supaya menandai satu item tidak menulis ulang dokumen; isi tiap entri tidak divalidasi rules (data milik sendiri, diverifikasi UI).
- Query `questions` WAJIB dual-filter (`visibility == 'shared'` + `deletedAt == null`), persis seperti `notes` — query polos ditolak.

**Bukti:** `npm run test:rules` **76/76** (59 lama + 17 tes CP3).

#### T2 — Bank soal (Questions) — BELUM
Service + hook (dual-listener) + form 4 opsi + halaman `/questions` (ganti placeholder) + filter per topik + soft-delete.

#### T3 — Quiz + skor — BELUM
Halaman `/quiz`: pilih soal per topik → kerjakan → skor → tulis `quizAttempts` + `topicProgress` (skor/attempts). Skor partner tampil di halaman yang sama.

#### T4 — Tasks + penugasan — BELUM
Halaman `/tasks`: buat tugas, tugaskan ke diri/pair, ubah status; assignee yang menandai selesai.

#### T5 — Today (rencana harian) — BELUM
Halaman `/today`: rencana per tanggal dari `dailyPlans`; toggle item=topik/task; privat.

#### T6 — Progress memakai skor — BELUM
`snapshot`/chart/badge ikut memakai `topicProgress` + `quizAttempts` (skor nyata, bukan placeholder).

## 4. Checklist umum penutup sesi AI

- [ ] `npm run build` hijau (tanpa error baru).
- [ ] Bila rules berubah: `npm run test:rules` hijau + catat update di `docs/PROGRESS.md`.
- [ ] Perbarui `docs/PROGRESS.md` (status & tanggal) setiap selesai tahap.
- [ ] Kabari pengguna apa yang berubah, bukti build/test, dan langkah uji manual.
