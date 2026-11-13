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
