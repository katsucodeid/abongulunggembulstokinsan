# Status Implementasi Android Local-First

Tanggal pemeriksaan: 2026-11-16

## Status jujur

**Belum siap disebut aplikasi Android mandiri dengan seluruh fitur. Jangan menggantikan instalasi produksi/Termux dengan preview ini.**

Yang sudah tersedia pada branch `feature/android-local-first`:
- Proyek Android dapat dikompilasi menjadi APK debug.
- Layar pembuka menampilkan logo Abon Gulung Gembul.
- APK debug memakai application ID suffix `.preview`, sehingga tidak menimpa instalasi produksi.
- Fondasi SQLite privat aplikasi dengan tabel stok, pengguna, transaksi, operasi idempotensi, audit, pengaturan, metadata, dan catatan impor.
- Importer cadangan `.insanbackup` dengan pemeriksaan format, checksum SHA-256, validasi record, batas 50 MB, dan transaksi SQLite all-or-nothing.
- Layar pemeriksaan ringkasan data hasil impor.

Belum dipindahkan ke implementasi SQLite native:
- Login lokal aman, pengelolaan akun dan peran admin/staf.
- Input produksi per varian dan aturan pemakaian kemasan/outlet.
- Barang masuk, barang keluar manual, koreksi stok dan rollback.
- Riwayat lengkap, audit UI, laporan harian dan ekspor laporan.
- Backup dan restore lokal lengkap.
- Pengingat/alarm terhubung ke data produksi.
- Sinkronisasi opsional antar-perangkat melalui QR, persetujuan admin, TLS, pencabutan perangkat, idempotensi dan resolusi konflik.
- Migrasi skema SQLite versi berikutnya dan uji pemulihan setelah proses mati.

## Aturan keselamatan migrasi

- Branch ini tidak boleh menghapus atau menulis database Termux.
- Jangan mengganti application ID produksi sampai seluruh fitur dan migrasi diuji.
- Jangan mengimpor cadangan ke database yang sudah berisi data.
- Jangan mengaktifkan sinkronisasi sampai pairing, otorisasi, autentikasi perangkat dan konflik diuji.
- APK debug bukan rilis bertanda tangan produksi.

## Kriteria selesai sebelum disebut mandiri

1. Seluruh alur stok dan aturan bisnis lama direplikasi dan diuji terhadap fixture data.
2. Aplikasi berjalan setelah ponsel restart dan tanpa Termux maupun koneksi internet.
3. Impor, ekspor, backup, restore, dan migrasi skema lolos tes integritas.
4. Pengujian transaksi mencakup stok tidak boleh negatif, duplikasi operasi, rollback, dan pemulihan crash.
5. QR pairing dan persetujuan admin diuji pada dua perangkat di jaringan lokal dan internet.
6. Seluruh pengujian CI selesai sukses dan APK release ditandatangani dengan kunci yang dikendalikan pemilik.
