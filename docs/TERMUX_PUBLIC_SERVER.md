# Menjadikan HP Android sebagai server online

Aplikasi berjalan pada HP pemilik melalui Termux. Cloudflare Quick Tunnel menerbitkan alamat HTTPS publik yang meneruskan permintaan ke server lokal. Tidak perlu Render, VPS, IP publik, atau port forwarding.

## Persyaratan dan batasan

- Termux dari F-Droid atau rilis resmi Termux; jangan mencampur sumber instalasi Termux dan pluginnya.
- Internet aktif dan daya yang cukup. Gunakan Wi-Fi dan charger saat server digunakan lama.
- Android dapat menghentikan proses latar belakang karena penghemat baterai, tekanan memori, atau restart. Server tidak setara dengan VPS 24/7.
- Quick Tunnel memberi URL acak `*.trycloudflare.com`; URL dapat berubah saat tunnel dibuat ulang. Semua pengguna harus memakai URL terbaru.
- Siapa pun yang mengetahui URL dapat mencapai halaman login. Data API tetap memerlukan autentikasi aplikasi; jangan membuat akun umum.
- Backend saat ini menggunakan satu file JSON. Jalankan hanya satu proses server, jangan jalankan dua instance yang menulis database yang sama.

## 1. Persiapan

Buka Termux pada HP yang akan menjadi server:

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssl cloudflared -y
```

Jika repository belum ada:

```bash
git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
cd ~/abongulunggembulstokinsan
git fetch origin feature/online-hosting
git checkout feature/online-hosting
```

Jika folder sudah ada, masuk ke folder itu dan perbarui kode setelah memastikan perubahan lokal aman:

```bash
cd ~/abongulunggembulstokinsan
git fetch origin feature/online-hosting
git checkout feature/online-hosting
git pull origin feature/online-hosting
bash scripts/install-termux.sh
```

Installer membuat `backend/.env` dengan JWT secret dan password Admin awal bila belum ada. Simpan kredensial Admin secara aman. Jangan mengirim isi `.env` ke siapa pun.

## 2. Mulai server publik

```bash
bash ~/abongulunggembulstokinsan/scripts/start-online-termux.sh
```

Skrip akan:
1. Memastikan cloudflared tersedia.
2. Menyalakan API Node.js di localhost.
3. Menjalankan Cloudflare Quick Tunnel.
4. Menampilkan alamat HTTPS acak `https://....trycloudflare.com`.

Biarkan sesi Termux ini berjalan. Uji alamat itu dengan menambahkan `/api/health`; hasilnya harus JSON berisi `"ok":true`.

## 3. Hubungkan pengguna

- Di HP server sendiri, aplikasi Android dapat menggunakan `http://127.0.0.1:8787`.
- Di HP lain, buka alamat HTTPS Quick Tunnel yang tampil di Termux.
- APK Android meminta alamat server saat pertama kali dibuka. Masukkan URL HTTPS yang sama pada semua perangkat. URL disimpan di perangkat.
- Pengguna login menggunakan akun yang dibuat Admin dari menu manajemen pengguna. Tidak ada pendaftaran publik.
- Bagikan URL dan kredensial secara pribadi, jangan bagikan akun Admin.

Jika URL Quick Tunnel berubah, semua pengguna perlu memperbarui alamat server di aplikasi Android (tekan tombol Kembali saat berada di halaman utama aplikasi untuk membuka pengaturan alamat) atau membuka URL baru melalui browser.

## 4. Jaga agar server tetap berjalan

- Android Settings > Apps > Termux > Battery: pilih Unrestricted / Don't optimize (nama menu tergantung merek).
- Izinkan background activity dan autostart jika perangkat menyediakan pengaturan itu.
- Jalankan `termux-wake-lock` saat server aktif; skrip online sudah mencoba menjalankannya.
- Jangan Force Stop Termux. Jangan tutup sesi terminal yang menjalankan tunnel.
- Matikan battery saver untuk Termux bila perlu. Hindari panas berlebih dan gunakan charger yang baik.
- Setelah HP restart, jalankan lagi skrip online. Quick Tunnel baru bisa menghasilkan URL baru.

## 5. Database dan migrasi

Database aktif tetap berada di `backend/data/data.json` pada HP server (kecuali `DATA_DIR` diatur di `.env`). Buat backup dari menu Admin secara rutin dan salin file backup ke penyimpanan lain. Untuk memindahkan data dari instalasi HP lama, ekspor backup dari instalasi lama lalu pulihkan dari menu Admin di server baru. Jangan menghapus database lama sampai jumlah stok, transaksi, dan akun sudah diverifikasi.

## Keamanan dan pemulihan

- Gunakan password kuat untuk semua akun, terutama Admin.
- Buat akun Staff melalui Admin; jangan bagikan akun Admin.
- Jangan unggah `.env`, database, backup, JWT secret, atau password ke GitHub.
- Jika HP hilang, segera ubah kredensial akun dan amankan perangkat.
- Server ini cocok untuk penggunaan ringan dan percobaan/pemakaian operasional sederhana. Untuk layanan kritis yang harus online 24 jam, gunakan perangkat khusus atau hosting server yang selalu aktif.
