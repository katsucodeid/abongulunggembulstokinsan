# Abon Gulung Gembul — Stok Kertas (Server Termux, Multi-Device)

Satu HP Android milik pemilik menjalankan backend Node.js di Termux sebagai server utama. HP karyawan/pengguna lain cukup membuka aplikasi melalui browser atau memasang APK klien; mereka tidak perlu memasang Termux. Semua perangkat harus terhubung ke Wi-Fi atau hotspot yang sama. Tidak memakai VPS, Render, Cloudflare Tunnel, atau Ngrok untuk mode jaringan lokal.

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

Biarkan sesi Termux berjalan. Buka aplikasi Android Abon Gulung Gembul pada HP yang sama. Aplikasi pada HP server mengakses backend lokal melalui `http://127.0.0.1:8787`.

Untuk HP utama, buka `http://127.0.0.1:8787`. Untuk perangkat lain yang terhubung ke Wi-Fi/hotspot yang sama, lihat alamat LAN yang dicetak Termux saat server mulai, misalnya `http://192.168.1.20:8787`, lalu buka alamat itu di browser perangkat tersebut. Alamat IP dapat berubah ketika jaringan berganti.

Admin harus membuat akun masing-masing melalui fitur Pengguna. Login setiap perangkat menggunakan akun tersebut. Jangan membagikan akun admin. Semua perubahan tersimpan di database utama HP server. Jika HP utama, Termux, atau jaringan lokal mati, perangkat lain tidak dapat mengambil data terbaru; transaksi offline yang tersimpan di perangkat dapat menunggu koneksi untuk disinkronkan. Hindari mengedit stok yang sama secara bersamaan saat perangkat terputus dari server.

## Cadangan dan keamanan

- Jangan menghapus backend/data/data.json, .env, atau folder Download laporan.
- Jangan menjalankan dua server Node.js sekaligus.
- Simpan salinan cadangan di tempat lain secara berkala. Jika HP rusak atau hilang, file di Download pada HP itu ikut berisiko.
- File TXT database berisi data akun (hash password), transaksi, dan stok. Jaga privasi HP dan jangan membagikannya.
- Operasional aplikasi tidak memerlukan internet. Internet hanya dibutuhkan bila pengguna sengaja mengunduh kode/pembaruan dari GitHub.

## Navigasi dan pembaruan aplikasi

Navigasi dikelompokkan ke dalam bagian **Operasional** (Stok, Stok Datang, Target, Riwayat, Laporan, Stok Manual) dan **Pengaturan & Sistem** (Alarm Kerja, Pencadangan, Tentang & Pembaruan). Tekan judul kelompok untuk membuka atau menutup submenu. Tombol Keluar berada di bagian bawah navigasi.

Pada halaman Tentang & Pembaruan, admin dapat menekan **Update Aplikasi** ketika HP tersambung ke internet. Sistem akan:
1. Membuat cadangan database TXT ke folder Download.
2. Memastikan repository tidak memiliki perubahan lokal yang belum diamankan.
3. Mengambil pembaruan dari branch yang sedang digunakan dan memasang dependensi Node.js.
4. Menghentikan proses server Node.js lama secara terkontrol, lalu menjalankan server baru.
5. Memeriksa endpoint kesehatan server dan memuat ulang tampilan aplikasi secara otomatis.

Jangan menutup Termux atau aplikasi selama proses berlangsung. Jika ada perubahan lokal pada file repository, pembaruan dibatalkan untuk mencegah file tertimpa. Detail proses tersedia di `backend/server-update.log`.

**Koneksi internet hanya diperlukan untuk mengambil pembaruan.** Operasional stok tetap lokal/offline. Android membatasi aplikasi untuk menutup dan meluncurkan ulang dirinya sendiri dari latar belakang; karena itu aplikasi mempertahankan layar yang terbuka dan memuat ulang WebView/halaman setelah server baru siap, bukan menutup paksa aplikasi Android.Pembaruan server menggunakan penghentian terkontrol (SIGTERM), menunggu permintaan yang sedang berjalan selesai, menyimpan database, lalu menyalakan proses Node.js baru. Log updater tersimpan di `backend/server-update.log`.
