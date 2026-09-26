# Onboarding untuk AI — Struktur & Cara Kerja Aplikasi

Dokumen ini untuk AI (atau developer) yang **baru melihat kode** `learning-app`. Isinya: apa yang terjadi saat aplikasi jalan, keputusan arsitektur, dan fungsi **setiap file**. Aplikasi bernama **Belajar Bersama**. Baca `docs/PROGRESS.md` untuk status dan `docs/ROADMAP-AI.md` untuk tahapan lanjutan.

---

## 1. Apa aplikasi ini

**Belajar Bersama** — ekosistem belajar **privat untuk tepat dua orang** (kamu + satu partner). Prinsip utamanya:

- Seluruh materi (roadmap topik, notes, resources) hidup **di dalam satu `spaces/{spaceId}`**.
- Akses dikunci **keanggotaan space** (Firestore Rules deny-by-default); anggota ketiga tidak bisa masuk.
- Email wajib **terverifikasi** sebelum membuat/bergabung ruang.

Stack: **React 18 + Vite 5 + Tailwind 3 + Firebase (Auth + Firestore)**. Saat ini dalam **Fase 1 / Spark plan**, dikembangkan **emulator-first** (semua berjalan di `localhost`, belum ada deploy).

## 2. Cara menjalankan

```bash
# Terminal 1 — emulator (butuh Java; Temurin/JRE 21 sudah di PATH user)
npx firebase emulators:start --import .firebase/emulator-export --export-on-exit
# Persistensi: data (Firestore + Auth) disimpan ke .firebase/emulator-export
# saat emulator dihentikan secara graceful (tekan Ctrl+C) dan dimuat ulang
# saat dinyalakan. Jangan kill paksa/Stop-Process bila ingin perubahan tersimpan.
# Jangan menjalankan instance kedua saat satu sudah hidup (port 9099/8080 bentrok).
# jangan lupa refresh PATH di terminal baru:
#  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

# Terminal 2 — app
npm run dev            # http://localhost:5173

# Tes Firestore Rules (HARUS emulator Firestore :8080 MATI dulu, port bentrok)
npm run test:rules
```

Catatan penting: **tidak ada koneksi internet** di lingkungan dev saat ini. Google Fonts gagal dimuat → app memakai **font sistem fallback** (serif → Georgia, sans → system-ui, mono → Consolas). Jangan sesali ini sebagai bug; rantai `font-family` sudah menyertakan fallback. Firebase tetap jalan karena emulator ada di `localhost`.

## 3. Alur runtime (apa yang terjadi)

`main.jsx` → `App` (ThemeProvider → ToastProvider) → `router` (`Gate`). Gate adalah mesin alur sesi:

```
Gate (useAuthState)
 ├─ making sure: ensureProfile(user.uid) dibuat bila belum ada
 ├─ user null / initializing → SplashScreen
 ├─ user null           → AuthScreen      (login/daftar)
 ├─ !user.emailVerified → VerifyScreen    (cek email + tombol dev-verify di emulator)
 └─ user terverifikasi  → SpaceGate
                           ├─ profil.spaceId null → OnboardingScreen (buat/join ruang)
                           └─ profil.spaceId ada  → AppShell          (halaman ruang)
```

Setiap layar berkomunikasi dengan Firestore lewat **service layer** (`features/*/services`) dan **hook subscribe** (`useSpace`, `useUserProfile`, `useProfile`) memakai `onSnapshot` (live).

## 4. Keputusan arsitektur kunci

1. **Emulator-first, env placeholder.** `src/lib/firebase.js` membaca `VITE_*`. Tanpa API key asli (placeholder dimulai `ISI`) ia memakai config dummy `emulator-only-key`; lalu `connectAuthEmulator`/`connectFirestoreEmulator` aktif **hanya jika `VITE_USE_EMULATORS=true`**. Tanpa flag itu app tidak bisa terhubung ke mana pun — jadi untuk dev wajib `VITE_USE_EMULATORS=true`.
2. **Persistensi offline diaktifkan**: `persistentLocalCache` + `persistentMultipleTabManager` (Firestore web v9) di **produksi**. Di emulator data intinya di memori emulator; **sejak 2026-09-25 emulator dijalankan dengan `--import .firebase/emulator-export --export-on-exit`** sehingga data bertahan antar-restart (simpan via Ctrl+C graceful).
3. **Profil `users/{uid}` wajib ada lebih dulu** sebelum batch create/join space (lihat gotcha §7.5).
4. **Verifikasi email** dicek lewat klaim token (`request.auth.token.email_verified`), bukan field. Setelah verified, client wajib `getIdToken(true)` agar klaim ikut ter-refresh.
5. **Batch atomik** dipakai untuk multi-write yang tidak bergantung pada dokumen yang baru ditulis dalam batch (mis. update profil + space saat join). Pembuatan/link profil space sengaja dipisah menjadi operasi berurutan karena emulator/rules tidak melihat tulisan batch yang baru.
6. **Soft-delete untuk konten** (`deletedAt`) — dipakai Notes dan Resources; owner melihat trash, partner tidak.
7. **Design system "buku catatan/jurnal"** — lihat §6.

## 5. Struktur direktori + fungsi tiap file

```
learning-app/
├─ index.html                 # mount root; link Google Fonts (jika online); <!--CSP--> diganti vite.config
├─ package.json               # scripts: dev / build / preview / test:rules / emulators; deps & versi
├─ vite.config.js             # react plugin + CSP <meta> (dev: izinkan localhost & emulator)
├─ tailwind.config.js         # mapping warna/radius/font ke CSS var; hanya punya semantic token
├─ postcss.config.js          # tailwind + autoprefixer
├─ firebase.json              # emulator: auth :9099, firestore :8080, singleProjectMode; hosting → dist
├─ firestore.rules            # INTI KEAMANAN: deny-by-default (lihat §7)
├─ firestore.indexes.json     # indeks gabungan (topics, notes, resources)
├─ .firebaserc                # default project: demo-learning-berdua
├─ docs/
│  ├─ checkpoint-1.md         # laporan CP1 (lama, status rules & checklist manual)
│  ├─ ONBOARDING-AI.md        # dokumen ini
│  ├─ PROGRESS.md             # riwayat & status pekerjaan
│  └─ ROADMAP-AI.md           # tahapan yang harus diikuti AI berikutnya
├─ tests/
│  ├─ firestore.rules.test.js # 43 tes aturan keamanan (emulator); dijalankan via npm run test:rules
│  └─ verify-resources.mjs  # probe payload resource/visibility/status/delete di emulator
└─ src/
   ├─ main.jsx                # init App Check (dilewati emulator), render <App/> di React.StrictMode
   ├─ index.css               # SEMUA design token + base + komponen CSS (.card, .section-title, .icon-btn)
   ├─ app/
   │  ├─ App.jsx              # komposisi provider: ThemeProvider > ToastProvider > Routes
   │  ├─ providers.jsx        # ThemeProvider: tema 'dark'/'light' via html.dark + [data-theme]; localStorage 'lb:theme'
│  ├─ router.jsx           # Gate + SpaceGate (alur sesi, §3); BrowserRouter

   │  └─ layout/
   │     └─ AppShell.jsx      # Halaman utama ruang: topbar solid, hero serif + batang progres,
   │                          #   daftar anggota jurnal, Undangan, Privasi, menu "Segera hadir"
   ├─ lib/
   │  ├─ firebase.js          # init app/auth/db, konek emulator saat USE_EMULATORS, App Check
   │  └─ constants.js         # SCHEMA_VERSION, path koleksi, enumerasi status/difficulties, dll.
   ├─ shared/
   │  ├─ ui/                  # komponen kecil (BOXMEN BORDER TIPIS):
   │  │  ├─ Button.jsx        #   primary (invers solid bg-ink/text-bg), ghost, danger, subtle; radius 6
   │  │  ├─ Input.jsx         #   field + label eyebrow mono; min-height 44 (touch target)
   │  │  ├─ Badge.jsx         #   chip pill: tone ok/warn/accent/dim (border-tinted, mono uppercase)
   │  │  ├─ Modal.jsx         #   dialog kecil boxed (radius 8)
   │  │  ├─ EmptyState.jsx    #   placeholder dashed, tanpa background
   │  ├─ components/
   │  │  ├─ Avatar.jsx        #   lingkaran inisial + warna; font head (serif)
   │  │  ├─ Spinner.jsx       #   ring spinner (border-t-accent)
   │  │  ├─ SplashScreen.jsx  #   loading layar penuh (wordmark serif + spinner)
   │  │  └─ ToastProvider.jsx #   toast bottom-center (konteks + useToast)
   │  ├─ hooks/
   │  │  └─ useOnlineStatus.js# navigator.onLine + listener online/offline
   │  └─ utils/
   │     ├─ errors.js         # toErrorMessage: map kode error -> pesan Bahasa Indonesia ramah
   │     ├─ identity.js       # warna deterministik per uid, inisial, displayName dari email
   │     ├─ time.js           # fmtDateTime/fmtDate/timeAgo/isExpired (id-ID)
   │     └─ validate.js       # isHttpUrl, normalizeTags, cleanupInviteCode (validasi UX; keamanan di rules)
   └─ features/
      ├─ auth/
      │  ├─ services/authService.js  # signUp/signIn/Google/reset/resend/signOut; ensureProfile (idempoten); updateProfile
      │  ├─ hooks/
      │  │  ├─ useAuthState.js       # onAuthStateChanged + refresh (untuk token force-refresh)
      │  │  └─ useProfile.js         # subscribe users/{uid} (live)
      │  └─ components/
      │     ├─ AuthScreen.jsx        # tab Masuk/Daftar (underline), form, Google (disembunyikan di emulator)
      │     └─ VerifyScreen.jsx      # "cek email"; interval reload+getIdToken(true); dev-verify REST emulator
      └─ space/
         ├─ services/spaceService.js # buat/link ruang berurutan, rename, undangan, spaceRoles
         ├─ hooks/
         │  ├─ useSpace.js           # subscribe spaces/{id} (+ status pending write)
         │  └─ useUserProfile.js     # subscribe profil siapa pun (diri/partner)
         └─ components/
             ├─ OnboardingScreen.jsx  # "bangun ruang": tab Buat/Gabung + tombol Keluar
             └─ InviteCard.jsx        # buat/salin kode undangan sekali pakai
       ├─ roadmap/
       │  ├─ services/topicService.js # CRUD topik, urutan, cascade, template
       │  ├─ hooks/useTopics.js       # live snapshot topik
       │  └─ components/              # RoadmapPage, TopicDetailPage, TopicFormModal, dll.
       ├─ notes/
       │  ├─ services/noteService.js  # CRUD note + state, soft-delete, purge
       │  ├─ hooks/                   # useNotes, useNoteStates
       │  └─ components/              # editor, NoteCard, NotesPanel
       ├─ resources/
       │  ├─ services/resourceService.js # CRUD resource + state, validasi payload
       │  ├─ hooks/                   # useResources, useResourceStates
       │  ├─ utils/visibility.js     # filter private/deleted sebelum render/search
       │  └─ components/              # ResourceCard, ResourcesPanel, ResourceFormModal
       └─ search/
          ├─ utils/buildSearchRecords.js # index aman + tag counts
          ├─ hooks/useGlobalSearch.js    # Fuse.js, filter tag, loading/error
          └─ components/GlobalSearchDialog.jsx

```

## 6. Design system "buku catatan" (wajib dipatuhi AI berikutnya)

- **Dua tingkat "kotak"**:
  - *Elemen kecil* (tombol, input, chip, badge) → border tipis + radius **6px** (`--radius-sm`).
  - *Elemen konten besar* (hero, daftar anggota, privasi, dsb.) → **tanpa background/kotak**, hanya `border-bottom: 1px solid var(--border)`, radius 0 (kelas `.card`).
  - Jangan menambah kartu kotak untuk elemen besar dan jangan menambahkan gradien/glow.
- **Kartu konten bersalut penuh (bg + border + shadow) hanya untuk achievement** — itulah satu-satunya "kotak penuh" di layar konten.
  - **Pengecualian: overlay.** Panel `Modal` dan `Toast` boleh (dan harus) memakai `bg-panel` + `border` + `shadow-card` + radius token, karena mengambang di atas halaman. Yang wajib di-flatten adalah permukaan **konten**, bukan lapisan atas.
- **Radius heatmap/grid** memakai token kecil (`rounded-smc` = 6px), bukan angka bebas seperti `rounded-[2px]`.
- **Token di `src/index.css`**; Tailwind memetakannya (todo `src/tailwind.config.js`): `bg, bg2, panel, panel2, ink, dim, dimmer, line, linestrong, accent, ok, warn`.
  - arti: `accent`=terracotta (aksi/aktif), `ok`=hijau zaitun (berhasil/status siap), `warn`=mustard (peringatan/wajib/dasar).
- **Tipografi**: heading & angka besar = **serif** (`font-head`, Newsreader/Georgia); body = sans Instrument Sans/system-ui; label/datum kecil = **mono uppercase** (`font-mono`, `.eyebrow`, `.section-title`), letter-spacing lebar.
- **Jangan pakai opacity modifier Tailwind** (`bg-ink/10`) pada warna var-hex — tidak valid; untuk tint pakai `bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]`.

## 7. Firestore Rules — pola yang wajib dipahami

- **Deny-by-default**: `match /{document=**}` → `allow read, write: if false;`, lalu tiap path dibuka eksplisit.
- Helper kunci: `signedIn()`, `verified()` (klaim email), `isMemberOf(spaceId)`/`isMember(spaceId)`, `immutable(fields)` (via `changed().hasAny(fields)`), `mergedOnly(fields)`.
- Koleksi: `users` (root), `spaces` (root), `invites/{code}` (root), dan subkoleksi space: `topics`, `notes`, `noteStates/{noteId_uid}`, `resources`, `resourceStates/{resourceId_uid}`.
- **Struktur kontra-intuitif**: `match /spaces/{spaceId}` **ditutup di bloknya sendiri**; subkoleksi adalah `match` sibling terpisah. Helper TIDAK boleh membaca variabel wildcard induk (`spaceId`) → **selalu lewatkan sebagai parameter**.
- Konsekuensi penting yang mudah lupa:
  1. **Tidak ada lambda/`=>`**, **tidak ada `List.all()`** — gunakan `toSet().size()`.
  2. `not in` invalid → `!('k' in ...)`.
  3. `duration(24,'h')` invalid → `duration.value(24,'h')`.
  4. `list.hasAny(set)` invalid → `set.hasAny(list)`.
  5. `get(path).exists` **rusak di emulator v1.19.8** → pakai fungsi `exists(path)` + `get(path).data`. (Berlaku juga benar di produksi.)
  6. Update doc yang **belum ada**: `request.resource.data` hanya berisi field yang ditulis → validasi `validUser` gagal "displayName is undefined". Solusi: profil dijamin ada lebih dulu (client `ensureProfile`) + aturan dipagari `resource.data is map`.

## 8. Konvensi

- Semua teks UI & komentar kode **berbahasa Indonesia**.
- Konektor Firebase pitfall umum (error message, formato) ada di `src/shared/utils/errors.js`.
- Jangan commit tanpa diminta. Jalankan `npm run build` setelah tiap perubahan; jalankan `npm run test:rules` setelah menyentuh `firestore.rules`.
- `test:rules` bentrok dengan emulator yang sedang berjalan (port :8080) — emulator harus dimatikan dulu.
