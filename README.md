# Dynamic Island (Windows)

Aplikasi overlay simpel ala Dynamic Island buat Windows 10/11. Posisinya ngumpet di bagian paling atas layar, jadi nggak ganggu tab browser dan baru nongol pas kursor diarahkan ke atas.

## Fitur
- **Status bar otomatis**: Tiap 30 detik nampilin suhu laptop, baterai laptop, baterai perangkat Bluetooth yang nyambung, sama kecepatan internet.
- **Perintah Suara (Jarvis) & Gemini AI**: Ada menu Gemini AI buat tanya jawab langsung, plus tombol mikrofon buat ngasih perintah suara (misal: *"buka Google Chrome dan buka Web WhatsApp"*, *"buka Spotify dan putar lagu ..."*, *"pasang timer 5 menit"*, *"buka kalkulator"*, dll).
- **Spotify & Lirik**: Kontrol musik (play/pause/next/prev) + lirik lagu jalan otomatis (synced lyrics).
- **Tombol Pin**: Biar Dynamic Island tetap kebuka waktu lagi ngerjain tugas/projek sambil baca lirik atau lihat timer.
- **Shortcut, Kalkulator & Volume**: Akses cepat ke Google Drive, Calendar, Gmail, dan Kalkulator Windows. Bisa drag & drop aplikasi (`.exe`/`.lnk`) atau folder favorit biar gampang dibuka, plus ada slider volume & tombol mute.
- **Clock**: Ada Timer, Stopwatch, sama Alarm. Kalau timer lagi jalan, sisa waktunya tetap kelihatan di kapsul kecil di atas layar.
- **Stash & Catatan**: Tempat naruh file sementara (bisa di-drag keluar lagi), catatan singkat (scratchpad), dan riwayat teks yang terakhir di-copy (clipboard).

## Cara Pakai (Tanpa Ngoding)
Langsung download file `.exe` di halaman **[Releases](https://github.com/pramaJavanicus/Dynamic_Island_gwejh/releases/latest)**:
1. Pilih **`Dynamic.Island.Setup.1.0.0.exe`** (versi installer) atau **`Dynamic.Island.Portable.1.0.0.exe`** (langsung jalan tanpa install).
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
