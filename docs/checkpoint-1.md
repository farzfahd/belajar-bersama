# Checkpoint 1 — Fondasi Project, Auth, Space 2-User & Firestore Rules

Status: **SELESAI** — semua 32 tes emulator lulus.

## Tujuan Checkpoint 1
- Scaffolding React + Vite + Tailwind + Firebase (emulator-first).
- Auth email/password + Google, **verifikasi email wajib** untuk membuat/bergabung Space.
- Space 2 pengguna: owner membuat space, partner bergabung via undangan (kode) sekali pakai.
- Firestore Security Rules deny-by-default untuk seluruh data; diverifikasi lewat tes emulator.

## Cara Menjalankan
```bash
# 1. Pastikan Java (emulator Firestore memakai Java; Temurin 21):
java -version

# 2. Jalankan emulator + app (dua terminal)
npx firebase emulators:start
npm run dev

# 3. Tes aturan keamanan Firestore (di emulator)
npm run test:rules
```

## Struktur Proyek (File Dibuat/Diubah)
```
firebase.json                 # emulator auth :9099, firestore :8080, singleProjectMode
firestore.rules               # aturan keamanan deny-by-default (inti CP1)
firestore.indexes.json        # indeks (diisi bertahap sesuai kebutuhan query)
vite.config.js                # proxy API, CSP untuk dev; GitHub Pages base
postcss.config.js             # Tailwind
tailwind.config.js
package.json                  # scripts: dev / build / preview / test:rules
.env.example                  # placeholder ISI_* (emasulator)
.env.development.local        # placeholder dev

src/
  main.jsx / index.css
  app/
    App.jsx                   # useAuthState -> VerifyScreen -> SpaceGate
    providers.jsx             # ToastProvider + Providers
    router.jsx                # rute (login, onboarding, app)
    layout/AppShell.jsx       # kerangka aplikasi (dipakai sesudah join space)
  lib/
    firebase.js               # init app, konek emulator saat dev, guard placeholder env
    constants.js              # konstanta (topik, status, kode warna, dll)
  features/auth/
    services/authService.js   # register/login/google/logout/onAuthStateChanged
    hooks/useAuthState.js     # status login + syncing
    hooks/useProfile.js       # profil user aktif
    components/AuthScreen.jsx # form login/register
    components/VerifyScreen.jsx # layar "cek email" + tombol dev (emulator)
  features/space/
    services/spaceService.js  # createSpace, joinSpaceViaInvite (batch), fetchInvite...
    hooks/useSpace.js         # data space aktif (read berlangganan)
    hooks/useUserProfile.js   # profil + resolusi from Firebase → working copy
    components/OnboardingScreen.jsx # pilih buat/join space (CP1)
    components/InviteCard.jsx # detil undangan (kode, nama space, sisa waktu)
  shared/
    components/               # Avatar, Spinner, SplashScreen, ToastProvider
    hooks/useOnlineStatus.js  # deteksi offline
    ui/                       # Button, Input, Badge, Modal, EmptyState
    utils/                    # errors.js, identity.js, time.js, validate.js
tests/
  firestore.rules.test.js     # 32 tes aturan keamanan (emulator)
docs/checkpoint-1.md          # dokumen ini
```

## Ringkasan Firestore Rules (firestore.rules)
- `match /{document=**}` → deny semua di basis.
- Helper: `signedIn()`, `verified()` (email_verified), `isMemberOf(spaceId)` / `isMember(spaceId)`.
- `users/{uid}`: profil diedit pemilik saja; `spaceId` hanya bisa menunjuk space milik sendiri dan dicegah berpindah sembarangan; juga dicegah membuat space kalau sudah punya.
- `spaces/{spaceId}`:
  - create: harus terverifikasi, memberIds hanya diri sendiri, `userHasNoSpace()`.
  - update: (a) **anggota** mengedit — memberIds & createdAt immutable, `_joinCode` hanya boleh dihapus (tidak diisi ulang); (b) **non-anggota join via invite** — memberIds 1→2 (wajib berisi uid sendiri), invite valid & belum dipakai & belum kedaluwarsa. Inisialisasi `_joinCode` disuntikkan di update yang sama dengan join.
  - delete: selalu false.
- Collection bawaan space (topics, notes, noteStates, resources, resourceStates): **match terpisah** (sibling) di bawah rule yang sama — lihat catatan struktur di bawah.
  - notes: read anggota; private hanya untuk owner; soft-delete (`deletedAt`) hanya terlihat owner. Update/delete hanya owner; ownerId & createdAt immutable.
  - noteStates / resourceStates: `stateId = noteId_uid`; hanya pemilik yang bisa menulis, tidak bisa dibuat di note yang tidak terlihat.
  - topics/resources: CRUD dua anggota; createdBy/addedBy & createdAt immutable.
- `invites/{code}` di root: get untuk siapa pun terverifikasi, list false, create hanya anggota; update hanya flip `used=false→true` (sekali pakai). `expiresAt` dibatasi 24 jam via `request.time` (**satu-satunya pengecualian aturan tanpa request.time**, terdokumentasi di file).

## Temuan Penting (Emulator & Rules)
1. **Tidak ada lambda/`=>`** dan **tidak ada `List.all()`** di rules. Keunikan tag dicek via `list.toSet().size() == list.size()`; batas hanya count + keunikan, normalisasi per-item ditegakkan di client.
2. **`not in` tidak valid** → pakai `!('k' in ...)`.
3. **`duration(24,'h')` tidak valid** → `duration.value(24,'h')`.
4. **Bugs di Cloud Firestore Emulator v1.19.8** yang terverifikasi lewat probe:
   - `get(path).exists` rusak ("Property exists is undefined"). Gunakan **fungsi `exists(path)`** + **`get(path).data`** untuk isi. Pola ini juga benar di produksi.
   - Sebuah fungsi yang **mengacu langsung variabel wildcard induk** (mis. `spaceId`) yang dipanggil dari match anak menghasilkan null. Solusi yang dipakai: **selalu lewatkan spaceId sebagai parameter** ke fungsi helper (pola seragam seperti `isMemberOf(spaceId)`).
5. `@firebase/rules-unit-testing` 3.0.4: memanggil `ctx.firestore()` lebih dari sekali per context → "Firestore has already been started". Helper `fsDb(c)` di-memoize per context (WeakMap).
6. `withSecurityRulesDisabled`: callback menerima **function** `(ctx)`, instance Firestore = `ctx.firestore()`.
7. `list.hasAny(set)` tidak didukung → `changed().hasAny(fields)` (set.hasAny(list)).

## Catatan Struktur Rules (kontra-intuitif, jangan "dirombak")
Tampak menjorok seperti nested, tetapi `match /spaces/{spaceId} { ... }` **ditutup** di blok space itu sendiri, dan collection anak (topics/notes/noteStates/resources/resourceStates/invites) adalah **match terpisah**. Ini sah di Citadel rules menggunakan path pattern yang sama). Konsekuensi: variabel wildcard hanya bisa dipakai di match tempat ia terikat — itulah kenapa helper membutuhkan `spaceId` sebagai parameter. Jangan ubah menjadi nesting sungguhan tanpa menggeser helper.

## Checklist Uji Manual (Browser, emulator menyala)
1. `npx firebase emulators:start` + `npm run dev`.
2. **Register A** (email baru) → lihat layar "cek email". Klik tombol **dev verify** (khusus emulator, tidak muncul di produksi).
3. A **buat space** → halaman app.
4. Di tab lain, **Register B**, lalu klik **dev verify**.
5. A **buat invite** → salin kode → berikan ke B → B join space.
6. Ruang penuh: **Register C** → dev verify → coba buat space baru / join → ditolak.
7. A buat **note shared** dan **note private** → B hanya melihat note shared.
8. Refresh A & B → data tetap terbaca (persisten emulator).

## Yang Belum Di-Checkpoint (dikerjakan selanjutnya)
- UI dasbor isi (roadmap topik, daftar note, dll.) masih berupa AppShell kosong.
- onSubmit note/resources/topics dihubungkan penuh ke backend (CP2: fitur konten).
- XaaS deploy ke GitHub Pages (base URL & CSP prod, CP nanti).
- `npm audit` masih menampilkan 14 kerentanan dev-tooling — **tidak diblokir**, tunda ke CP7.