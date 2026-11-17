# Audit Percobaan APK Mandiri Offline

Status: audit awal pada branch `cobaapkmandiri`. Dokumen ini sengaja menjadi pagar keselamatan sebelum migrasi data dan operasi stok.

## Kesimpulan

Repository dapat dijadikan APK Android mandiri tanpa Termux dan tanpa server jaringan, tetapi **belum dapat langsung disebut mandiri pada kondisi saat ini**. APK sekarang adalah WebView yang membuka `http://127.0.0.1:8787`; alamat tersebut hanya tersedia jika backend Node.js berjalan di Termux.

## Temuan dari kode saat ini

- `android/.../MainActivity.java`: `APP_URL` menunjuk ke `http://127.0.0.1:8787`. WebView menampilkan pesan bahwa server harus dijalankan dari Termux.
- `frontend/config.js`: API memakai same-origin (`API_BASE: ""`).
- `frontend/app.js`: cache state dan antrean transaksi memang sudah memakai IndexedDB, tetapi operasi utama tetap memanggil endpoint `/api`; antrean offline disinkronkan ke backend.
- `frontend/sw.js`: hanya cache shell/aset GET; request `/api/` sengaja dilewatkan ke jaringan. Ini bukan backend lokal mandiri.
- `backend/server.js`: logika stok, validasi, akun, transaksi, riwayat, audit, dan persistensi berada di Node/Express. Database utama adalah `backend/data/data.json`.
- `backend/management.js` dan `backend/stock-corrections.js`: fitur administrasi dan koreksi stok juga berada di backend dan harus ikut dimigrasikan, bukan dibuang.
- Workflow APK saat ini hanya membangun Android WebView wrapper; belum mengemas frontend dan database/API lokal ke dalam APK.
- Logo ada di `img/BackgroundEraser_20261016_074306739.png`; workflow sudah menggunakannya untuk ikon launcher, tetapi UI masih perlu memakai aset lokal yang ikut APK.

## Rancangan percobaan

APK mandiri harus membuka UI dari `file:///android_asset/www/index.html` (atau WebViewAssetLoader dengan origin lokal aman), bukan localhost atau website.

Lapisan data harus dipindahkan ke penyimpanan di perangkat:
1. SQLite Android sebagai database utama persisten untuk stok, definisi barang, akun lokal, transaksi, ID operasi yang telah diproses, koreksi stok, dan audit.
2. Java repository/service sebagai pengganti route Express; JavaScript memanggilnya melalui bridge yang sempit dan tervalidasi.
3. Migrasi satu kali dari format backup `.insanbackup` yang sudah digunakan aplikasi. Jangan mengubah atau menimpa database lama otomatis.
4. Login dan role admin/staff harus tetap tersedia. Password tetap di-hash; token server/JWT tidak boleh dijadikan mekanisme autentikasi lokal.
5. Semua halaman, gambar, ikon, font, audio, dan library harus dibundel. Tidak boleh ada CDN, remote API, GitHub update check, atau font eksternal sebagai dependensi runtime.
6. Backup/restore lokal harus dapat berjalan tanpa koneksi; ekspor/impor harus mempertahankan seluruh tabel dan riwayat.
7. Sinkronisasi antarperangkat adalah fitur opsional saat jaringan tersedia. Mode mandiri tidak boleh menunggu sinkronisasi untuk membaca atau menyimpan transaksi.

## Urutan implementasi dan kriteria lulus

- [ ] Paketkan UI dan semua aset ke APK; aplikasi dapat dibuka pada mode pesawat setelah instalasi.
- [ ] Buat skema SQLite dan migrasi backup; validasi jumlah barang, pengguna, transaksi, koreksi, dan audit sebelum/selepas migrasi.
- [ ] Porting seluruh aturan bisnis backend secara setara: barang masuk, pengurangan, target produksi, edit/hapus yang diizinkan, koreksi, laporan, dan role.
- [ ] Ganti seluruh pemanggilan `/api` dengan adapter data lokal; tidak boleh ada request jaringan untuk alur stok normal.
- [ ] Uji tutup paksa, restart perangkat, mode pesawat, dan data tetap utuh.
- [ ] Uji kasus stok tidak cukup, ID transaksi duplikat, transaksi invalid, staff mengedit data yang bukan miliknya, dan admin menghapus transaksi.
- [ ] Uji backup lalu restore ke instalasi bersih dan bandingkan seluruh ringkasan data.
- [ ] Jalankan build APK dan tes instrumentasi; jangan menyebutnya siap produksi sebelum seluruh kriteria lulus.

## Keputusan keselamatan

Percobaan ini tidak mengubah branch `main`, tidak mengubah database Termux, tidak menghapus backend lama, dan tidak mengganti alur multi-perangkat. Jangan memasang APK percobaan di atas aplikasi aktif sebelum backup dibuat dan migrasi diuji. Branch ini adalah jalur eksperimen terpisah.
