# Android APK mandiri — branch cobaapkmandiri

## Arsitektur yang diterapkan

APK tidak lagi bergantung pada Termux atau server Node.js eksternal.

- `MainActivity` memulai `LocalApiServer` di dalam proses Android pada loopback `127.0.0.1:18787`.
- Port khusus 18787 sengaja dipisahkan dari server Termux lama (8787), sehingga aplikasi tidak dapat diam-diam memakai backend Termux jika backend tersebut sedang hidup.
- Frontend dan gambar disalin ke `android/app/src/main/assets/www` saat workflow build, lalu disajikan dari aset APK.
- API lokal menangani autentikasi BCrypt, bootstrap admin pertama, state, sinkronisasi antrean, transaksi barang masuk/keluar/produksi, edit dan hapus transaksi, koreksi pengurangan manual, laporan, pengguna, pengaturan minimum stok, kalender produksi, audit, ekspor CSV, backup, dan restore.
- Seluruh dokumen bisnis dipersistenkan di SQLite melalui `InsanLocalDatabase`. Tabel proyeksi disinkronkan dalam transaksi SQLite yang sama.
- Backup/restore native memvalidasi format dan checksum serta menyimpan salinan sebelum pemulihan.
- API hanya mendengarkan pada alamat loopback perangkat. WebView dibatasi ke origin lokal.

## Penggunaan pertama

1. Pasang APK mandiri dari workflow branch ini.
2. Jika aplikasi memiliki data lama di Termux, buat file backup INSAN dari sistem lama terlebih dahulu. Jangan menghapus atau mengubah database Termux.
3. Di APK baru, buka Pencadangan & Pemulihan dan pulihkan file `.insanbackup` milik sistem lama. Jika memulai dari nol, buat akun admin pertama pada layar login.
4. Periksa stok, akun, riwayat, dan laporan sebelum menggunakan aplikasi untuk transaksi operasional.

Database baru memakai nilai awal bawaan proyek; nilai tersebut bukan pengganti database operasional. Pulihkan backup yang benar sebelum mencatat transaksi sebenarnya.

## Verifikasi otomatis

Workflow `.github/workflows/build-apk.yml` menjalankan Android instrumentation test pada emulator sebelum membuat APK. Tes mencakup:
- layanan lokal dan status bootstrap;
- pembuatan admin dan autentikasi BCrypt;
- transaksi barang masuk/keluar serta idempotensi;
- koreksi stok manual dan pengulangan request;
- target produksi, edit, hapus dan pengembalian stok;
- pengaturan minimum, kalender, laporan, audit, ekspor CSV;
- persistensi setelah server dan koneksi SQLite ditutup lalu dibuka kembali.

Build dan tes emulator tidak dapat menggantikan pemeriksaan di ponsel fisik. Setelah memasang APK, lakukan pemeriksaan akhir dengan mode pesawat aktif, tutup paksa lalu buka kembali aplikasi, dan pastikan stok/riwayat tetap ada.

## Batasan

- Pemeriksaan commit GitHub dan pemasangan versi APK baru membutuhkan internet. Fitur operasional dan data lokal tidak membutuhkannya.
- Sesi login lokal dibuat ulang ketika proses aplikasi dimulai ulang; pengguna mungkin perlu login kembali.
- APK debug dari Actions bukan APK rilis bertanda tangan produksi.
- Jangan memasang versi uji sebelum membuat backup database operasional.
- Branch ini tidak mengubah `main` dan tidak mengakses atau memodifikasi database Termux aktif.
