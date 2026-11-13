# Abon Gulung Gembul - Stok Insan

Aplikasi manajemen stok kemasan dan bahan untuk Abon Gulung Gembul. Mendukung Android, website/PWA, akun Admin/Staff, mode offline, backup, dan sinkronisasi ke satu server pusat.

## Akses online gratis menggunakan HP Android

HP pemilik menjalankan backend Node.js dan database JSON melalui Termux. Cloudflare Quick Tunnel memberi alamat HTTPS publik tanpa Render/VPS atau port forwarding.

Panduan lengkap: [docs/TERMUX_PUBLIC_SERVER.md](docs/TERMUX_PUBLIC_SERVER.md).

Ringkas:
```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssl cloudflared -y
git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
cd abongulunggembulstokinsan
git fetch origin feature/online-hosting
git checkout feature/online-hosting
bash scripts/install-termux.sh
bash scripts/start-online-termux.sh
```

Salin alamat `https://....trycloudflare.com` yang tampil di Termux dan bagikan kepada pengguna. Semua perangkat memasukkan alamat yang sama. URL Quick Tunnel dapat berubah ketika tunnel dimulai ulang.

## Akses pengguna dan keamanan

- Invite-only: Admin membuat akun pengguna dari aplikasi; tidak ada pendaftaran publik.
- Pengguna Staff tidak memperoleh hak Admin.
- Semua perangkat menggunakan database yang sama pada HP server.
- Buat backup rutin dan simpan salinan di luar HP server.
- Hanya jalankan satu proses backend yang menulis file database.

## Batasan server HP

HP harus menyala, terhubung internet, dan Termux/tunnel harus tetap berjalan. Android dapat menghentikan proses latar belakang; ini bukan pengganti VPS untuk ketersediaan 24/7. Gunakan Wi-Fi, charger, dan izinkan Termux berjalan tanpa optimasi baterai.

## Instalasi lokal

```bash
bash scripts/install-termux.sh
bash scripts/start-termux.sh
```

Buka `http://127.0.0.1:8787` pada HP server.

**Jangan commit `.env`, `data.json`, token, password, atau file backup ke repository.**
