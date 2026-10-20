# Dynamic Island for Windows 🏝️

Overlay desktop bergaya **iOS Dynamic Island** untuk Windows 10/11 — dibangun dengan **Electron + React + Tailwind CSS v4 + Framer Motion**.

## ✨ Fitur Utama

| Modul | Detail |
|---|---|
| **Dynamic Island & Pin 📌** | Bersembunyi sebagai *top-lip* tipis (`7px`) di ujung atas layar agar tab browser tidak pernah terhalang, lalu membesar secara mulus (120fps spring) saat kursor diarahkan ke atas. Dilengkapi tombol **Pin (`📌`)** agar tetap terbuka saat bekerja. |
| **Live Peek & Kapsul Status** | Muncul otomatis setiap 30 detik (atau tetap tampil saat Timer berjalan) menampilkan **Suhu Laptop (`°C`)**, **Baterai Laptop (`%`)**, **Kecepatan Internet (`KB/s` / `MB/s`)**, **Baterai Perangkat Bluetooth (`%`)**, **Sisa Waktu Timer**, dan **Lagu yang Diputar**. |
| **Home, Google, Volume & Shortcut** | Pencarian cepat Google, pintasan Drive / Calendar / Gmail, **Slider Volume & Mute Cepat**, serta **Shortcut Permanen** (mendukung *drag & drop* folder, `.exe`, maupun `.lnk` lengkap dengan ikon asli Windows). |
| **Music & Live Synced Lyrics 🎵** | Terhubung otomatis ke **Spotify** (dan sesi media Windows/SMTC lainnya) tanpa API key: cover album, kontrol Play/Pause/Next/Prev, slider volume, serta **Lirik Lagu Real-Time (Karaoke Auto-Scroll)** via LRCLIB. |
| **Clock (Timer, Stopwatch, Alarm) ⏰** | **Timer** dengan preset cepat (1m–25m Fokus/Pomodoro), **Stopwatch** presisi milidetik dengan pencatat putaran (*Lap*), dan **Alarm** 24 jam dengan label & nada dering *chime* otomatis. |
| **Stash, Catatan Cepat & Clipboard 📋** | Rak penyimpanan file sementara (*drag-in* dari Explorer & *native drag-out* ke aplikasi lain), ditambah **Catatan Cepat (*Scratchpad*)** auto-save dan **Riwayat Clipboard** otomatis (menyimpan 10 teks terakhir yang di-*copy*). |

## 📂 Struktur Folder
```text
dynamic-island/
├── electron/
│   ├── main.cjs        # Overlay window, hit-test kursor, tray, IPC, clipboard watcher
│   ├── preload.cjs     # Jembatan API aman (contextBridge -> window.island)
│   ├── ps-bridge.cjs   # Komunikasi stdio JSON dengan proses PowerShell
│   ├── lyrics.cjs      # Pencarian & parsing lirik tersinkronisasi (LRCLIB)
│   ├── stash.cjs       # Penyimpanan file sementara (%TEMP%\DynamicIslandStash)
│   └── config.cjs      # Konfigurasi & ekstraksi ikon shortcut aplikasi/folder
├── resources/
│   ├── media.ps1       # Jembatan WinRT System Media Transport Controls (Spotify/Media)
│   ├── sysinfo.ps1     # Sensor Suhu, CPU, Baterai Bluetooth (CfgMgr32), CoreAudio Volume & Network Speed
│   └── icon.ico / .png # Ikon aplikasi & system tray
├── src/
│   ├── App.jsx         # State utama Dynamic Island & animasi pegas Framer Motion
│   ├── clockStore.js   # State Timer, Stopwatch, Alarm & Web Audio chime synthesizer
│   ├── hooks.js        # Custom hooks (Media, Lyrics, SysInfo, Stash, Clipboard, Battery)
│   └── components/     # ExpandedView, CompactView, PeekView, HomeTab, MediaTab, ClockTab, StashTab
├── Start-DynamicIsland.vbs # Peluncur background tanpa jendela konsol/terminal
└── package.json
```

## 🚀 Cara Menjalankan

```powershell
# 1. Masuk ke folder project & install dependencies
npm.cmd install

# 2. Jalankan dalam mode development
npm.cmd run dev

# 3. Atau build produksi & jalankan di background tanpa terminal
npx.cmd vite build
wscript.exe Start-DynamicIsland.vbs
```
