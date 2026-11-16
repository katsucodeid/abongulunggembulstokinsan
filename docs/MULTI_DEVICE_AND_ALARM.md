# Panduan multi-perangkat, jaringan, dan alarm

## Arsitektur

- Satu HP pemilik menjalankan Termux, Node.js/Express, dan database pusat.
- HP staff cukup membuka alamat server melalui browser; Termux tidak diperlukan pada perangkat klien.
- Semua perubahan online masuk ke database pada HP server.
- Saat koneksi terputus, aplikasi dapat memakai data cache dan antrean lokal. Sinkronisasi dilakukan setelah server dapat dijangkau kembali.
- Jika HP server mati, baterai habis, Termux dihentikan Android, atau jaringan terputus, perangkat klien tidak dapat mengakses data pusat sampai server kembali online.

## Akses pada Wi-Fi yang sama

1. Jalankan server pada HP pemilik: `bash ~/abongulunggembulstokinsan/scripts/start-termux.sh`.
2. Sambungkan HP staff dan HP pemilik ke Wi-Fi/hotspot yang sama.
3. Pada Termux HP pemilik jalankan `bash ~/abongulunggembulstokinsan/scripts/show-lan-url.sh`.
4. Buka alamat yang ditampilkan pada browser HP staff.
5. Login menggunakan akun staff yang dibuat admin.

Jangan mengirim alamat tersebut ke orang di luar jaringan tepercaya. HTTP pada jaringan lokal tidak mengenkripsi kredensial atau isi transaksi.

## HTTPS dan akses dari luar jaringan

Alamat IP LAN dengan HTTP ditujukan untuk pengujian jaringan lokal. PWA modern membutuhkan secure context untuk service worker dan pemasangan yang benar; HTTP pada IP LAN biasa tidak memenuhi syarat tersebut. Gunakan HTTPS reverse proxy/tunnel atau aplikasi Android WebView yang memang dikonfigurasi untuk server sebelum dipakai melalui internet.

Jangan melakukan port-forwarding langsung ke port 8787. Untuk akses jarak jauh, gunakan VPN privat atau tunnel HTTPS dengan kontrol akses. Pastikan hanya pengguna yang berwenang dapat mencapai server. HTTPS saja bukan pengganti autentikasi.

## Pengamanan yang diterapkan

- Frontend dan API menggunakan same-origin; wildcard CORS dihapus.
- Header keamanan HTTP dipasang melalui Helmet. Kebijakan CSP belum diaktifkan karena frontend saat ini masih memakai inline script/style.
- Endpoint login membatasi 10 kegagalan per kombinasi alamat IP dan username dalam jendela 15 menit. Penghitung ini berada di memori dan ter-reset ketika server dimulai ulang; ini bukan sistem anti-serangan penuh.
- Pemeriksaan riwayat/update GitHub menggunakan repository `katsucodeid/abongulunggembulstokinsan` secara default. Nilai dapat diganti melalui `GITHUB_REPO=owner/repository` di `backend/.env`.

## Menjaga server tetap aktif

- Jalankan `termux-wake-lock` (skrip start sudah mencobanya).
- Izinkan Termux berjalan di latar belakang dan kecualikan dari optimasi baterai Android.
- Jaga HP tetap terhubung ke daya dan jaringan.
- Buat backup database secara berkala dari menu admin.
- Jangan pernah mengunggah `backend/.env`, `backend/data/data.json`, atau file backup ke repository publik.

## Alarm Pulang Kerja

Alarm berbasis browser/PWA tidak dijamin berbunyi jika browser ditutup atau Android menghentikan proses. Untuk alarm yang harus berbunyi tepat waktu, gunakan alarm sistem Android dan pilih file nada yang sudah disalin ke folder Alarms.
