# Keamanan Belajar Bersama

## Model ancaman

Aplikasi ini menganggap browser, token client, dan semua nilai `VITE_*` sebagai tidak rahasia. Ancaman utama adalah akun tanpa login, akun yang belum memverifikasi email, anggota ketiga, akses lintas ruang, pembacaan materi private partner, manipulasi field immutable, XSS Markdown, dan penyalahgunaan invite.

## Kontrol yang diterapkan

- Firestore Rules dimulai dari deny-by-default dan memeriksa autentikasi, verifikasi email, keanggotaan space, ownership, enum, panjang payload, URL HTTP(S), serta field immutable.
- Space dibatasi dua `memberIds`; invite memakai kode acak kriptografis, kedaluwarsa, dan hanya sekali pakai.
- Notes/resources private dibatasi di Rules. Query UI memakai listener shared dan milik sendiri agar Rules dapat membuktikan privasi.
- Markdown diproses dengan `marked` lalu DOMPurify allowlist; tidak ada `innerHTML` mentah, iframe, event handler, atau protokol `data:`/`javascript:`.
- App Check memakai reCAPTCHA Enterprise di produksi bila site key dikonfigurasi; emulator melewati App Check.
- Router memakai `BrowserRouter` untuk URL bersih; hosting GitHub Pages membutuhkan fallback `404.html` untuk refresh deep-link.

## Konfigurasi Firebase Console

Aktifkan hanya provider Auth yang diperlukan, authorized domains untuk localhost dan domain GitHub Pages, Email Enumeration Protection, serta password policy minimal 10 karakter bila tersedia. Daftarkan domain pada App Check, mulai dari monitoring lalu aktifkan enforcement setelah traffic valid terverifikasi. Batasi API key berdasarkan HTTP referrer untuk domain deploy dan localhost. Jangan commit debug token App Check, credential, atau file `.env`.

## Privasi dan penghapusan

Export dilakukan lokal oleh browser dan hanya memakai data yang dapat dibaca akun aktif. Penghapusan akun dari client menghapus materi milik akun dan mencoba menghapus akun Auth; profil Firestore, ruang, dan data partner tidak dihapus karena Rules memang melarang penghapusan tersebut. Re-authentication mungkin diperlukan oleh Firebase untuk akun yang sudah lama aktif.

Tanpa Cloud Functions/Admin SDK, tidak ada penghapusan cascade server-side, scheduled cleanup global, audit log terpusat, atau pemulihan akun. Spark plan juga memiliki batas kuota dan tidak menyediakan jaminan backup/PITR; lakukan export manual berkala.

## Rotasi key dan verifikasi

Jika key pernah ter-commit, cabut/rotasi di Firebase Console, perbarui environment deploy, bersihkan riwayat repository sesuai prosedur organisasi, dan jangan menganggap API key frontend sebagai secret.

Verifikasi lokal yang wajib dijalankan: `npm run build`, `npm run test:units`, `npm run test:privacy:e2e`, dan `npm run test:rules` saat emulator Firestore port 8080 berhenti. Tes Rules mencakup unauthenticated access, privacy, invite, kapasitas space, immutable fields, enum, payload, dan soft-delete/restore.
