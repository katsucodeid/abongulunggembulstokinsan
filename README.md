# Abon Gulung Gembul — Stok Kertas (Offline)

Aplikasi stok lokal untuk satu perangkat Android. Backend Node.js berjalan di Termux dan hanya menerima koneksi dari perangkat yang sama melalui 127.0.0.1. Tidak memakai Render, Cloudflare Tunnel, Ngrok, VPS, atau server internet.

## Penyimpanan data

- Database utama: ~/abongulunggembulstokinsan/backend/data/data.json di ruang penyimpanan privat Termux.
- Salinan database teks: Download/Abon Gulung Gembul/database-stok.txt, diperbarui setiap kali database berubah.
- Laporan harian: Download/Abon Gulung Gembul/11november2026.txt, 12november2026.txt, dan seterusnya.
- Cadangan otomatis: file .txt dibuat sebelum pembaruan pertama dan sebelum setiap laporan harian baru.
- Laporan harian dibuat pada pukul 00.00 waktu lokal Android. Jika server tidak aktif saat tengah malam, laporan yang terlewat dibuat ketika server dinyalakan kembali.

Database utama tetap menggunakan JSON agar aman untuk transaksi dan pemulihan. File TXT di Download adalah salinan yang dapat dibaca dan arsip laporan; jangan mengedit database-stok.txt secara manual.

## Instalasi di Termux

    pkg update && pkg upgrade -y
    pkg install git nodejs-lts openssl -y
    cd ~/abongulunggembulstokinsan
    git fetch origin feature/online-hosting
    git checkout feature/online-hosting
    git pull origin feature/online-hosting
    bash scripts/install-termux.sh

Saat diminta, izinkan Termux mengakses file dan media. Jika dialog izin tidak muncul, jalankan termux-setup-storage.

## Menjalankan aplikasi

    bash ~/abongulunggembulstokinsan/scripts/start-termux.sh

Biarkan sesi Termux berjalan. Buka aplikasi Android Abon Gulung Gembul pada HP yang sama. Aplikasi mengakses backend lokal melalui http://127.0.0.1:8787.

Untuk browser HP yang sama, buka alamat tersebut. Perangkat lain tidak dapat mengakses server ini, walaupun berada pada Wi-Fi yang sama.

## Cadangan dan keamanan

- Jangan menghapus backend/data/data.json, .env, atau folder Download laporan.
- Jangan menjalankan dua server Node.js sekaligus.
- Simpan salinan cadangan di tempat lain secara berkala. Jika HP rusak atau hilang, file di Download pada HP itu ikut berisiko.
- File TXT database berisi data akun (hash password), transaksi, dan stok. Jaga privasi HP dan jangan membagikannya.
- Operasional aplikasi tidak memerlukan internet. Internet hanya dibutuhkan bila pengguna sengaja mengunduh kode/pembaruan dari GitHub.
