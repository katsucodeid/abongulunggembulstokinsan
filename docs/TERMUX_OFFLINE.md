# Mode Offline Satu Perangkat — Termux Android

## Tujuan

Abon Gulung Gembul berjalan sepenuhnya secara lokal pada satu HP Android. Termux menjalankan backend, Android app/browser pada HP yang sama menjadi antarmuka, dan database tidak dibuka ke jaringan lokal maupun internet.

## Lokasi data

- Database utama (format JSON): ~/abongulunggembulstokinsan/backend/data/data.json
- Konfigurasi rahasia: ~/abongulunggembulstokinsan/backend/.env
- Salinan database yang bisa dibaca: ~/storage/downloads/Abon Gulung Gembul/database-stok.txt
- Laporan harian: ~/storage/downloads/Abon Gulung Gembul/DDnamabulanYYYY.txt
- Cadangan sebelum pembaruan: cadangan-sebelum-pembaruan-*.txt
- Cadangan sebelum laporan: cadangan-sebelum-laporan-DDnamabulanYYYY.txt

Database utama berada di ruang privat Termux. Salinan TXT di Download diperbarui setiap kali database utama berhasil disimpan. Jangan edit salinan TXT; perubahan aplikasi harus dilakukan melalui aplikasi agar stok, transaksi, dan riwayat audit tetap konsisten.

## Persiapan

1. Jalankan termux-setup-storage.
2. Izinkan akses file dan media saat Android menampilkan permintaan izin.
3. Pastikan folder ~/storage/downloads tersedia.
4. Jalankan installer:

    bash ~/abongulunggembulstokinsan/scripts/install-termux.sh

## Mulai server offline

    bash ~/abongulunggembulstokinsan/scripts/start-termux.sh

Server hanya bind ke 127.0.0.1, bukan 0.0.0.0. Dengan demikian, koneksi hanya bisa berasal dari perangkat Android itu sendiri. Buka aplikasi Android pada HP yang sama atau buka http://127.0.0.1:8787 di browser HP.

Jangan tutup sesi Termux. termux-wake-lock digunakan untuk mengurangi kemungkinan CPU tidur saat server aktif. Nonaktifkan optimasi baterai untuk Termux jika Android sering menghentikan proses.

## Laporan otomatis tengah malam

- Server menggunakan zona waktu lokal Android.
- Pada pukul 00.00, laporan untuk tanggal yang baru selesai dibuat.
- Nama file memakai tanggal, bulan Indonesia huruf kecil, dan tahun: 11november2026.txt.
- Laporan berisi stok awal, perubahan, stok akhir, target produksi, barang masuk, pengurangan stok, outlet, pengguna, dan catatan.
- Sebelum file laporan dibuat, database dicadangkan ke file TXT.
- Jika HP/server mati saat tengah malam, laporan tanggal yang belum dibuat akan dikejar saat server berikutnya dinyalakan.

Pastikan tanggal, jam, dan zona waktu Android benar. Laporan tengah malam hanya dapat dibuat otomatis ketika proses Termux berjalan; laporan yang terlewat dibuat saat server hidup kembali.

## Migrasi dan perlindungan data

Sebelum pembaruan, sistem menyalin database lama ke file cadangan TXT di Download. Database lama tidak direset. Jangan hapus data sampai stok, target, akun, dan transaksi sudah diverifikasi.

Simpan salinan cadangan di media lain secara berkala. Penyimpanan pada satu HP bukan pengganti cadangan eksternal apabila perangkat hilang atau rusak.

## Navigasi dan pembaruan aplikasi

Navigasi dikelompokkan ke dalam bagian **Operasional** (Stok, Stok Datang, Target, Riwayat, Laporan, Stok Manual) dan **Pengaturan & Sistem** (Alarm Kerja, Pencadangan, Tentang & Pembaruan). Tekan judul kelompok untuk membuka atau menutup submenu. Tombol Keluar berada di bagian bawah navigasi.

Pada halaman Tentang & Pembaruan, admin dapat menekan **Update Aplikasi** ketika HP tersambung ke internet. Sistem akan:
1. Membuat cadangan database TXT ke folder Download.
2. Memastikan repository tidak memiliki perubahan lokal yang belum diamankan.
3. Mengambil pembaruan dari branch yang sedang digunakan dan memasang dependensi Node.js.
4. Menghentikan proses server Node.js lama secara terkontrol, lalu menjalankan server baru.
5. Memeriksa endpoint kesehatan server dan memuat ulang tampilan aplikasi secara otomatis.

Jangan menutup Termux atau aplikasi selama proses berlangsung. Jika ada perubahan lokal pada file repository, pembaruan dibatalkan untuk mencegah file tertimpa. Detail proses tersedia di `backend/server-update.log`.

**Koneksi internet hanya diperlukan untuk mengambil pembaruan.** Operasional stok tetap lokal/offline. Android membatasi aplikasi untuk menutup dan meluncurkan ulang dirinya sendiri dari latar belakang; karena itu aplikasi mempertahankan layar yang terbuka dan memuat ulang WebView/halaman setelah server baru siap, bukan menutup paksa aplikasi Android.
