# Dynamic Island (Windows)

Aplikasi overlay simpel ala Dynamic Island buat Windows 10/11. Posisinya ngumpet di bagian paling atas layar, jadi nggak ganggu tab browser dan baru nongol pas kursor diarahkan ke atas.

## Fitur Terbaru (v2.1.0)
- **Live Mini Synced Lyrics (1-per-1) Saat Idle**: Saat lagu Spotify sedang berjalan dan kursor tidak menyentuh Dynamic Island, lirik lagu otomatis tampil bergantian 1 per 1 di kapsul mini bagian atas layar.
- **Hands-Free *"Hei Jarvis"* Wake-Word**: Panggil *"Hei Jarvis"* langsung dengan suara kapan saja tanpa harus klik atau tekan `Ctrl + 0`.
- **Desain Nusa 1.1 × Cyberpunk Compact Notch**: Kapsul kaca *obsidian* ringkas (`556×236px`) dengan navigasi *Bottom Hover Dock* dan penutupan instan saat kursor menjauh.
- **Auto Micro-Notch di Browser**: Otomatis mengecil menjadi kapsul mini (`252×26px`) saat sedang aktif membuka browser/Google agar tidak menghalangi tab.
- **Apple-Style System Rings & Kalender Reminder**: Indikator lingkaran untuk **Baterai Laptop, Wi-Fi, & Baterai Bluetooth**, ditambah tanggal kalender interaktif (`M T W T F S S`) yang bisa diklik untuk membuat **Reminder & Checklist** harian.
- **Autonomous Jarvis (`Ctrl + 0` / *"Hei Jarvis"*) & Gemini AI**:
  - **Auto-Fill Google Form**: Isi Google Form otomatis sesuai instruksi lengkap dengan *Preview* sebelum *Submit*.
  - **Kendali Tab Browser**: Buka link, pindah tab, refresh, tutup tab, dan baca isi halaman aktif.
  - **VS Code Assistant**: Perbaiki error kode otomatis di project lokal dan buka langsung barisnya di VS Code.
- **Spotify & Lirik**: Kontrol musik (play/pause/next/prev) + lirik lagu jalan otomatis (*synced lyrics*).
- **Drag & Drop Shortcut & Shelf (Stash)**: Drag & drop aplikasi/folder/file ke **Today** untuk membuat shortcut cepat, atau ke **Shelf** untuk menyimpan file sementara dan riwayat *clipboard*.
- **Clock Tools**: Timer, Stopwatch, dan Alarm 24 jam.

## Cara Pakai (Tanpa Ngoding)
Langsung download file `.exe` di halaman **[Releases](https://github.com/pramaJavanicus/Dynamic_Island_gwejh/releases/latest)**:
1. Pilih **`Dynamic.Island.Setup.2.1.0.exe`** (versi installer) atau **`Dynamic.Island.2.1.0.exe`** (versi portable langsung jalan tanpa install).
2. Kalau muncul info dari Windows SmartScreen, klik **More info** -> **Run anyway**.

## Jalankan dari Source Code
Kalau mau jalanin atau edit kodenya sendiri (butuh Node.js):

```bash
npm install
npm run dev
```

Buat build jadi file `.exe`:
```bash
npm run dist
```
