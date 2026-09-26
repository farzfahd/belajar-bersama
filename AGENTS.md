# AGENTS.md — Petunjuk untuk AI

Project: **Belajar Bersama** — ekosistem belajar privat untuk dua orang (React + Vite + Tailwind + Firebase emulator-first).

## Wajib dibaca sebelum bekerja
1. `docs/ONBOARDING-AI.md` — struktur, cara kerja, fungsi tiap file.
2. `docs/PROGRESS.md` — status & riwayat pekerjaan.
3. `docs/ROADMAP-AI.md` — tahapan yang harus diikuti (mulai lanjutkan dari CP2).

## Aturan ringkas
- Jangan commit/push kecuali diminta.
- Komentar kode dalam Bahasa Indonesia; tanpa komentar berlebih.
- Jalankan emulator dengan: `npx firebase emulators:start --import .firebase/emulator-export --export-on-exit` (persisten; hentikan via Ctrl+C agar data tersimpan — jangan kill paksa). Jangan start instance kedua saat satu sudah hidup (port bentrok).
- Setelah ubah kode: `npm run build`. Setelah ubah `firestore.rules`: `npm run test:rules` (harus saat emulator Firestore :8080 dimatikan — port bentrok).
- Desain wajib mengikuti tema "buku catatan": elemen besar di-flatten (border-bottom saja), kecil boxed radius 6px, tanpa gradien/glow; heading serif, label mono uppercase.
- Tidak ada internet: jangan andalkan CDN; font fallback sistem sudah ada.