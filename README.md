# Abon Gulung Gembul - Stok Insan

Aplikasi manajemen persediaan kemasan dan bahan untuk Abon Gulung Gembul. Mendukung website/PWA dan aplikasi Android WebView dengan backend Node.js/Express, akun Admin/Staff, serta database JSON persisten.

## Fitur
- Dashboard dan pengelolaan stok.
- Barang masuk, target produksi, laporan, riwayat, dan pengaturan.
- Akun Admin/Staff; akun baru dibuat Admin (invite-only), tanpa pendaftaran publik.
- Operasi offline melalui cache PWA dan antrean sinkronisasi IndexedDB.
- Backup dan pemulihan database.
- Website online dan aplikasi Android yang mengakses server pusat yang sama.

## Deploy online (Render)

Konfigurasi Blueprint tersedia di `render.yaml`. Ikuti panduan lengkap di [docs/DEPLOY_ONLINE.md](docs/DEPLOY_ONLINE.md).

Ringkasnya:
1. Merge perubahan online ke `main`.
2. Di Render pilih **New > Blueprint** dan hubungkan repository ini.
3. Atur `ADMIN_PASSWORD` yang kuat saat diminta Render.
4. Deploy service. Data disimpan pada persistent disk di `/var/data`.
5. Buka URL service dan login sebagai Admin. Admin membuat akun Staff dari menu manajemen pengguna.

**Penting:** layanan memakai persistent disk berbayar dan harus dijalankan sebagai satu instance karena penyimpanan JSON saat ini tidak mendukung beberapa replica. Buat backup rutin.

## Instalasi lokal Termux

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssl -y
git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
cd abongulunggembulstokinsan
bash scripts/install-termux.sh
bash scripts/start-termux.sh
```

Buka `http://127.0.0.1:8787` untuk instalasi lokal.

## Migrasi database lama

Database lokal berada di `backend/data/data.json`. Buat backup dari aplikasi lama, deploy server online, lalu pulihkan backup melalui menu Admin. Panduan ada di [docs/DEPLOY_ONLINE.md](docs/DEPLOY_ONLINE.md).

**Jangan commit `.env`, `data.json`, token, password, atau file backup ke repository.**
