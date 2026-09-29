# PROGRESS — Belajar Bersama

### 2026-09-28 — ROOT CAUSE "Akses ditolak daftar kuis" DIPERBAIKI (deploy production rules) + verifikasi server-side

**Masalah:** di produksi (`belajar-bersama-prod`), daftar kuis gagal dimuat dengan "Gagal memuat daftar kuis: Akses ditolak…" (`src/shared/utils/errors.js` map dari `permission-denied`).

**Root cause (terbukti, bukan dugaan):** *production rules drift*. Ruleset yang ter-deploy di produksi (`…/rulesets/10533ef7-6439-4ec1-9bd6-6bb74958ad7c`, dibuat 2026-09-26, update terakhir 2026-09-26T17:42:41Z) **tidak mengandung string "quizzes" sama sekali**, sedangkan `firestore.rules` repo sudah punya blok `spaces/{spaceId}/quizzes` (ditambahkan commit `21cfcf7`, 2026-09-27 02:34 +0700 — setelah deploy terakhir). Rules deny-by-default (`allow read, write: if false`) → seluruh read/write `spaces/*/quizzes` ditolak. Cek `.github/workflows/deploy-pages.yml`: workflow hanya build + deploy GitHub Pages, **tidak pernah deploy rules**, jadi drift tidak pernah tertutup otomatis.

**Perbaikan (disetujui pengguna; DOKUMEN TIDAK DIUBAH):**
- `npx firebase deploy --only firestore:rules --project belajar-bersama-prod` → **Deploy complete!** — rules deploy **apa adanya** dari repo (tidak ada edit `firestore.rules`, client, atau grading).
- Ruleset baru produksi: `projects/belajar-bersama-prod/rulesets/b1aa56f6-faf0-41aa-acbc-bf40f10e2c6d`, updateTime **2026-09-28T16:13:12.587637Z**.
- Verifikasi isi: source rules yang ter-deploy **byte-identical** (UTF-8) dengan `firestore.rules` repo termasuk blok quizzes/attempts/questionReports (dibuktikan via API + Node; diff PowerShell sebelumnya palsu — artefak BOM/CRLF/console).

**Verifikasi server-side `POST …/projects/belajar-bersama-prod:test` terhadap rules yang sama (8/8 lulus):**
1. member (owner) `list` quizzes → **ALLOW** · 2. non-member `list` → **DENY** · 3. anonymous `list` → **DENY** · 4. owner baca attempt sendiri → **ALLOW** · 5. partner baca attempt owner → **DENY** (PRIVAT) · 6. owner soal baca report → **ALLOW** · 7. member belum verified baca quiz → **ALLOW** (quizzes read = isMember saja) · 8. non-member baca report → **DENY**.
- Catatan teknis API (untuk AI berikutnya): `request.path` memakai bentuk `PLAIN` `/databases/(default)/documents/...` (bukan `projects/...` yang ditolak 400). Arg fungsi mock (`exists`/`get`) ternyata **URL-encoded**: `/databases/%28default%29/documents/spaces/S`. `get()` result = objek resource `{ data: { … } }`. `list` collection path tak cocok di API ini; kumpulan `list` dipakai path dokumen + `query.limit` (terbukti bisa). karya `functionCalls` di response menunjukkan path yang benar-benar dipanggil engine.
- Emulator tetap konsisten (user `qMjSs…` member ruangnya; list member OK). Hipotesis mismatch space/member **terbantahkan**: rules sudah mencegah state itu (users create wajib `auth.uid == uid`, set `spaceId` wajib `isMemberOf`).

**Status git setelah deploy: bersih** (`git status --porcelain` kosong; tidak ada commit/push). Tidak ada file repo yang diubah.

**Belum / langkah berikut (bukan penghalang):**
- `npm run test:rules` belum dijalankan session ini (butuh emulator :8080 mati; rules tidak diubah, jadi hanya konfirmasi ulang).
- Hasil verifikasi visual/UX belum; cek browser produksi "daftar kuis termuat" langsung oleh pengguna.
- **Minggu depan bila melanjutkan:** entry di bawah "Belum dikerjakan" (verifikasi visual browse soal PGK, audit quiz access selesai karena root cause sudah beres). Tambahkan guard CI yang **mem-push `firestore.rules` ke produksi** (mis. `firebase deploy --only firestore:rules`) agar drift tidak terulang — belum dikerjakan, menunggu keputusan.

### 2026-09-28 — Grading kontrak seragam + kredit parsial PGK γ=0.75 (Tahap 1 Fase 2)

Tahap 1 Fase 2: seluruh penilaian soal menarik satu kontrak, dan soal Pilihan Ganda Kunci (PGK / multiple) mendapat kredit parsial berbasis riset Monte Carlo. Bekerja di `src/features/questions/utils/grading.js` saja; **`firestore.rules` tidak disentuh** — validasi poin di rules hanya membandingkan `answers[0].pointsEarned` dengan `==`, jadi nilai pecahan (mis. 6.67, 3.33) tetap lolos tanpa migrasi skema.

**1. Kontrak grading (ditetapkan + diuji per tipe)**
- Semua tipe mengembalikan `{ isCorrect, pointsEarned, isManual, fraction }`.
- `fraction` = fraksi nilai F ∈ [0,1]; `pointsEarned = round2(points × fraction)` untuk tipe otomatis.
- Tipe manual (`essay`, `code`) → `isCorrect: null`, `isManual: true`, `fraction: 0`, `pointsEarned: 0`, `status: 'pending_review'`.
- `case_study` memakai `fraction = earnedSum / points`, menghitung sub-kredit (round2 per sub), dan menjadi `isManual` bila ada sub-soal tak ternilai.
- Titik pembulatan tunggal `round2(value) = Math.round(value*100)/100` (rumus riset; sifat float `1.005→1` didokumentasikan di tes).

**2. Kredit parsial PGK — hasil riset (artefak: `pgk-research/pgk_REPORT.md`, `pgk_stress.mjs`, `pgk_verify.mjs`, `pgk_metrics.json`, `pgk_dataset.csv`)**
- Formula final: `F = clamp01((c/K) × (1 − γ·w/(N−K)))`, dengan `PGK_GAMMA = 0.75`, N = jumlah opsi, K = jumlah kunci, c = benar dipilih, w = salah dipilih. Guard degenerasi `K == N` (tanpa distraktor) → faktor penalti 1.
- Validasi ekstensif: **155.683 cek / 0 gagal**, determinisme SHA-256, 113 kandidat γ, 45 pasangan N/K, 16.388 baris dataset, Pareto 56 titik. Fakta terverifikasi: `selectAll` flat **0.250** (C8), `stability` 1.000, rata-rata `guessingVsKnowing` −0.064, `blindBest` 0.3648, `knowOne` 0.4287 (= mean(1/K)). Detail lengkap di `pgk-research/pgk_REPORT.md`.
- `sanitizeSelection` membuang duplikat & indeks di luar rentang (C7) sebelum hitung.
- `isCorrect` PGK tetap jawaban **persis benar** (c=K, w=0); selain itu `isCorrect: false` dengan kredit parsial ≥ 0.

**3. Kredit parsial tipe lain**
- `matching`: `fraction = pasangan benar / total pasangan`.
- `ordering`: `fraction = posisi benar / total item`.
- `single`, `boolean`, `short_answer`, `numerical`: tetap dikotomi (0 atau penuh), tapi kini ikut kontrak `fraction`.

**4. Perilaku skor lama**
- Skor terdahulu (hasil snapshot v2) **tidak dimigrasikan**. Rumus baru berlaku untuk snapshot apa pun; `computeScore` di attempt engine tidak berubah (masih menjumlah `pointsEarned` & `manualScore`).

**Verifikasi**
- `tests/grading.test.mjs` ditulis ulang (kontrak per tipe, vektor riset §12, select-all 0.25, partial matching/ordering, case_study breakdown, round2/clamp01/sanitizeSelection).
- `tests/attempt-engine.test.mjs` disesuaikan: tes "jawaban salah" kini membedakan tipe dikotomi (0) vs parsial (PGK `[0]` → 5 poin; ordering salah 1/3 → 3.33 poin).
- `npm run test:units` **341/343** → dua kegagalan di `grading.test.mjs` yang ternyata **bukan bug grading**: ekspektasi `round2(1.005)` (=1, float) dan label (c,w) di tes PGK salah; diperbaiki → **pass semua**. Run terakhir `tests/grading + attempt-engine`: **61/61**.
- `npm run build` hijau (warning bundle 1,45 MB sudah ada sejak lama).
- `npm run test:rules` **tidak dijalankan** — `firestore.rules` tidak disentuh di sesi ini. Emulator & `npm run test:rules` tetap prosedur standar untuk langkah berikutnya.
- **Belum:** verifikasi visual browse soal PGK dengan kredit parsial di emulator; cicilan sisa audit quiz access (production vs emulator) dari sesi sebelumnya belum dijawab.

### 2026-09-28 — Audit UI/UX: cacat kecil nyata, diperbaiki + penjaga regresi

Audit lapis atas terhadap design system dan aksesibilitas yang sudah jadi. **Tidak ada perubahan skema, `firestore.rules`, atau `grading.js`**; tidak ada redesign. Semua temuan sudah dilaporkan di Phase 1 sebelum disentuh, lalu dikerjakan satu per satu dengan build/test di setiap belakang.

**1. Token yang belum ada dipakai sebagai gaya (build hijau, elemen tanpa gaya)**
- Alias `sunken` (`--bg-sunken`) ditambahkan ke `tailwind.config.js`; sebelumnya dipakai di `Input`, `Select`, dan `QuizAttemptResultPage` tapi tidak pernah dipetakan, jadi tidak pernah menghasilkan background.
- `--accent-solid: #4553d6` + `--on-accent: #fff` (dark & light) + util `accentsolid`/`onaccent`. Putih di atas `--accent #5b6ef5` hanya **4.21:1** (gagal WCAG AA untuk teks kecil); token baru **6.07:1**. Dipakai di tombol "Sambung" Matching dan badge jumlah filter.

**2. `/opacity` pada warna yang isinya variabel CSS**
- Sembilan pemakaian `bg-accent/12` dll. diganti pola `color-mix(in_srgb,var(--accent)_12%,transparent)` yang memang dipakai design system. Alasannya: modifier opacity menulis `color-mix` yang **tidak bisa membaca alpha dari `var()`**, jadi hasilnya tidak berlaku.

**3. Kolom yang salah (a11y)**
- `Input`/`Select`: help id dibuat dari `useId` sehingga `aria-describedby` tidak pernah menggantung; error memakai `role="alert"`; teks error sekarang benar-benar menunjuk ke input yang dimaksud.
- **ID bentrok di Question Builder — bug nyata, ditemukan lewat render statis.** `QuestionCardDetails` dirender di dalam **setiap** kartu soal (sampai 50) dan `Input`/`Select` menurunkan id dari label saja, sehingga semua kartu memakai `field-topik`, `field-kesulitan`, `field-tag` yang sama dan setiap `<label for>` menunjuk field kartu pertama. `QuestionCardDetails` kini wajib menerima `idPrefix`, diisi `useId()` per kartu (bukan `index`, yang berubah saat reorder). Kontrol negatif pada 3 kartu: **7 id bentrok sebelum, 0 sesudah**. `QuestionAttemptForm` diperbaiki sama dengan prefix dari `question.id` (termasuk sub-soal per indeks).
- `StatusNote` menerima `title` (dipakai `QuestionReportModal`); `Spinner` menampilkan `label` sebagai teks, bukan hanya ring.

**4. Jalan buntu tanpa penjelasan**
- `MatchingBoard`: menekan item kanan tanpa item kiri terpilih sebelumnya `return` diam — tidak ada yang berubah, tidak ada penjelasan. Di desktop masih ada jalan lain (drag), **di layar sentuh tidak ada**. `useConnectFlow` kini punya `requireLeft()` + `notice` yang dirender sebagai `StatusNote` dan dibersihkan begitu alur berjalan lagi.
- `PageLoading` dibuat: 14 tempat loading halaman/panel memakai satu komponen, jadi `label` tidak bisa lagi hilang. `compact` memakai **prop**, bukan `className="py-8"`, karena urutan kelas CSS ditentukan Tailwind — `py-12` bawaan diam-diam mengalahkan `py-8` pemanggil (ternyata juga berlaku untuk `min-h-0` vs `min-h-[9rem]`).

**5. Aksi destruktif: `window.confirm` + kegagalan yang menutup dialog**
- Hapus akun di `SettingsPage` sekarang lewat `ConfirmDialog` dengan konsekuensi tertulis eksplisit (materi partner & ruang bersama tidak disentuh). `ConfirmDialog` menangkap kegagalan `onConfirm` dan **mempertahankan dialog terbuka** dengan pesan error — menutupnya sama dengan memberi tahu pengguna "beres" padahal tidak ada data yang berubah.

**6. Penjaga regresi: `tests/ui-guard.test.mjs` (14 tes, sudah masuk `test:units`)**
- Menahan enam kelas bug yang sudah pernah terjadi di repo: token kustom yang dipakai tapi tidak dipetakan di config, `/opacity` pada token warna, `text-white` di atas warna brand, `window.confirm`, `onClose` di dalam `catch` ConfirmDialog, dan id field yang bentrok di daftar berkali-kali. Baris komentar dilewati (komentar memang menyebut kelas yang dicari). **Sudah diuji punya gigi:** file probe sementara berhasil memicu 3 dari 4 pelanggaran, lalu dihapus.

**Verifikasi:** `npm run test:units` **282/282** (dari 268; +14 penjaga baru) · `npm run test:deploy` **28/28** · `npm run build` hijau (warning bundle 1,45 MB masih ada, tidak disentuh) · render statis `QuestionCardDetails`/`QuestionAttemptForm`/`StatusNote`/`MatchingBoard`: 0 id duplikat, 0 `label for` menggantung, 0 `aria-describedby` menggantung.
**`npm run test:rules` tidak dijalankan** — `firestore.rules` tidak disentuh di sesi ini (port 8080 kebetulan kosong, jadi bisa dijalankan bila dibutuhkan).
**Belum:** verifikasi visual di browser (butuh emulator + `npm run dev`); `test:filter` dan `test:layout` tidak dijalankan. Perbaikan teks fixture(`Rantai makanan cadeiae早期的`) di `tests/.shot-editor-entry.jsx` — kosmetik, tanpa efek perilaku.

### 2026-09-27 — CP2 refinement: submit aman, route owner/peserta, report, Matching satu-ke-satu, status warna

Refinement UX atas CP2 yang sudah jadi (Attempt Engine). Tidak ada perubahan skema: `pairs` tetap `[{ left, right }]`, snapshot tetap v2, dan `questions/utils/grading.js` **tidak disentuh**.

**1. Submit tanpa konfirmasi tidak sengaja, dan jawaban lokal harus selamat dari kegagalan server**
- `QuizAttemptPage.jsx` memakai state `idle | confirm | submitting | error` + `submittingRef` (proteksi klik ganda di dalam handler, bukan hanya disable tombol). Timer tetap boleh auto-submit.
- Dialog konfirmasi menggantikan `window.confirm`: menyebut **nomor** soal yang kosong, dan ada versi ringkas saat semua soal terisi. Halaman baru pindah ke hasil setelah submit sukses; kalau server menolak, attempt tetap `in_progress`, jawaban lokal tetap ada, dan aksi "Coba kirim lagi" tersedia.

**2. Route `/quiz/:quizId` memilih tampilan sesuai pemilik**
- `QuizRoutePage.jsx` membaca kuis sekali lalu bercabang: `createdBy === auth.uid` → `QuizEditorPage`, selain itu → `QuizParticipantPage` (metadata, daftar attempt sendiri, batas percobaan, aksi mulai/lanjutkan). Peserta tidak pernah menerima kontrol edit; proteksi rules tetap lapis kedua yang independen.
- `useQuiz` menerima options `{ reloadKey, enabled }` (bentuk lama `reloadKey` angka tetap kompatibel) supaya halaman editor boleh memakai listener milik route tanpa dobel fetch.

**3. Pelapor dari attempt dan dari review**
- `QuestionReportModal` (yang sudah ada) dipakai ulang di `QuizAttemptPage` dan `QuizAttemptResultPage`. Peserta diberi tombol "Lapor" per soal; modal menerima snapshot question yang tetap menyimpan `question.id` asli, jadi rules (`questionVisibleTo` + bukan pemilik) bekerja seperti biasa.
- Keterangan tetap **wajib untuk semua jenis**, termasuk `other` — sudah dipatok server (`message.size() > 0`, pola RE2 menolak whitespace-only, `is string`, ≤2000). Sisi klien: label "wajib diisi", hint muncul sebelum tombol nonaktif ditekan, dan `other` dapat hint yang lebih spesifik (warn) dengan contoh kalimat. `busy` menahan klik ganda; service tidak punya duplicate-active guard sehingga tidak dibuat sistem kedua.
- `QuestionReportModal` dipakai untuk report dari soal hasil attempt pun dari bank soal; `QuestionDetailModal`/`SubQuestionEditor` sudah memakai semantic token yang sama.

**4. Dialog konfirmasi berdesain menggantikan native confirm**
- `ConfirmDialog` baru di `src/shared/ui/` (dipakai editor: keluarkan soal, hapus kuis; dan `QuestionBankPage`: pindahkan ke Sampah, hapus permanen — dengan konsekuensi tertulis eksplisit). `window.prompt` pada penilaian manual di halaman hasil diganti form di `ManualGradeDialog` yang sama.

**5. Matching benar-benar satu-ke-satu**
- `questions/utils/matchingPairs.js` (murni, diuji): state `{ lefts, rights, assigned }`; memberi nilai kanan yang sudah dimiliki melepas owner sebelumnya. Bug nyata ketahuan oleh tes: satu nilai kanan bisa terhubung ke dua kiri.
- `MatchingBoard.jsx`: `MatchingEditor` (builder — drag, tap-to-connect, tombol keyboard, tambah/hapus baris, warning kalau ada pasangan belum lengkap) dan `MatchingAnswer` (attempt — kumpulan kanan diacak dengan PRNG ber-seed supaya urutan kunci tidak bocor, satu nilai hanya bisa dipakai sekali, badge benar/salah baru muncul saat review). Builder disambungkan di `QuestionCardTypeFields.jsx` dan `QuestionFormModal.jsx`; dropdown matching di `QuestionAttemptForm.jsx` diganti `MatchingAnswer`.

**6. Status & warna yang punya arti**
- `StatusNote` (tone `info`/`ok`/`warn`/`danger`) dipakai untuk state autosave, error, dan laporan. `Input`/`Select` punya `warning`/`error` + help text.
- `QuestionCard`: "belum lengkap" kini **kuning + ikon** (bukan abu-abu), "tersimpan" hijau, "gagal menyimpan" merah, "menyimpan…" abu — semua dengan ikon supaya tidak hanya mengandalkan warna. Hint kelengkapan ikut kuning. Token baru `--ok-soft`/`--warn-soft` (dark + light) + util `oksoft`/`warnsoft`. Audit warna: tidak ada kelas palet Tailwind mentah di `src/` — hanya token di `index.css` dan warna konten (avatar/topik).

**7. `findUnanswered` akhirnya benar**
- Penanda `available`/`optional` hidup di **snapshot**, bukan di objek jawaban (dokumen `answers` tidak boleh membawa field tambahan). Versi pertama salah karena membaca `answer.available`, sehingga soal `unavailable` terhitung "belum dijawab" — dialog konfirmasi tidak pernah muncul. Signature kini `findUnanswered(answers, questionSource)`; `QuizAttemptPage` mengoper `snapshotById`. 8 tes baru (null/whitespace, `[]`/`{}`, `false`/`0`, optional, unavailable, objek biasa, input bukan array).

**8. Tes & validasi**
- `tests/matching-pairs.test.mjs` baru (19 tes) dan sudah masuk `test:units`. `attempt-engine.test.mjs` 32 → 40 tes. Rules tambah 1 blok: jenis `other` dengan keterangan sah, tanpa keterangan/whitespace-only ditolak.
- `npm run test:units` **268/268** · `npm run test:rules` **120/120** · `npm run test:deploy` **28/28** · `npm run build` hijau. `firestore.rules` tidak diubah pada sesi refinement ini (hanya ditambahkan tesnya).
- Belum: verifikasi manual di emulator (dark/light/mobile) dan belum ada klaim bahwa attempt schema v1 di produksi aman dimigrasikan.

### 2026-09-27 — DISCREPANCY `questionSnapshot` DIPERBAIKI: snapshot berisi ISI SOAL (skema v2)

Perbaikan atas entry audit di bawah ("DISCREPANCY `questionSnapshot` hanya menyimpan ID"). Ketiga requirement konsistensi attempt kini terpenuhi: kuis diubah, soal diedit, dan soal dihapus **semuanya tidak menyentuh attempt yang sudah berjalan**.

**Keputusan: snapshot v2 = salinan isi soal, ditulis langsung (tanpa migrasi).** Emulator lokal diverifikasi kosong (query `spaces` via REST mengembalikan `{}`, tidak ada dokumen attempt lama), jadi tidak ada data yang perlu dimigrasikan. Skema `ATTEMPT_SCHEMA_VERSION = 2` (`src/lib/constants.js`); rules menolak `schemaVersion != 2`. **Belum diverifikasi ke produksi** — bila nanti ada attempt versi 1 di produksi, keduanya perlu handler/backfill terpisah.

**Field yang disalin** — diturunkan dari pemakaian nyata di `QuestionAttemptForm.jsx` (render/review) dan `questions/utils/grading.js` (grading), bukan dari tebakan: `id`, `type`, `prompt`, `points`, `explanation`, lalu per tipe — `options`/`answerIndex`, `options`/`correctIndices`, `correctBoolean`, `acceptedAnswers`, `sampleAnswer`, `pairs`, `items`, `correctValue`/`tolerance`, `starterCode`/`expectedOutput`/`sampleSolution`, `caseText`/`subQuestions`. Field lain (`topicId`, `difficulty`, `visibility`, `tags`, `createdBy`, `deletedAt`, `commentCount`, `timeLimitSeconds`, `attachmentUrl`, `relatedNoteId`, `relatedResourceId`, `hasAnswerKey`, `schemaVersion`) sengaja tidak disalin karena tidak dibaca satu pun dari dua tempat itu — hanya memperbesar dokumen. `points` disalin sebagai nilai yang sudah final (default 10) supaya attempt lama tidak ikut berubah bila poin di bank soal diubah.

**Perubahan kode**
- `quizzes/utils/attemptEngine.js`: `buildSnapshotEntry` (whitelist per tipe + deep copy), `buildSubSnapshotEntry` (ikut menyalin `type` sub-soal), `indexSnapshot`, `resolveQuestion`, `UNAVAILABLE_TYPE`; `buildAnswers`/`gradeAnswerFor`/`computeScore` kini hanya membaca snapshot. `gradeQuestionAnswer` **tidak** disentuh.
- `quizzes/services/quizService.js`: `startAttempt` menyimpan snapshot; `submitAttempt`/`finalizeAttempt` memakai `snapshotMap(attempt)`. Question Bank hanya dibaca di baris `startAttempt`.
- `quizzes/components/QuizAttemptPage.jsx`: render, `setAnswer`, dan submit memakai `indexSnapshot(attempt.questionSnapshot)`. `useQuestions` hanya untuk snapshot awal — dan **menunggu `loading` selesai** (lihat bug di bawah).
- `quizzes/components/QuizAttemptResultPage.jsx`: `useQuestions` dihapus; review murni dari snapshot.
- `quizzes/components/QuestionAttemptForm.jsx`: kasus tepi `unavailable`.
- `firestore.rules`: `validSnapshotEntry` memakai ulang `validQuestionTypeSpecific` apa adanya (nama field kunci identik dengan dokumen soal). Entri `unavailable` wajib `points == 0` dan **dilarang** membawa field kunci apa pun; entri soal nyata wajib `points` 1..100 dan tidak boleh menyamar `available: false`.

**Tiga bug nyata yang ditemukan & diperbaiki saat pengerjaan** (semua ketahuan hanya karena kontrak snapshot diperketat):
1. `buildSubSnapshotEntry` tidak menyalin `type` sub-soal → seluruh sub-soal studi kasus jatuh ke penilaian manual. Terlihat di tes: `case_study` dengan 2 sub otomatis seharusnya otomatis benar.
2. Sub-soal bertipe di luar 7 tipe otomatis (tidak diizinkan `validCaseStudy`) menjadi `unavailable`, lalu dinilai `isCorrect: false, isManual: false` — **otomatis salah tanpa pernah masuk antrean manual**, jadi poin hilang tanpa jalur perbaikan. `gradeAnswerFor` kini mengalihkan seluruh soal itu ke manual. `grading.js` tidak diubah.
3. `useQuestions` mengembalikan `[]` selagi loading, sedangkan efek `startAttempt` hanya menunggu `quiz`. Snapshot bisa tersimpan dengan **seluruh entri `unavailable`** — attempt tidak bisa dikerjakan sama sekali. Halaman ini kini menunggu `questionsLoading` selesai.

**DerIVED: hanya `questionSnapshot[0]` yang divalidasi rules** (rules tidak punya loop) — limitation yang sama dengan `optionListOk`/`validCaseStudy`, sudah terdokumentasi di rules dan PROGRESS. Integritas entri lain dijaga lewat jumlah array yang wajib sama dengan `answers` + `attemptStructuralImmutable`.

**Regresi A–F:** A create / B edit / C delete / D grading 10 tipe di `tests/attempt-engine.test.mjs` (32 tes, termasuk mutasi array di bank soal yang tidak boleh bocor ke snapshot); E user lain tak bisa baca/ubah snapshot + 11 bentuk snapshot salah ditolak + F partner hanya boleh field manual di `tests/firestore.rules.test.js`.

**Verifikasi:** `npm run test:units` 241/241 · `npm run test:rules` 119/119 · `npm run test:deploy` 28/28 · `npm run build` hijau.

**Belum dikerjakan (putusan-baiknya):** soal yang hilang **sebelum** attempt dimulai (`unavailable`) tidak bisa dipulihkan — snapshot memang tidak punya isinya; perlu alur "pilih soal lain". Skor tetap dihitung di client (limitation arsitektur CP2 yang tidak berubah).

### 2026-09-27 — Audit Report Soal + snapshot attempt + privasi (tanpa perubahan kode)

**Koreksi status:** brief menyebut "Report Soal: BELUM ADA". Audit repository menunjukkan fitur ini **sudah selesai terimplementasi penuh** di sesi sebelumnya (untracked, belum di-commit). Tidak ada regresi; tidak ada kode yang diubah di sesi ini.

**Report Soal — perkiraan klaim vs kenyataan (VERIFIED):**
| Komponen | Lokasi | Status |
|---|---|---|
| Konstanta tipe/label/limit | `src/lib/constants.js` (`QUESTION_REPORT_TYPES`, `QUESTION_REPORT_TYPE_LABELS`, `QUESTION_REPORT_LIMITS`, `COL.questionReports='reports'`) | ada |
| Normalisasi (murni, unit-testable) | `questions/utils/questionReport.js` | ada |
| Service tulis + listener owner | `questions/services/questionService.js` (`reportQuestion`, `subscribeQuestionReports`) | ada |
| Hook owner-only | `questions/hooks/useQuestionReports.js` | ada |
| Modal pelapor | `questions/components/QuestionReportModal.jsx` | ada |
| Rules | `firestore.rules` `match /spaces/{spaceId}/questions/{questionId}/reports/{reportId}` (sekitar baris 803) | ada |
| Rules tests emulator | `tests/firestore.rules.test.js` (4 tes `CP3/R`) | ada |
| Unit tests | `tests/question-report.test.mjs` (19 tes) | ada |
| Wiring pelapor | `questions/QuestionCard.jsx` (bank), `quizzes/QuestionCard.jsx` (editor, **bukan** `AddQuestionModal` yang sudah dihapus), `QuizEditorPage.jsx`, `QuestionBankPage.jsx`, `QuestionDetailModal.jsx` | ada |
| Wiring owner (tab "Laporan") | `questions/QuestionDetailModal.jsx` (listener hanya nyala saat `tab==='reports' && isOwner`) | ada |

Model keamanan: report **abadi** (`update`/`delete: if false`), hanya pemilik soal boleh `list`, pelapor hanya boleh `get` reportnya sendiri, melapor soal sendiri atau soal private partner ditolak, `type` dari daftar tetap yang sama dengan client. Pelapor sengaja **tidak** diberi daftar report (UI menjelaskan alasannya) karena `resource.data` di rule `list` membuat query polos owner ikut tak terbuktikan rules-nya — ini dibuktikan tes emulator, bukan asumsi.

**DISCREPANCY (dilaporkan, tidak diperbaiki diam-diam) — `questionSnapshot` hanya menyimpan ID:**
`buildQuestionSnapshot` (`quizzes/utils/attemptEngine.js:35`) menulis array `questionIds` saja, tanpa menyalin isi soal. Saat render & grading, `QuizAttemptPage`/`QuizAttemptResultPage` mengambil soal **live** lewat `useQuestions` → `questionById`. Akibatnya terhadap requirement "attempt tetap konsisten":

| Skenario | Konsisten? | Bukti |
|---|---|---|
| Kuis diubah (soal ditambah/diubah urutan/dikurangi) | **YA** | Snapshot mempertahankan set + urutan ID saat attempt dimulai; perubahan `quiz.questionIds` tidak menyentuh attempt. |
| Soal **diedit** setelah attempt dimulai | **TIDAK** | Prompt/opsi yang tampil berubah di tengah attempt, dan `gradeAnswerFor` (`attemptEngine.js:99`) menilai ulang terhadap versi **baru**. Jawaban yang user berikan berdasarkan versi lama bisa berubah benar/salah. |
| Soal **dihapus** (soft-delete, purge, atau diubah jadi private) | **TIDAK (graceful, bukan konsisten)** | `questionById[id]` jadi `null`. Tidak crash: `QuestionAttemptForm.jsx:35` menampilkan "Soal ini tidak tersedia lagi", `blankAnswer` menandai `needsManualGrade: true` + 0 poin (`attemptEngine.js:104`), dan `computeScore` menghitung `maxScore` 0 untuk soal hilang (`attemptEngine.js:172`) sehingga attempt tidak bisa "lolos" dengan skor penuh. Hasil: attempt benar, tapi isinya hilang permanen. |

Jadi 1 dari 3 requirement konsistensi **tidak terpenuhi**. Ini **bukan** sesuatu yang bisa dianggap "limitation yang wajar": akibatnya paling merusak adalah kasus edit — attempt bisa direkomputasi secara diam-diam ke nilai yang berbeda dari yang dihitung saat attempt itu dikerjakan. Memperbaikinya berarti snapshot berisi isi soal (prompt/options/kunci/points) saat attempt mulai, yang menambah ukuran dokumen attempt dan butuh penyesuaian rules. ~~**Belum dikerjakan — menunggu keputusan.**~~ **SUDAH DIPERBAIKI** — lihat entry "DISCREPANCY `questionSnapshot` DIPERBAIKI: snapshot berisi ISI SOAL (skema v2)" di atas. Tabel di bawah menggambarkan kondisi **sebelum** perbaikan.

Catatan: `questionSnapshot` immutable di rules sudah mengunci riwayat attempt, jadi tidak ada yang bisa menyunting dokumentasi lama; masalahnya murni pada isi snapshot yang tidak menyimpan materi soal.

**Privasi — 4 verifikasi yang diminta (SEMUA LOLOS, tanpa migration):**
Tidak ada migration ke `notes_private`/`resources_private`. Tidak ada security gap nyata. Arsitektur aktual ternyata **berbeda dan lebih ketat** dari yang tertulis di entry M10/M12 (yang menyatakan read rule dilonggarkan jadi `isMember(spaceId)` + privasi pindah ke filter aplikasi). **Kondisi sekarang: privasi ditegakkan di RULES, dan filter aplikasi tetap ada sebagai defense-in-depth.**

- `firestore.rules:364-365` → `allow get/list: if isMember(spaceId) && noteVisibleTo(resource.data, request.auth.uid);`
- `firestore.rules:497-498` → `allow get/list: if isMember(spaceId) && resourceVisibleTo(resource.data, request.auth.uid);`
- Helper aplikasi `notes/utils/visibility.js` & `resources/utils/visibility.js` masih dipakai di semua jalur baca (Dashboard, NotesPanel, NoteEditorPage, ResourcesPanel, RoadmapPage, TopicDetailPage, pencarian global, progressData).

Bukti emulator (semua `[OK]`):
| Verifikasi | Tes |
|---|---|
| private note partner tidak dapat `getDoc` | `note private: partner DITOLAK membacanya langsung (getDoc)` — `assertFails(getDoc(bob))`, `assertSucceeds(getDoc(alice))` |
| private note partner tidak dapat `getDocs`/list | `LIST notes: query polos ditolak; dual-listener hanya mengembalikan yang boleh` — query polos ditolak untuk alice **dan** bob; dual-listener mengembalikan hanya `n_extra`,`n_shared` |
| private resource partner tidak dapat `getDoc` | `resource private: partner DITOLAK membacanya langsung` — `assertFails(getDoc(bob))` |
| private resource partner tidak dapat `getDocs`/list | `LIST resources: query polos ditolak; dual-listener hanya yang boleh` — query polos ditolak; branch `addedBy=='bob'` mengembalikan `[]` |

Query polos ditolak (bukan disaring) justru **lebih ketat** dari sekadar "disaring" — partner tidak bisa menarik private note lewat query tanpa `where`. Yang tersisa hanya catatan emulator-vs-produksi yang sudah terdokumentasi: emulator menyaring LIST berdasarkan *rule*, bukan *query constraint*, jadi query `visibility=='shared'` milik owner ikut mengembalikan dokumen privatnya sendiri (di produksi query tetap menyaring). Ini bukan bug.

**Verifikasi sesi ini (tidak ada file kode disentuh, hanya `docs/PROGRESS.md`):**
- `npm run build` → hijau (built in 5.43s; `dist/404.html` fallback dibuat).
- `npm run test:units` → **226/226 LULUS**, 0 gagal.
- `npm run test:rules` → **ALL 118 TESTS PASSED** (emulator :8080 dipastikan mati dulu; baris `PERMISSION_DENIED` di log adalah output `assertFails` yang diharapkan, bukan kegagalan).
- `npm run test:deploy` → **28/28 LULUS** (App Check = reCAPTCHA Enterprise, `VITE_ROUTER_BASENAME='/belajar-bersama'`).

**Tidak disentuh:** `firestore.rules`, seluruh `src/`, legacy `quizAttempts`, keputusan `/questions` tetap `QuestionFormModal` dan `/quiz/:quizId` tetap `QuestionCard` inline. Tidak ada commit/push. Tidak ada reset/revert. Tidak ada state/database yang dihapus.

**Status checkpoint:** Report Soal **SELESAI** (terverifikasi, tinggal manual test + commit). Soal Terbuka / Blind Submission **belum disentuh** — menunggu instruksi `CP3 LULUS, LANJUT CP4`.

### 2026-09-27 — Quiz Editor: kartu soal jadi unit berbatas + soal baru append di bawah, tidak ada kartu yang lompat/ketutup saat save

**Permintaan:** (1) tiap kartu soal harus terlihat sebagai unit terpisah dengan batas jelas dan penomoran `SOAL N` yang kuat; (2) memastikan kartu yang sedang autosave tidak bergeser, tidak menutup, tidak kehilangan isi/fokus; (3) `+ Soal Baru` dan `Dari Bank Soal` selalu append di **bawah**; (4) tombol panah & drag tetap bekerja; (5) jangan buat flow lebih rumit dari yang perlu.

**Root cause "soal baru muncul di paling atas":** `QuizEditorPage` menyusun `cards` sebagai `[...newCards, ...rows]` (prepend), sementara `appendQuestionIds` menaruh id baru di **ujung** `questionIds`. Dua aturan yang bertentangan → kartu baru meloncat dari atas ke bawah tepat setelah create.

**Root cause "kartu menutup / reset setelah save":** `key={row.questionId}`. Saat autosave pertama selesai, id sementara `new_…` diganti id permanen → React me-remount kartu → state `expanded` di dalam kartu ikut hilang (draft baru yang expanded mendadak menutup) dan DOM/fokus dibuat ulang.

**Perbaikan (util murni di `quizQuestions.js`, diuji dengan `node --test`):**
- `buildEditorCards(rows, newCards)` → kartu baru **selalu di belakang** baris tersimpan, dengan `position: null` + `draftIndex`. Konsekuensinya: posisi kartu sama sebelum dan sesudah create, jadi tidak ada lompatan.
- `isDraftCardVisible(card, present)` → entry draft yang `realId`-nya sudah ada di snapshot disembunyikan, bukan dihapus. Satu soal tidak pernah tampil dua kali, dan kartu tidak pernah hilang-lahir di tengah transisi.
- `cardKeyOf(row, draftKeyById)` → React key stabil. `draftKeyById` memetakan `id_soal → id draft`, jadi kartu yang sama hanya **diperbarui**, bukan remount, ketika id permanen masuk.
- `moveDraftCard(...)` → kartu baru hanya bergerak di dalam blok kartu baru, pada slot yang sama di state (entri tersembunyi tidak ikut bergeser / tidak salah indeks).
- `cardMoveBounds(row, { questionIds, draftCount })` → batas tombol panah dari sumber yang sama dengan logikanya; indeks di luar jangkauan mematikan **kedua** tombol (tidak ada tombol mati maupun tombol yang hidup tapi sia-sia).

**Ketenangan saat save (`QuestionCard.jsx`):**
- `persistedId` (state internal) menyimpan id permanen dari create pertama → save berikutnya jadi `updateQuestion`, bukan create dokumen kedua untuk soal yang sama.
- `locallyEditedRef` + `syncedKeyRef` → begitu kartu disentuh, draft lokal jadi sumber kebenaran. Snapshot dari server hanya dipasang kalau isinya benar-benar berubah **dan** kartu belum pernah diedit. Tanpa ini, satu re-render parent (kartu lain selesai autosave) mengembalikan ketikan yang belum tersimpan.

**Bentuk kartu:** `<li className="rounded-smc border border-line bg-panel px-4 py-3.5">` + `space-y-3` antar kartu. Semua token existing (`--border`, `--radius-sm` = 6px, `--bg-elevated`) — tanpa gradien/glow/shadow baru, tetap cocok untuk dark & light mode. Penomoran memakai `eyebrow` + `text-[12.5px] text-ink` (mono uppercase, label — bukan heading besar). **Catatan:** ini menyimpang dari `.card` yang sengaja flatten (garis bawah saja) — dipakai karena tiap kartu adalah unit edit mandiri, bukan elemen halaman besar; radius 6px & 1px `--border` tetap mengikuti aturan "kotak kecil".

**Lain-lain:** hitungan "Daftar soal (n)" dan batas 50 sekarang memakai `jumlah kartu yang benar-benar dirender` (`cards.length`), bukan hanya `rows.length`, supaya draft yang belum tautan ikut terhitung.

**File changed:** `src/features/quizzes/utils/quizQuestions.js`, `components/QuestionCard.jsx`, `components/QuizEditorPage.jsx`, `tests/quiz-editor-state.test.mjs`, `tests/.shot-stub-service.mjs` (stub create/update supaya render statis tidak pernah menyentuh Firestore).
**Alat bantu (bukan test suite):** `tests/shot-editor-cards.mjs` + `tests/.shot-editor-entry.jsx` — render statis daftar kartu (3 tersimpan + 1 kartu baru expanded) memakai CSS hasil `npm run build`, lalu screenshot dark & light ke `.shots/editor-cards-*.png` lewat harness CDP yang sudah ada. Jalankan: `npx chrome --remote-debugging-port=9344 ...` lalu `node tests/shot-editor-cards.mjs`.
**Tidak disentuh:** `/questions` (`QuestionBankPage`, `QuestionFormModal`), `QuestionPickerModal`, `firestore.rules`, engine grading/attempt.

**Verifikasi:** `npm run build` ✅ → `npm run test:units` ✅ **207/207** (dari 180; +27: append-vs-prepend, tidak lompat setelah create, key stabil, batas panah, geser kartu draft, + guard sumber kartu) → `npm run test:deploy` ✅ 28/28. Smoke render statis `QuestionCard` 8/8 cek (kartu berbatas, `SOAL 1`, drag handle, panah up disabled di batas / down hidup, kebab, chevron). `npm run test:rules` **tidak dijalankan**: emulator Firestore sedang hidup di :8080 dan `test:rules` memakai `firebase emulators:exec` (port bentrok); `firestore.rules` tidak diubah di task ini, jadi tidak ada yang perlu diverifikasi ulang. Screenshot sudah dihasilkan tetapi **belum diperiksa visual** — perlu dilihat langsung oleh pengguna.

**KNOWN LIMITATION (dicatat, bukan untuk task ini):** bila write `questionIds` gagal setelah dokumen soal berhasil dibuat, kartu tetap terlihat di bawah (dokumennya aman di bank soal) dan toast menjelaskan gagalnya; tautan ke kuis tidak dicoba ulang otomatis.

### 2026-09-27 — Quiz Editor: kembalikan tombol Naik/Turun + error handling "editor gagal dibuka"

**Permintaan:** (1) tombol panah Naik/Turun per kartu soal WAJIB ada lagi — "drag adalah tambahan, bukan pengganti"; (2) `/questions` (Bank Soal) **tidak** ikut redesign, `QuestionFormModal` tetap dipakai; (3) daftar tipe sub-soal studi kasus mengikuti `firestore.rules` aktual; (4) kegagalan membuka editor diperlakukan sebagai error kritis dengan aksi "Coba lagi".

**Keputusan yang dipakai (semua sesuai keputusan pengguna):**
- **Drag tetap HTML5 native**, tombol panah adalah jalur kedua ke aksi yang sama. Keduanya memanggil util yang sama, jadi tidak mungkin berbeda hasil.
- **Bank Soal tidak disentuh.** `/quiz/:quizId` = kartu inline baru; `/questions` = wizard modal existing. `QuestionBankPage` & `QuestionFormModal` tidak diubah sama sekali.
- **Rules adalah source of truth untuk sub-soal.** Lihat KNOWN LIMITATION di bawah.
- **`firestore.rules` tidak diubah** untuk task ini.

**Tombol panah (dipulihkan):**
- `QuestionCard.jsx` — dua tombol ikon (`IconArrowUp` / `IconArrowDown`) tepat di samping drag handle, `aria-label="Naikkan/Turunkan soal nomor N"`, `disabled` di batas daftar (tidak ada tombol mati). Hanya tampil untuk pemilik; kartu `locked` tidak menampilkan panah maupun drag.
- `quizQuestions.js` — ditambahkan `moveItemAt(list, index, delta)` sebagai **satu-satunya** implementasi "geser satu langkah"; `moveQuestionIdAt` sekarang membungkusnya. Dipakai juga untuk kartu baru yang belum punya id soal (hanya boleh digeser di dalam blok kartu baru — belum ada di `questionIds` sampai autosave pertama sukses).
- `moveQuestionIdTo` (helper drag) kini benar-benar dipakai; sebelumnya diekspor tapi tidak pernah dipanggil.

**Bug urutan yang ditemukan & diperbaiki (bukan permintaan langsung, tapi drag tidak akan benar tanpanya):**
- `handleReorder` memakai indeks dari array `cards` (kartu baru selalu di depan) lalu menulis langsung ke `quiz.questionIds` → **soal yang salah tertimpa** begitu ada satu kartu baru. Sekarang indeks kartu dipetakan ke `position` (indeks di `questionIds`) dulu.
- Kartu baru ikut diberi `questionId` placeholder (`new_...`) sehingga autosave memanggil `updateQuestion` dengan id yang tidak pernah ada. Sekarang `questionId={null}` untuk kartu baru → jalur `createQuestion` yang benar.

**Error handling "Buat Quiz → editor" (fail = kritis, bukan warning):**
- `utils/quizEditorState.js` (sebelumnya dead code) kini dipakai: `EDITOR_STATE`, `resolveQuizEditorState`, `isValidQuizId`, `isPermissionError`, plus `editorFailureMessage(state, { justCreated })` dan `canRetryEditor(state)`.
- `useQuiz(spaceId, quizId, reloadKey)` — menambah `reloadKey` (untuk "Coba lagi") dan `errorCode` Firebase mentah supaya "akses ditolak" bisa dibedakan dari "gangguan jaringan". Data dikosongkan saat listener gagal, supaya editor kosong tidak pernah tampil seolah-olah berhasil.
- State halaman: `loading` · `ready` · `notFound` (EmptyState "Kuis Tidak Ditemukan") · `permission` ("Akses Ditolak") · `error` ("Gagal Membuka Editor Kuis") · `retry`. Semua memakai `EmptyState` + `Button` yang sudah ada — tidak ada pola visual error baru.
- Aksi di state gagal: **"Coba lagi"** (untuk `error`/`permission`; `notFound` sengaja tidak — mencoba lagi tidak mengubah apa pun) dan **"Buka daftar kuis"**. `quizId` dari route divalidasi lebih dulu (`isValidQuizId`) supaya id rusak tidak pernah sampai ke Firestore dan tidak menampilkan loading selamanya.
- Pesan jujur menurut asal user: kalau datang dari "Buat Quiz" (`navigate(..., { state: { justCreated: true } })`), pesannya berakhir "jangan membuat kuis kedua"; kalau dibuka dari daftar, "cukup ulangi ... tanpa membuat kuis baru".
- **Retry tidak pernah membuat kuis**: `QuizEditorPage` tidak mengimpor `createQuiz` sama sekali (dijaga tes). Tidak ada auto-recovery yang menghapus kuis.
- `QuizListPage.handleCreated` memakai `shouldNavigateAfterCreate(quizId)` — navigasi hanya terjadi kalau `createQuiz` benar-benar mengembalikan `ref.id` yang valid. Tidak ada `quizId` hardcoded di mana pun; `createQuiz` tidak pernah dipanggil sebelum create sukses.
- Tiga bug fatal yang membuat editor tidak bisa dibuka sama sekali ikut diperbaiki: `IconLibrary` (tidak pernah diimpor, tidak ada di `shared/icons`) → `IconBooks`; `emptyQuestionDraft` dipakai tanpa import; `createQuestion`/`updateQuestion` dipanggil tanpa `spaceId`.

**KNOWN LIMITATION / klarifikasi spesifikasi — sub-soal studi kasus:**
Brief awal menyebut "sub-soal tipe 1-9". Implementasi aktual hanya mengizinkan **7 tipe**: `single`, `multiple`, `boolean`, `short_answer`, `matching`, `ordering`, `numerical` (`firestore.rules` `validCaseStudy`, yang menolak `essay`, `code`, dan `case_study` — ketiganya butuh penilaian manual atau nesting). `SUB_QUESTION_TYPES` di `questionTypeFields.js` mengikuti daftar itu, dan `validCaseStudy` **tidak** dilonggarkan. Alasannya: autosave di kartu soal menulis dokumen apa adanya, jadi daftar di client wajib menghasilkan dokumen yang diterima server. Tes membandingkan `SUB_QUESTION_TYPES` dengan daftar yang dibaca langsung dari `firestore.rules`, supaya keduanya tidak bisa menyimpang diam-diam. (Catatan rules lain yang sudah ada: hanya `subQuestions[0]` yang bisa diperiksa server; validasi penuh tiap elemen tetap di client lewat `normalizeSubQuestions`.)

**File changed:** `src/features/quizzes/utils/quizQuestions.js`, `utils/quizEditorState.js`, `hooks/useQuizzes.js`, `components/QuizEditorPage.jsx`, `components/QuestionCard.jsx`, `components/QuizListPage.jsx` · `tests/quiz-editor-state.test.mjs` (baru), `tests/question-card.test.mjs`, `package.json`.
**Tidak disentuh:** `QuestionBankPage.jsx`, `QuestionFormModal.jsx`, `SubQuestionEditor.jsx`, `firestore.rules`.

**Verifikasi:** `npm run build` ✅ · `npm run test:units` ✅ **180/180** (naik dari 134; +44 `quiz-editor-state`, +2 `question-card`) · `npm run test:rules` ✅ 114/114 (tidak berubah) · `npm run test:deploy` ✅ 28/28. Smoke render statis `QuestionCard` (esbuild + `renderToStaticMarkup`, di luar test suite): tombol naik/turun ada, `disabled` di batas benar, drag handle masih ada, kartu `locked` menyembunyikan keduanya.

### 2026-09-27 — Perbaikan flow "Buat Quiz": draft kosong → langsung ke editor

**Permintaan:** form "Buat Quiz" hanya meminta Judul/Deskripsi/Topik, lalu **langsung masuk editor**. Kuis boleh dibuat dengan `questionIds: []`; soal ditambahkan dari editor.

**Audit dulu (tidak ada route/komponen duplikat):** `QuizEditorPage` di `/quiz/:quizId` **sudah** punya segalanya — metadata editable (Judul/Deskripsi/Topik di section Pengaturan), section "Daftar soal", tombol "＋ Tambah Soal" → `AddQuestionModal` → `QuestionFormModal` (existing, untuk buat soal baru) atau `QuestionPickerModal` (existing, untuk soal tersimpan), plus Naik/Turun/Remove. `handleQuestionSaved` sudah otomatis melakukan `appendQuestionIds` + `updateQuizQuestionIds`. **Tidak ada komponen/service/route baru dibuat** — hanya flow form awal yang disederhanakan.

**Perubahan (5 file + 2 test):**
- `QuizFormModal.jsx` — hapus section "Pilih soal tersimpan (minimal 1)" + `QuestionPicker` inline + guard `picked.length === 0`; `createQuiz` dipanggil dengan `questionIds: []`; tombol jadi "Buat Quiz"; `Modal` lepas `wide`; props `questions/questionsLoading/questionsError` dihapus.
- `QuizListPage.jsx` — hapus listener `useQuestions` (menjadi tak terpakai setelah form disederhanakan).
- `QuizEditorPage.jsx` — teks empty-state → "Belum ada soal. Buat soal pertama untuk quiz ini."; hint tombol Mulai diperjelas.
- `quizSettings.js` (`normalizeQuestionIds`) — hapus validasi minimal-1; 0 soal kini sah.
- `constants.js` — `QUIZ_LIMITS.minQuestions: 1 → 0`.
- `firestore.rules` (`validQuiz`) — `questionIds.size() >= 1` → `>= 0`, dan pemeriksaan `questionIds[0]` dibungkus `size() == 0 || …` supaya tidak evaluation-error saat list kosong.

**Tidak dilonggarkan:** batas atas tetap 50, duplikat tetap ditolak, `topicId` wajib + harus ada, permission tetap sama (create/update hanya `createdBy`, read `isMember`, delete hanya pembuat). `questionCount` **tidak dikembalikan** — jumlah soal tetap `questionIds.length`. Grading engine CP1 & attempt engine **tidak disentuh**.

**Guard rules dibuktikan menangkap regresi:** mengembalikan `size() >= 1` → 1 FAIL (`CP1/QUIZ: snapshot questionIds`), lalu dipulihkan → 114/114.

**Verifikasi:** `npm run build` ✅ · `test:units` ✅ **109/109** · `test:rules` ✅ **114/114** · `test:deploy` ✅ **28/28** · `test:attempt` ✅ **17/17**.

### 2026-09-27 — CP2: Quiz Attempt Engine (pengerjaan, auto-grading, manual grading partner)

**Keputusan pengguna (disetujui sebelum implementasi):**
- **`questionCount` DIHAPUS.** Jumlah soal kuis = panjang `questionIds`; tidak ada lagi random-subset. Dihapus dari `QUIZ_SETTINGS_DEFAULTS`, `normalizeQuizSettings`, `validQuizSettings` (`hasOnly`), dan input `QuizEditorPage`. **Tidak ada migration**: diverifikasi via REST ke emulator — koleksi `quizzes` kosong, jadi tidak ada dokumen lama yang perlu dibersihkan.
- **Manual grading: partner BOLEH menilai** (Opsi 2). Field partner dibatasi ketat di rules; `score`/`maxScore`/`scorePercent`/`passed`/`status` direcompute **oleh pemilik**.
- **Koleksi legacy `quizAttempts` dibiarkan utuh** (di luar scope CP2, tidak konflik path dengan `quizzes/{quizId}/attempts/{attemptId}`). Tidak dipakai UI.

**Skema baru:** `spaces/{spaceId}/quizzes/{quizId}/attempts/{attemptId}` — `uid`, `quizId`, `startedAt`, `completedAt`, `durationSeconds`, `questionSnapshot[]`, `answers[]` (`questionId`, `userAnswer`, `isCorrect`, `pointsEarned`, `needsManualGrade`, `manualScore`, `manualFeedback`, `gradedBy`, `gradedAt`), `score`, `maxScore`, `scorePercent`, `passed`, `status` (`in_progress`/`completed`/`pending_manual_grade`/`graded`), `schemaVersion`.

**Grading:** TIDAK ada engine penilaian baru. `src/features/quizzes/utils/attemptEngine.js` mengimpor & memakai ulang `gradeQuestionAnswer` dari `src/features/questions/utils/grading.js` (CP1) untuk 10 tipe. Perilaku grading tidak diubah.

**Race condition manual→recompute:** `finalizeAttempt` (owner) hanya menulis field skor/status dan **tidak menyentuh `answers`**, jadi nilai manual yang baru ditulis partner tidak pernah tertimpa. `preserveManualScores()` menjaga nilai manual tetap ada saat owner submit ulang.

**Rules (`firestore.rules`, blok `attempts`):**
- `uid`/`quizId`/`startedAt`/`questionSnapshot`/`schemaVersion` immutable.
- Read **privat** (`resource.data.uid == auth.uid`) — berbeda dari `quizzes` induk yang shared.
- `answers` owner boleh berubah hanya selama `in_progress`; setelah ditutup terkunci.
- Partner: `changed().hasOnly(['answers'])` + `answerEntryStable` (menjaga `userAnswer`/`pointsEarned`/`isCorrect`/`needsManualGrade` entri indeks 0 tidak berubah) + hanya pada attempt yang sudah selesai.
- `delete: if false`.
- FungsiRules diberi nama `validQuizAttempt` (bukan `validAttempt`) — `validAttempt` sudah dipakai blok legacy `quizAttempts` dan rules menolak dua fungsi bernama sama.

**Pola baru yang ditemukan (berguna untuk AI berikutnya):**
1. `serverTimestamp()` **ditolak SDK di dalam array** ("serverTimestamp() is not currently supported inside arrays"). Karena `gradedAt` berada di dalam entri `answers`, dipakai `new Date()` (waktu client, bukan server).
2. `validQuizAttempt` wajib memanggil `exists(.../quizzes/$(quizId))` — selain mencegah attempt pada kuis hantu, ini juga memberi makna pada parameter `spaceId` (rules menolak parameter tak terpakai).
3. Field yang **tidak berubah** tidak dihitung `changed()`, jadi tes "partner tidak boleh ubah `maxScore`" harus memakai nilai yang benar-benar berbeda (mis. `999`), bukan nilai yang sudah sama.

**Limitation arsitektural (dinyatakan eksplisit, bukan diklaim aman):**
- **Skor dihitung di CLIENT (`computeScore`).** Ini BUKAN mekanisme anti-tampering setara trusted server-side grading. Yang dijaga rules hanya field struktural: `uid`/`quizId`/`startedAt`/`questionSnapshot` immutable, partner tak bisa sentuh `userAnswer`/`score`/`maxScore`. Nilai manual pun tidak terverifikasi karena partner memang diizinkan menulisnya. Klien yang sengaja memalsukan payload bisa menghasilkan skor tidak konsisten.
- `answerEntryStable` hanya bisa membandingkan entri **indeks 0** (rules tidak punya loop). Entri jawaban lain pada array `answers` tidak dapat dibandingkan rules — hanya jumlah array-nya yang dijaga.
- `gradedAt` memakai waktu client (`new Date()`), bukan waktu server.
- `case_study` tanpa `subQuestions` dinilai otomatis benar penuh oleh `grading.js` CP1 — perilaku existing **tidak diubah** CP2; hanya didokumentasikan.
- `frame-ancestors 'none'` di CSP tetap tidak efektif lewat `<meta>` (limitasi CP1, belum berubah).

**File baru:** `src/features/quizzes/utils/attemptEngine.js`, `src/features/quizzes/components/QuestionAttemptForm.jsx`, `src/features/quizzes/components/QuizAttemptPage.jsx`, `src/features/quizzes/components/QuizAttemptResultPage.jsx`, `src/shared/icons/IconClock.jsx`, `tests/attempt-engine.test.mjs`.

**Route:** `/quiz/:quizId/attempt` dan `/quiz/:quizId/attempt/:attemptId/result` (route hasil diletakkan sebelum `/quiz/:quizId` agar tidak tertangkap sebagai `quizId`).

**Verifikasi:** `npm run build` ✅ · `npm run test:units` ✅ **109/109** (naik dari 91; +17 tes attempt engine, 1 tes `questionCount` dihapus) · `npm run test:rules` ✅ **114/114** (naik dari 108; +6 blok `CP2/ATTEMPT`).
- Guard rules dibuktikan menangkap regresi: menghapus `attemptManualOnly()` → 1 FAIL; menghapus `attemptStructuralImmutable()` → 1 FAIL. Keduanya dipulihkan, rules final 114/114.

Status umum tanggal **2026-09-26**: **Checkpoint 1–4, CP2.4 Resources, CP2.5 Heatmap/Riwayat, CP2.6 Chart/Badge, CP2.7 Tags & pencarian global, dan item CP7 Dashboard/Settings/Data SELESAI di kode**. BrowserRouter dipakai agar URL navigasi bersih, export JSON lokal, penghapusan materi pribadi + akun Auth, serta SECURITY.md sudah ditambahkan. **Checkpoint 1-A (rules bank soal) selesai; bug "Buat kode undangan" (permission-denied akibat clock-skew) diperbaiki.** **Build hijau, unit 41/41, tes rules 91/91, audit dependency produksi 0 kerentanan.** Privasi notes/resources ditegakkan server-side dengan pola dual-listener. Emulator tetap persisten (`--import/--export-on-exit` via `npm run emulators`).

## 1. Ringkasan status

| Area | Status | Catatan |
|---|---|---|
| Scaffold React+Vite+Tailwind+Firebase | ✅ Selesai | emulator-first; offline-ready (font sistem) |
| Auth email/password + verifikasi email | ✅ Selesai | verified wajib utk create/join |
| Auth Google (produksi) | ✅ Kode siap | otomatis nonaktif saat mode emulator |
| Space 2-user + undangan kode sekali pakai | ✅ Selesai | tanpa batch lintas-koleksi (rules emulator tak lihat tulisan batch); 2 langkah + cleanup yatim |
| Firestore Security Rules (deny-by-default) | ✅ Selesai | 91 tes; **run terakhir 91/91 lulus** (2026-09-26) |
| Tes aturan (91) | ✅ Lulus | 2026-09-26; 84 CP1-A (10 tipe soal, dual-listener) + 7 CP-INVITE (buat/join undangan: clock-skew, ownership, `spaceName` verbatim) |
| Unit test utilitas murni (`test:units`) | ✅ Lulus | **41/41** (2026-09-26): navigasi, progress, privasi pencarian, pohon topik, grading, **invite (`test:invite` 7/7)** |
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

### 2026-09-27 — CP1: App Check + konfigurasi deploy (2 bug produksi ditemukan & diperbaiki)
- **Temuan utama (bukan dari laporan lama — diverifikasi dari hasil build nyata):**
  1. **CSP TIDAK PERNAH AKTIF.** `index.html` tidak punya placeholder `<!--CSP-->`, sedangkan `vite.config.js` melakukan `html.replace('<!--CSP-->', ...)`. `String.replace` diam-diam tidak mengubah apa pun bila target tidak ditemukan → **seluruh proteksi CSP yang ditulis di vite.config.js tidak pernah masuk ke build produksi**. Terbukti: `dist/index.html` hasil build lama tidak mengandung `Content-Security-Policy` sama sekali. Diperbaiki dengan menambahkan placeholder + komentar peringatan.
  2. **Deep link GitHub Pages rusak (layar putih).** `base: './'` (relatif) membuat aset ter-reference sebagai `./assets/x.js`. GitHub Pages melayani deep link (`/learn`, `/quiz/abc`) lewat `404.html` — salinan `index.html` — sehingga `./assets/...` resolve ke `/belajar-bersama/learn/assets/...` → 404 → layar kosong. Diperbaiki: `base` kini diturunkan dari `VITE_ROUTER_BASENAME` yang sama dengan `basename` BrowserRouter (sumber kebenaran tunggal, wajib format absolut).
- **App Check:** provider dibuat **dapat dipilih** lewat `VITE_RECAPTCHA_PROVIDER` — `v3` (default, `ReCaptchaV3Provider`, sesuai permintaan checkpoint) dan `enterprise` (`ReCaptchaEnterpriseProvider`, hasil keputusan 2026-09-26 yang tetap dipertahankan, tidak dihapus diam-diam). Keduanya tersedia di firebase 10.14.1. Mode **monitoring** ada di Firebase Console (bukan kode); kode hanya mengirim token.
- **CSP & App Check:** `connect-src` ditambah `https://firebaseappcheck.googleapis.com` (attestation) dan `https://www.google.com/recaptcha/`; `script-src` sudah memuat `www.google.com`/`www.gstatic.com`/`www.recaptcha.net`. `frame-src` sudah ada.
- **Debug token:** variabel ada di `.env.example` tanpa nilai; nilai asli tetap di `.env.development.local`/`.env.production.local` yang **terverifikasi tidak tracked** (`git check-ignore` + `git ls-files`).
- **Guard regresi baru:** `tests/deploy-config-check.mjs` (`npm run test:deploy`) menjalankan build lalu memverifikasi CSP benar-benar ada di `dist/index.html` (bukan hanya tertulis di config), `404.html` terbentuk, dan path aset absolut. **Guard ini diuji dengan sengaja mengembalikan kedua bug** → keduanya tertangkap `[FAIL]` (bukan lulus diam-diam), lalu dipulihkan → **14/14 lulus**.
- **Verifikasi build deploy:** dengan `VITE_ROUTER_BASENAME=/belajar-bersama`, aset jadi `/belajar-bersama/assets/...` (aman untuk deep link), CSP ada, `404.html` ada, dan basename ikut ter-bundle ke JS.
- **`firestore.rules` TIDAK disentuh** — App Check bekerja di layer terpisah (verifikasi token di sisi server sebelum Rules dievaluasi), jadi tidak ada konflik. `npm run test:rules` tidak perlu dijalankan ulang.
- **Hasil:** `npm run build` ✅ 245 modul · `npm run test:units` ✅ 91/91 · `npm run test:deploy` ✅ 14/14.

### 2026-09-27 — CP0 audit privasi: rules SUDAH benar, tidak perlu restrukturisasi
- **Laporan lama (M10/M12) sudah usang.** Rule saat ini BUKAN `allow read: if isMember(spaceId);` polos, melainkan filter **per-dokumen**: `noteVisibleTo(n, uid)` = `ownerId == uid || (visibility == 'shared' && deletedAt == null)`, dengan `get` **dan** `list` sama-sama difilter (`firestore.rules` L356-365; resource L492-497). Jadi privasi ditegakkan rules, bukan disembunyikan di UI. Tidak ada kebocoran, tidak perlu pemecahan koleksi `notes_private/{uid}/items`.
- **Uji manual dua akun (belum pernah dilakukan sejak Fase 1) — `tests/privacy-two-account-probe.mjs` (`npm run test:privacy:accounts`): 11/11 lulus** dengan `permission-denied` asli dari Rules. Spasi uji lama ternyata **hanya beranggota 1** sehingga tidak ada partner untuk diuji → harness ini membuat ruang dua akun sendiri (daftar → verifikasi → buat ruang → kode undangan → join).
  - B `getDoc` note private A → **ditolak**; resource private A → **ditolak**; note shared A → **boleh** (tidak over-block).
  - B `getDocs` polos (notes & resources) → **ditolak**, bukan disaring.
  - B dual-listener (pola yang dipakai `useNotes`) → hanya `["PUBLIK-NOTE"]`, tidak ada private.
  - Catatan harness: `err` WAJIB persis `permission-denied` — versi awal sempat menghitung `TypeError` sebagai "privasi aman" (false positive), sudah diperketat.

### 2026-09-27 — Filter terpusat: 6 dropdown deret → 1 tombol ikon + panel
- **Keluhan:** toolbar Notes (dan Resources) menampilkan 6 dropdown sejajar yang terlalu padat; di mobile teksnya terpotong ("Semua pemi…", "Semua visibilit…").
- **Audit (sebelum menulis kode):** pola "deretan `<Select>` dalam satu toolbar" ditemukan di **2 halaman saja** — `NotesPanel.jsx` (6 select) dan `ResourcesPanel.jsx` (4 select, hanya saat `!scopeIds`). Select lain (`NoteEditorPage`, `ResourceFormModal`, `TopicFormModal`, `QuizFormModal`, `QuizEditorPage`) adalah field **di dalam form/modal**, bukan filter daftar → **tidak tersentuh**.
- **Komponen baru:** `src/shared/ui/FilterPanel.jsx` (satu komponen, dua tampilan sesuai breakpoint). Mobile `<860px` → bottom sheet (tinggi isi, maks 80vh, scroll internal, handle bar, header + tombol X, footer Reset/Terapkan, scroll body terkunci). Desktop `≥860px` → popover 320px di bawah tombol dengan **collision detection** (rata kiri → geser rata kanan → jepit; naik ke atas bila tidak muat di bawah), ditutup via Escape / klik luar / toggle; **tanpa** tombol "Terapkan" (popover sudah tertutup sendiri).
- **Ikon:** `src/shared/icons/IconFilter.jsx` — corong/funnel (bukan sliders), karena `IconSettings` sudah memakai motif "tiga garis + titik" sehingga pola itu akan mudah tertukar. Aturan ikon keluarga tetap: viewBox 24×24, stroke 1.5, currentColor, cap/join round; tinggi gladly (y 4.5–19.5) agar optik sejajar dengan teks.
- **`activeCount`:** dihitung di pemanggil; nilai selain default = aktif. `sortBy` **sengaja tidak dihitung** (urutan tampilan, bukan penyaringan data). Badge hanya muncul bila > 0.
- **Toggle "Sampah":** tetap di toolbar (bukan di panel) — pergantian mode tampilan, bukan filter. Di bawah 520px teks disembunyikan jadi ikon + angka; nama penuh tetap ada di `aria-label`.
- **Reuse:** logic focus trap diekstrak dari `Modal.jsx` ke `src/shared/ui/focusTrap.js` (dipakai `Modal` + `FilterPanel`), tidak diduplikasi. Animasinya lewat kelas CSS di `index.css` (`.sheet-in`, `.pop-in`) agar tunduk aturan `prefers-reduced-motion` yang sudah ada.
- **Bug yang tertangkap saat validasi & sudah diperbaiki:**
  1. `NavIcon`/toolbar — versi pertama toggle Sampah menampilkan **"Sampah (0) 0"** (kedua `<span>` sama-sama tampil karena `max-[520px]:hidden` + `max-[520px]:inline` tanpa kondisi awal). Diperbaiki dengan `hidden` pada span angka.
  2. Fokus kembali ke trigger sebelumnya bergantung pada `previous` (elemen fokus sebelum panel dibuka); programmatic click tidak memindahkan fokus sehingga bisa `body`. Sekarang fokus **selalu** ke trigger.
  3. Trigger sempat hilang dari DOM pada mode sheet sehingga tidak ada tujuan fokus kembali — trigger kini selalu ter-mount, hanya sheet-nya yang di-portal.
- **Exit animation (ditambahkan):** panel TIDAK langsung unmount saat ditutup. State baru `closing` menahan panel di DOM sambil animasi keluar main, baru `setOpen(false)` setelah durasi habis. Konsekuensi yang harus dijaga (semuanya sudah ditangani):
  - **Scroll lock & focus trap tetap hidup** selama animasi — keduanya terikat ke `open`, bukan ke `closing`. Kalau dilepas lebih awal, halaman di belakang sheet akan melompat ke posisi scroll lama tepat saat sheet menghilang.
  - **Fokus kembali ke trigger** baru terjadi setelah animasi selesai (Effect-nya bergantung pada `open`), bukan saat `closing` dimulai.
  - **Durasi JS (`DUR_SHEET` 170ms / `DUR_POP` 130ms) harus sinkron dengan CSS** (160ms / 120ms + buffer). Tidak memakai event `animationend` supaya tidak bisa menggantung bila animasi ter-skip (mis. tab tidak aktif). Konsekuensinya: kalau CSS dan JS berbeda, panel bisa berkedip sesaat sebelum hilang.
  - `.pop-out` & `.sheet-backdrop-out` memakai `animation-fill-mode: forwards` — tanpa itu opacity kembali ke 1 tepat di frame terakhir dan panel berkedip penuh sesaat sebelum unmount.
  - Klik trigger saat animasi keluar berjalan membatalkan animasi (toggle balik) alih-alih menumpuk animasi baru.
  - `prefers-reduced-motion` (yang sudah ada di `index.css`) tetap dihormati: `close()` mendeteksi langsung lalu unmount seketika tanpa menunda.
  - Durasi disimpan di `durRef` saat `close()` dipanggil, jadi pergantian breakpoint di tengah animasi tidak mengacaukan timing.
- **Validasi:** `tests/filter-panel-check.mjs` (`npm run test:filter`) — harness CDP sendiri (helper `tests/helpers/cdp.mjs` diekstrak agar bisa dipakai `layout-align` & harness baru). **59/59 lulus**: sheet & popover, dark & light, badge, Reset tanpa menutup, Terapkan menutup, Escape/backdrop/klik-luar, scroll lock, collision detection, fokus masuk & kembali, Resources memakai komponen yang sama (4 filter), plus exit animation (terpasang, panel masih ada & bergerak saat keluar, baru unmount setelahnya).
  - Nilai yang dibuktikan bukan cuma "keyframes terpasang": di tengah animasi popover terbaca `opacity=0.62` dan sheet terbaca `translateY=144px` — jadi benar-benar bergerak, bukan hanya punya nama animasi.
  - 2 kegagalan awal lain ternyata **harness**, bukan aplikasi: (a) dua `setState` dalam satu evaluate di-batch React; (b) ruang uji belum punya topik/tag sehingga `setSelect` diam-diam tidak mengubah apa pun — sekarang harness memilih select yang memang punya opsi.
- **Verifikasi:** `npm run test:filter` ✅ 59/59 · `npm run test:layout` ✅ 45/45 · `npm run build` ✅ 245 modul · `npm run test:units` ✅ 91/91. `firestore.rules` tidak disentuh.

### 2026-09-27 — Alignment sidebar/header: akar masalah `inline-flex` (bukan sekadar optik)
- **Keluhan:** "terlihat tidak sejajar masih" — ikon nav terlihat duduk lebih tinggi dari teksnya.
- **Akar masalah (bukan soal margin):** `NavIcon` membungkus SVG dengan span `inline-flex`. Di dalam `Sidebar`, rantai elemennya `iconWrapper(flex) → colorSpan(block) → NavIconSpan(inline-flex) → svg`. Karena `inline-flex` ikut(line-box) dan duduk di atas **baseline** teks, line box menyisakan ruang descender di bawahnya — sehingga ikon 20px terdorong **2.8px ke atas**, sementara label (flex item biasa) tetap benar-benar di tengah. `items-center` + `leading-none` tidak pernah bisa menyeimbangkan keduanya; kotak ikon (pusat 162.2px) dan kotak label (pusat 165.0px) memang tidak berada di sumbu yang sama.
- **Perbaikan:** span pembungkus `NavIcon` diubah `inline-flex` → `flex` (+ `leading-none`), sehingga tidak membentuk line box sama sekali. Sebagai flex item langsung (BottomNav/Drawer) `inline-flex` sebenarnya sudah di-blockify, jadi tidak ada perubahan perilaku di sana.
- **`IconDiscuss`:** artwork-nya sendiri tidak berada di tengah viewBox 24×24 (ink y 4.5–18.5, pusat 11.5). Dikgeser +0.5 agar pusat tinta = 12.
- **Metode ukur (penting):** harness sebelumnya membandingkan **pusat kotak** elemen — keduanya selalu sama tinggi & sama pusat, jadi selalu melaporkan "0.00px" padahal tidak sejajar. Harness baru `tests/layout-align.mjs` (script `npm run test:layout`) mengukur **titik pusat tinta**: ikon via `svg.getBBox()` yang dipetakan ke piksel layar, teks via `canvas TextMetrics` (baseline − tinggi kapital, dengan half-leading).
- **Cakupan:** sidebar rail lebar (12 item) + badge "nanti", rail ciut (tinta ikon vs tengah baris), bottom-nav, drawer, PageHeader (4 halaman), tombol ikon topbar.
- **Hasil:** **45/45 lulus**, toleransi |Δ| ≤ 0.6px. Sebelumnya 25 gagal dengan worst-case **+3.71px**; kini worst-case **+0.6px** dan sebagian besar 0.00px.
- **Verifikasi:** `npm run test:layout` ✅ 45/45 · `npm run build` ✅ 242 modul · `npm run test:units` ✅ 91/91. `firestore.rules` tidak disentuh → `test:rules` tidak perlu dijalankan ulang.

### 2026-09-26 — Audit keamanan dan kesiapan deploy
- Audit konfigurasi produksi menemukan `.env.production.local` terisi dan `VITE_USE_EMULATORS=false`; nilai lokal tetap tidak dilacak Git.
- App Check Enterprise, CSP reCAPTCHA, dan validasi konfigurasi Firebase diperketat; konfigurasi inti yang tidak lengkap sekarang tidak dianggap siap produksi.
- Workflow `.github/workflows/deploy-pages.yml` ditambahkan untuk build/deploy GitHub Pages menggunakan GitHub Repository Variables.
- Runtime workflow memakai Node.js 24 agar sesuai dengan dependency Google Cloud terbaru pada runner GitHub Actions.
- Folder export emulator lokal (`firebase-export-*/`) ditambahkan ke `.gitignore` agar data akun/data uji tidak ikut ter-upload.
- Verifikasi: `npm run build` ✅, `npm run test:units` ✅ 23/23, `npm run test:rules` ✅ 77/77, `npm audit --omit=dev --offline` ✅ 0 kerentanan.

### 2026-09-26 — Routing GitHub Pages
- `BrowserRouter` kini menerima `VITE_ROUTER_BASENAME`; workflow GitHub Pages mengisinya dengan `/belajar-bersama` agar navigasi dan redirect mempertahankan subpath repository.

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

### 2026-09-26 — Checkpoint 1-A: rules & tes bank soal (konteks sebelum fix undangan)
- `firestore.rules` diperluas untuk 10 tipe soal (single/multiple/boolean/short_answer/essay/matching/ordering/numerical/code/case_study). Field lama dipertahankan: `prompt`, `answerIndex`, `visibility`, `createdBy`, `createdAt/updatedAt`, `deletedAt`, `schemaVersion`.
- Perbaikan fail-open pada multiple select: `correctIndices` kini divalidasi **semua** elemennya terhadap himpunan literal `0..(options.size()-1)` (`indicesInRange`), bukan hanya indeks 0. `subQuestions` case_study dilonggarkan ke 0..10 (form belum punya editor sub-soal; `questionService` menulis `[]`).
- `tests/firestore.rules.test.js` ditambah: `await testEnv.clearFirestore()` sebelum seed (dokumen sisa run sebelumnya membuat 21 tes `assertSucceeds` gagal padahal rules benar) + 7 blok tes CP1-A.
- Verifikasi: `npm run test:rules` ✅ **84/84** (2026-09-26). `firestore.rules` bagian `invites` TIDAK disentuh CP1-A.

### 2026-09-26 — Perbaikan bug "Buat kode undangan" (permission-denied produksi)

#### 1. Status awal
- Gejala laporan: owner → Settings → "Undang partner" → tombol **Buat kode** → toast `⚠️ Akses ditolak. Data ini bukan untuk Anda, atau Anda belum terverifikasi.` Pesan itu adalah pemetaan generik `permission-denied` di `src/shared/utils/errors.js:26` (Firestore tidak mengirim detail kondisi rule yang gagal).
- Hasil audit sebelumnya: operasi Firestore pertama yang gagal = `setDoc(invites/{code})` di `generateInvite()` (`src/features/space/services/spaceService.js`); `getDoc(spaces/{spaceId})` PASS.
- Root cause masih **hipotesis**: (A) `expiresAt = new Date(Date.now() + INVITE_TTL_MS)` vs rule `expiresAt <= request.time + 24 jam` → margin nol; (B) `spaceName` di-`trim().slice(0,60)` sehingga bisa beda dari dokumen; (C) tombol memakai `disabled={roles?.filled}` yang `false` saat `space` masih `null`.
- Kondisi workspace saat melanjutkan: perubahan CP1-A (`firestore.rules`, `tests/firestore.rules.test.js`, 84/84) **dan** sebagian fix invite (`spaceService.js`, `InviteCard.jsx`, `SettingsPage.jsx`, `src/features/space/utils/invite.js` baru, `tests/invite.test.mjs` baru, `package.json` script `test:invite`) sudah ada di working tree, belum di-commit; `docs/PROGRESS.md` belum memuat entri untuk keduanya.

#### 2. Audit / verifikasi lanjutan
- File & fungsi diperiksa: `spaceService.js` (`generateInvite`, `readAuthTokenFacts`, `joinSpaceByCode`), `src/features/space/utils/invite.js` (`resolveInviteExpiry`, `inviteSpaceName`, `inviteReadiness`, `inviteCreateErrorText`), `InviteCard.jsx`, `SettingsPage.jsx:313`, `src/lib/constants.js` (`INVITE_TTL_MS` = 24 jam, `INVITE_CODE_BYTES` = 18), `firestore.rules:925-950` (match `/invites/{code}`), `firestore.rules:936-939`.
- **Dikonfirmasi (A) — root cause utama.** `expiresAt` dihitung dari jam perangkat, plafon rule dari jam server, margin = 0 ⇒ selisih jam apa pun (perangkat lebih cepat) membuat create deny. Emulator tidak pernah gagal karena client & server memakai jam host yang sama, plus latensi request membuat `request.time` selalu ≥ `Date.now()` saat payload dibuat. Inilah mengapa bug ini hanya muncul di produksi.
- **Dikonfirmasi (B).** `String(space.data().name || 'Ruang Belajar').trim().slice(0, 60)` bisa berbeda dari `get(spaces).data.name` untuk dokumen yang tidak persis ≤60 karakter & ter-trim (mis. dokumen disunting di luar aplikasi) → deny pada `firestore.rules:936`.
- **Dikonfirmasi (C).** `spaceRoles(null, uid)` mengembalikan `filled:false` (`spaceService.js:149-155`), sehingga `disabled={roles?.filled}` tidak mematikan tombol saat ruang belum termuat → klik menghasilkan deny `memberIds.size() == 1` (`firestore.rules:937`).
- **Ditolak:** hipotesis "email verification" sebagai penyebab. Kartu undangan hanya dirender di halaman yang sudah membaca `spaces/{spaceId}`, dan rule `get` ruang juga mensyaratkan `verified()` (`firestore.rules:212`); jika klaim `email_verified` false, aplikasi sudah jatuh ke Onboarding sebelum tombol muncul.
- **Ditolak:** mismatch schema/path payload — 10 field yang dikirim persis dengan `keys().hasAll/hasOnly` dan `validInvite` (`firestore.rules:911-931`).

#### 3. Implementasi

| File | Fungsi/section | Apa yang diubah | Alasan | Dampak security | Dampak behavior existing |
|---|---|---|---|---|---|
| `src/features/space/utils/invite.js` (baru) | `resolveInviteExpiry` | `expiresAt = serverIssuedAtMs + INVITE_TTL_MS − 5 menit` (basis waktu server); fallback `Date.now() + INVITE_TTL_MS − 1 jam` bila basis server tidak ada | Memindahkan acuan waktu dari jam perangkat ke jam server + memberi margin clock-skew; lihat verifikasi matematis di bagian 4 | Tidak ada pelemahan — plafon 24 jam rule tetap terpenuhi (malah selalu < plafon) | Umur invite efektif ≈23j55m (server) / ≈23j (fallback); "24 jam" tetap terpenuhi sebagai **batas maksimum** |
| idem | `inviteSpaceName` | Validasi tipe/panjang **tanpa** `trim`/`slice`; nilai dikirim verbatim | Rule membandingkan kesamaan persis dengan dokumen ruang (`firestore.rules:936`) | Tidak ada perubahan (validasi lokal saja) | Nama ruang persis dari dokumen; bila di luar batas 60 → ditolak lokal dengan pesan jelas, bukan deny misterius |
| idem | `inviteReadiness` | Guard kesiapan: `generating` / `!spaceId` / `space null` / `pending` / `memberIds 0` / `memberIds >= 2` → tidak siap | Menggantikan `roles?.filled` yang `false` saat data belum ada | Tidak ada (mencegah tulis ilegal, justru memperketat UX terhadap syarat rules) | Tombol "Buat kode" tidak muncul saat ruang belum termuat; teks "Memuat data ruang…" tampil |
| idem | `inviteCreateErrorText` | Peta `permission-denied` → pesan langkah konkret (verifikasi email, ruang 1 anggota, muat ulang) tanpa menyebut nama rule/field | Pesan generik `errors.js:26` tidak bisa ditindaklanjuti pengguna | Tidak ada (hanya teks) | Toast spesifik untuk kegagalan create invite |
| `src/features/space/services/spaceService.js` | `readAuthTokenFacts` (baru) | Baca `issuedAtTime`/`iat` ID token (waktu server) + klaim `email_verified` | Menyediakan basis waktu server & meniru persis cek `verified()` rules | Tidak ada (membaca token, bukan melewati verifikasi) | Satu panggilan `getIdTokenResult()` (berasal dari cache token) sebelum create |
| idem | `generateInvite` | Pre-check lokal: `spaceId` kosong, email terverifikasi, ruang ada, **anggota** & **tepat 1 anggota**, nama valid; `expiresAt` dari helper; `spaceName` verbatim; `permission-denied` dipetakan ke pesan spesifik | Supaya setiap kondisi yang bisa diketahui lokal menghasilkan pesan yang benar, bukan "Akses ditolak" | **Tidak melemahkan security**: rule tetap mengecek ulang `verified()`, `isMemberOf`, `createdBy == uid`, `used == false`, `memberIds.size() == 1`, kesamaan `spaceName`, dan jendela 24 jam — pre-check lokal hanya menambah lapisan penjelasan | Path `invites/{code}` & 10 field schema **tidak berubah**; error lokal muncul lebih awal |
| `src/features/space/components/InviteCard.jsx` | prop & render | Prop `disabled` diganti `space` + `pending`; `showButton` hanya untuk `ok`/`generating`; guard `if (!readiness.ready) return` | Tombol tidak boleh bisa ditekan sebelum data siap (Langkah 3) | Tidak ada perubahan aturan; hanya menghindari permintaan yang pasti ditolak | Saat penuh → pesan "Ruang sudah penuh"; saat loading → "Memuat data ruang…"; saat generating → spinner |
| `src/features/settings/components/SettingsPage.jsx` | `SettingsPage` | `<InviteCard spaceId={spaceId} space={space} pending={pending} />` (menggantikan `disabled={roles?.filled}`) | `roles` tidak boleh menjadi sumber kesiapan karena `null`-nya ambigu | Tidak ada | Tidak ada perubahan tampilan lain; `roles` tetap dipakai untuk daftar anggota |
| `tests/invite.test.mjs` (baru) | 7 unit test | Uji `resolveInviteExpiry`, `inviteSpaceName`, `inviteReadiness`, `inviteCreateErrorText` | Regression test fix (bukti non-vakum) | — | — |
| `tests/firestore.rules.test.js` | seed + 7 blok `CP-INVITE` | Seed `space_unik` (nama berspasi ganda), `space_panjang` (nama 75 karakter), `space_penuh` (2 anggota), `users/hana`, `users/ivan`; 7 blok tes baru | Menutupi 12 skenario wajib tanpa menghapus satu pun tes lama | Memperkuat: deny-case baru untuk ownership/size/expiry/path | Seed bertambah saja; urutan & isi tes lama tidak berubah |
| `package.json` | scripts | `test:invite` baru; `test:units` menyertakan `tests/invite.test.mjs` | Agar unit test ikut suite baku | — | — |

#### 4. Verifikasi matematis `resolveInviteExpiry`
Plafon rule (`firestore.rules:938-939`): `expiresAt > request.time` DAN `expiresAt <= request.time + 24 jam`.
- **Cabang server:** `expiresAt = issuedAt + 24h − 5m`. Karena `issuedAt ≤ serverNow` (token selalu diterbitkan di masa lalu), `expiresAt ≤ serverNow + 24h − 5m` ⇒ lolos plafon **dengan margin 5 menit** walau jam server Auth & Firestore berbeda. Token Auth berumur ≤ 1 jam (refresh otomatis) ⇒ `issuedAt ≥ serverNow − 1h` ⇒ `expiresAt ≥ serverNow + 22h55m > serverNow` ⇒ **tidak pernah langsung expired**.
- **Cabang fallback:** `expiresAt = deviceNow + 24h − 1h`. Plafon terpenuhi selama perangkat tidak lebih cepat dari server > 1 jam (skew nyata perangkat biasanya ratusan ms–detik) ⇒ aman; batas bawah `deviceNow + 23h > serverNow` selama perangkat tidak lebih lambat > 23 jam.
- **TTL produk:** `INVITE_TTL_MS = 24 jam` tidak diubah; 24 jam tetap dipenuhi sebagai **batas maksimum** rule, dengan masa berlaku efektif 23j55m (basis server) / 23j (fallback) — trade-off terdokumentasi di komentar `invite.js`.
- **Emulator vs produksi:** di emulator client & server memakai jam host yang sama dan `request.time` direkam setelah latensi jaringan sehingga payload lama selalu lolos; di produksi `request.time` berasal dari jam Google dan `Date.now()` dari jam perangkat yang tidak disinkronkan ⇒ payload lama deny.

#### 5. Testing (jalankan, hasil nyata)
| Command | Tujuan | Hasil |
|---|---|---|
| `node --test tests/invite.test.mjs` | Uji helper baru | ✅ **7/7** |
| mutasi: `INVITE_SERVER_MARGIN_MS = 0` & `INVITE_CLIENT_MARGIN_MS = 0`, lalu dijalankan ulang | Membuktikan unit test **bukan vakum** (margin 0 = bug lama) | ❌ **5 pass / 2 fail** (expected) → nilai margin dikembalikan (5 menit / 1 jam) |
| `node tests/firestore.rules.test.js` (iterasi 1, emulator berjalan) | Regression rules setelah fix + 7 blok baru | ✅ **ALL 91 TESTS PASSED** |
| `node tests/firestore.rules.test.js` (iterasi 2, setelah tambah kasus isolasi `penuh_anggota`) | Memastikan kasus isolasi `memberIds.size() == 1` lulus | ✅ **ALL 91 TESTS PASSED** |
| `npm run test:invite` | Suite baku unit invite | ✅ **7 tests, 7 pass, 0 fail** |
| `npm run test:units` | Seluruh unit (navigasi, progress, privasi, topik, grading, invite) | ✅ **41 tests, 41 pass, 0 fail** (34 lama + 7 baru) |
| `npm run test:rules` (`emulators:exec`, exit code 0) | Verifikasi resmi seluruh rules | ✅ **ALL 91 TESTS PASSED** + `Script exited successfully (code 0)`; `[FAIL]` = 0; `[OK]` = 91 |
| `npm run build` | Build produksi | ✅ **built in 6.61s** + `postbuild` → `dist/404.html`; **0 error** |

Catatan iterasi: tidak ada test gagal yang perlu diperbaiki pada fix ini — semua iterasi lulus; satu-satunya kegagalan terencana adalah run mutasi (2 fail) yang justru membuktikan test mendeteksi hilangnya margin. Run sebelumnya yang menunjukkan 21/77 gagal pada CP1-A disebabkan dokumen sisa emulator (sudah diperbaiki `clearFirestore()`), bukan rules.

#### 6. Regression test (12 skenario wajib → tes nyata)
| # | Skenario | Tes |
|---|---|---|
| 1 | Owner valid + 1 member + expiry valid → ALLOW | `CP-INVITE: owner ruang 1 anggota boleh membuat invite (nama ruang apa adanya)` ✅; unit `kedaluwarsa memakai basis waktu server…` ✅ |
| 2 | Clock-skew realistis tidak gagal | `CP-INVITE: expiresAt dari jam perangkat yang lebih cepat dari server ditolak; payload bermargin lolos` — perilaku lama (+1 menit) **DENY**, payload server (−5 menit) **ALLOW**, fallback (−60 menit) **ALLOW**; unit matrix skew 0/1s/5m/55m ✅ |
| 3 | Ruang 2 anggota → DENY | `CP-INVITE: ruang penuh / non-member / anonim…` — `space_penuh` (zoe) DENY **+ isolasi** alice (anggota `space1`, semua syarat lain cocok) DENY → satu-satunya penolak `memberIds.size() == 1` ✅ |
| 4 | Non-member → DENY | idem — carol pada `space_unik` DENY ✅ |
| 5 | Anonymous → DENY | idem — `anon` DENY ✅ |
| 6 | `createdBy` = owner | `CP-INVITE: createdBy harus pembuatnya & invite tidak boleh dibuat sudah terpakai` — `createdBy: 'ivan'` DENY ✅ |
| 7 | `used = false` saat dibuat | idem — `used: true` (+`usedBy`/`usedAt`) DENY ✅ |
| 8 | Dokumen tetap di `invites/{code}` | `CP-INVITE: dokumen invite wajib berada di invites/{code} yang cocok` — `code` ≠ id dokumen DENY ✅ |
| 9 | `spaceName` tidak mismatch karena transformasi | `CP-INVITE: nama ruang harus sama persis dengan dokumen ruang` — versi "dirapikan" & "dipotong" DENY, nama 75 karakter DENY (verbatim & terpotong); unit `nama ruang dikirim apa adanya` ✅ |
| 10 | `space` null/loading → disabled | unit `kesiapan tombol…`: `space:null`, `space:undefined`, `memberIds:[]`, `spaceId:null` → `ready:false` ✅ |
| 11 | `pending`/generating → disabled | unit idem: `pending:true` → `loading`; `generating:true` → `generating` ✅ |
| 12 | Alur join tetap bekerja | `CP-INVITE: invite yang baru dibuat tetap bisa dipakai join (regresi)` — create ALLOW, batch join (memberIds + `_joinCode` + `used=true`) ALLOW, profil partner tertaat, replay DENY ✅; tes join lama (dave/frank/grace) tetap lulus |

Tidak ada tes lama yang dihapus: 91 = 84 (CP1-A) + 7 blok baru.

#### 7. Firestore Rules — DIPERTAHANKAN (tidak diubah)
- **`firestore.rules` TIDAK diubah untuk fix ini.** Bukti: `git diff --numstat -- firestore.rules` = `164 11` dan **0 baris** perubahan yang menyentuh `invite`/`expiresAt` — seluruh diff berasal dari CP1-A (bagian `questions`). Plafon 24 jam, `verified()`, `isMemberOf`, `createdBy == uid`, `used == false`, kesamaan `spaceName`, `memberIds.size() == 1`, `code == id dokumen`, dan `allow delete: if false` tetap persis seperti semula.
- `INVITE_TTL_MS` di `src/lib/constants.js` juga tetap **24 jam** (tidak diturunkan jadi 23 jam); margin ditempatkan sebagai pengurang kecil di helper client sehingga selalu `expiresAt < request.time + 24h`.
- Sebelum: `test:rules` 84/84 (CP1-A) → Sesudah: **91/91** (84 CP1-A tidak berubah + 7 blok CP-INVITE).

#### 8. Build / verifikasi lain / konfigurasi produksi
- `npm run build` ✅ **PASS** (6.61s, 0 error) + `postbuild` membuat `dist/404.html`. Warning `Some chunks are larger than 500 kB` (bundle ≈1.295 kB) **pre-existing** — muncul juga pada build CP1-A dan build sebelumnya, bukan akibat perubahan fix ini.
- Konfigurasi diperiksa (tanpa perubahan): `.firebaserc` alias `belajar-bersama` → `belajar-bersama-prod`; `.env.production.local` → `VITE_FIREBASE_PROJECT_ID=belajar-bersama-prod`, `VITE_USE_EMULATORS=false` (konsisten). `.github/workflows/deploy-pages.yml` hanya build + deploy GitHub Pages, **tidak** men-deploy `firestore.rules`.
- Karena rules tidak diubah, **deploy rules TIDAK diperlukan** untuk fix ini; yang perlu di-deploy hanya frontend (GitHub Pages) setelah commit. Pemeriksaan rules produksi vs repo tetap disarankan untuk perubahan rules berikutnya (`firebase deploy --only firestore:rules --project belajar-bersama-prod`) — itu pekerjaan ops, bukan bagian fix.
- `npm run test:privacy:e2e` **belum dijalankan** (butuh dev server + headless Chrome + emulator persisten berjalan); dicatat sebagai sisa verifikasi.

#### 9. Final status
- **Root cause final:** `generateInvite()` menghitung `expiresAt` dari **jam perangkat** persis sebesar plafon rule (`request.time + 24 jam`) → margin nol → deny `permission-denied` di perangkat yang jamnya lebih cepat dari jam server (hanya terlihat di produksi, tidak pernah di emulator). Diperkuat oleh dua cacat sekunder: `spaceName` ditransformasi di client (rawan beda dari dokumen) dan tombol aktif saat `space` masih `null` (menyebabkan deny `memberIds.size() == 1`).
- **File diubah (fix invite):** `src/features/space/utils/invite.js` (baru), `src/features/space/services/spaceService.js`, `src/features/space/components/InviteCard.jsx`, `src/features/settings/components/SettingsPage.jsx`, `tests/invite.test.mjs` (baru), `tests/firestore.rules.test.js` (seed + 7 blok), `package.json` (script), `docs/PROGRESS.md` (entri ini).
- **File TIDAK diubah:** `firestore.rules`, `src/lib/constants.js` (TTL tetap 24 jam), `src/app/router.jsx`, `src/app/layout/navConfig.js`, Question Bank / `src/features/questions/**`, `grading.js`, `quiz`, semua konfigurasi deploy.
- **Hasil test:** `test:invite` 7/7 ✅ · `test:units` 41/41 ✅ · `test:rules` **91/91** ✅ (exit 0, `[FAIL]` 0) · mutasi margin→0 terdeteksi 2 fail (bukti non-vakum, sudah dikembalikan) · `npm run build` ✅.
- **Status CP1-A:** aman — 84 tes CP1-A tetap lulus utuh dalam run 91/91 dan tidak ada rules questions yang disentuh.
- **Status fix invite (kode):** selesai di kode + unit + rules; **verifikasi produksi BELUM dilakukan** (environment ini tidak punya akses browser/device produksi). Belum dapat mengklaim "fixed di produksi" hanya berdasarkan emulator.
- **Sisa:** (1) uji manual di produksi setelah deploy: owner → Settings → Buat kode → kode tampil, dan partner → masukkan kode → `memberIds` bertambah → `users/{partnerUid}.spaceId` terisi → SpaceGate lolos; (2) `npm run test:privacy:e2e`; (3) commit (tidak dilakukan sesuai aturan AGENTS.md kecuali diminta).

## CP0 — Space Management / Leave Space

### Audit (kondisi sebelum perubahan — sumber: kode aktual, bukan dokumen)
- Dibaca: `docs/ONBOARDING-AI.md` §2–3, `docs/PROGRESS.md`, `firestore.rules`, `src/features/space/**` (`spaceService`, `SpaceContext`, `useSpace`, `OnboardingScreen`, `InviteCard`), `src/app/router.jsx` (`SpaceGate`), `SettingsPage`, `useProfile`, `authService`, seed + seluruh tes space/invite di `tests/firestore.rules.test.js`. `git status` **bersih** — pekerjaan sebelumnya (CP1-A + fix invite) sudah ter-commit (`64043ba`).
- **Cara join bekerja**: OnboardingScreen → `joinSpaceByCode()` → baca `invites/{code}` → `recoverSpaceLink()` → **batch** `spaces/{id}` (`memberIds = [createdBy, uid]` + `_joinCode`) & `invites/{code}` (`used/usedBy/usedAt`) → **setelah batch** `updateDoc(users/{uid}.spaceId)` (urutan terpisah; pelajaran batch-lama yang terekam di PROGRESS).
- **Owner ditentukan**: tidak ada field — pemilik = `memberIds[0]` (`spaceRoles` index 0 = `isOwner`; rules `canJoin` memakai `inv.createdBy == oldM[0]`).
- **`memberIds`**: `spaces/{spaceId}.memberIds` — list uid, maksimal 2, unik (`validSpace`).
- **`users/{uid}.spaceId`**: tautan profil; dikonsumsi `SpaceGate` (Onboarding vs AppShell), `ownsSpaceLink` (rules get space), `recoverSpaceLink`.
- **Fungsi leave/remove/transfer**: **TIDAK ADA** (grep seluruh `src/` hanya menemukan tombol *Keluar* = `signOutCurrent`).
- **Rule yang mengatur `memberIds`**: `spaces.update` = `isMemberOf && spaceMemberUpdateOk()` (hanya `name` / hapus `_joinCode`) **atau** `canJoin` (non-anggota, 1→2, wajib invite). `users.spaceId → null` hanya diizinkan bila dokumen ruang hilang.

### Root cause / existing limitation
- Partner **tidak bisa keluar sama sekali**: kedua langkah yang dibutuhkan ditolak rules — perubahan `memberIds` oleh anggota tidak punya jalur, dan `spaceId → null` ditolak selama dokumen ruang masih ada.
- Tidak ada aksi/UI leave apa pun (menyelesaikan masalah dengan menghapus tombol ≠ state transition).

### Architecture decision
1. **Ditegakkan di rules, bukan cuma UI** — `partnerLeaveOk()`: hanya anggota **indeks 1** (bukan pemilik) boleh mengurangi `memberIds` 2→1 dengan post-state persis `[pemilik lama]`; hanya field `memberIds` yang boleh berubah (`mergedOnly`); bentuk array diverifikasi ulang lewat `validSpace`. Client tidak dipercaya.
2. **Atomic** — satu `writeBatch` untuk `memberIds` + `users/{uid}.spaceId → null`. Aturan profil memakai `existsAfter`/`getAfter` sehingga melihat keadaan ruang **setelah** batch (pola `getAfter` sudah teruji di `validParent` sejak CP1) — itulah alasan rules boleh diubah kecil-kecilan tanpa melemahkan security.
3. **Idempoten / anti-race** — leave kedua kali, dua tab, dan retry jaringan: rules menolak batch kedua (anggota sudah 1), service menangkap `permission-denied`, membaca ulang, lalu cukup melepas tautan profil (no-op bila sudah null). `recoverSpaceLink` kini **melepas tautan** bila sudah bukan anggota (sebelumnya melempar `"Profil tertaut ke ruang yang tidak bisa diakses"` → user terkunci dan tidak bisa join ulang).
4. **Owner** — simple leave disembunyikan + penjelasan jelas; transfer kepemilikan & hapus ruang **sengaja TIDAK** diimplementasikan di CP0 (sesuai spec).
5. **State setelah leave** — `users/{uid}.spaceId = null` → `SpaceGate` (subscribe live) langsung merender `OnboardingScreen` menggantikan `<Outlet/>`, sehingga `SpaceProvider` + seluruh listener ruang lama unmount (tidak ada UI/listener basi); `navigate('/dashboard', {replace:true})` hanya menormalkan URL — tanpa `<Navigate>` melingkar.
6. **Tanpa struktur data baru** (spec §2): `users/{uid}.spaceId`, `spaces/{spaceId}.memberIds` dipertahankan persis.

### Files changed
| File | Perubahan |
|---|---|
| `firestore.rules` | + `partnerLeaveOk(spaceId)` (disambungkan ke `allow update` spaces sebagai opsi ketiga) dan `unlinkAfter(oldSpaceId)` (cabang baru `spaceIdChangeOk`) |
| `src/features/space/services/spaceService.js` | + `leaveSpace(spaceId)` (batch atomik, guard owner, idempoten); `recoverSpaceLink` melepas tautan saat bukan anggota |
| `src/features/space/utils/leave.js` (baru) | Helper murni: `leaveEligibility`, `nextMemberIds`, `AFTER_LEAVE_ROUTE`, `LEAVE_CONSEQUENCES` |
| `src/features/settings/components/SettingsPage.jsx` | Aksi **Keluar dari Ruang** (partner) + modal konfirmasi 3 poin; info khusus owner; state `leaveOpen/leaving` + `doLeave()` |
| `tests/leave.test.mjs` (baru) | 6 unit test: eligibility owner/partner/not-ready, `nextMemberIds`, tujuan state, 3 konsekuensi modal |
| `package.json` | + `test:leave`; `test:units` menyertakan `tests/leave.test.mjs` |
| `tests/firestore.rules.test.js` | + fixture `spaces/space_leave` (lina owner, budi partner) + note shared + 8 blok `CP0:` |
| `docs/PROGRESS.md` | Entri CP0 ini |

### Schema impact
- **Tidak ada** perubahan struktur/tipe data; field & path identik. `memberIds` tetap 1..2 anggota (`validSpace` tidak diubah), ruang tidak pernah dihapus, `spaceId` tetap string|null.

### Rules impact (detaill, apa yang menutup serangan mana)
- `partnerLeaveOk` MENUTUP: non-anggota/anonim mengubah `memberIds` (wajib `isMember`), partner menghapus pemilik / menambah anggota / menukar urutan / mengosongkan array (post-state `size==1 && newM[0]==oldM[0]` + `validSpace`), partner keluar sambil mengubah `name`/`_joinCode` (`mergedOnly(['memberIds'])`).
- `unlinkAfter` MENUTUP: memindahkan profil ke ruang lain (cabang ini hanya boleh `d.spaceId == null`), melepas tautan selagi masih anggota (ruang post-state masih memuat uid → ditolak). Cabang lama `!exists(...)` tetap utuh.
- Tidak diubah: `verified()`, `spaceMemberUpdateOk`, `canJoin`, `validSpace`, seluruh cek invite, dan semua rule lain.

### 2026-09-26 — CP0: verifikasi final (SELESAI)

**Test results (final):**

| Test Suite | Command | Result |
|---|---|---|
| Unit leave | `npm run test:leave` | **6/6 PASS** |
| All units | `npm run test:units` | **47/47 PASS** (41 original + 6 leave) |
| Firestore Rules | `npm run test:rules` | **99/99 PASS** (exit 0) |
| Production build | `npm run build` | **PASS** (6.65s, `dist/404.html` created) |

**Definition of Done — CP0:**
- [x] Partner dapat keluar (leaveSpace + batch atomik)
- [x] Owner tidak dapat simple leave (tombol disembunyikan + error message jelas)
- [x] `user.spaceId` ter-reset ke null
- [x] `memberIds` konsisten (2→1, pemilik dipertahankan)
- [x] Space tidak terhapus
- [x] Shared content tetap aman & hanya owner yang akses
- [x] Redirect benar → OnboardingScreen via SpaceGate live listener
- [x] Rules aman: `partnerLeaveOk` + `unlinkAfter` mencegah bypass
- [x] Rules tests PASS (99/99)
- [x] Unit tests PASS (47/47)
- [x] Invite tests PASS (7/7)
- [x] Build PASS
- [x] docs/PROGRESS.md diperbarui

**Known limitations:**
- Transfer ownership / delete space belum diimplementasikan (sesuai spec CP0)
- `npm run test:privacy:e2e` belum dijalankan (butuh emulator + headless Chrome; dicatat di sisa)

---

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
