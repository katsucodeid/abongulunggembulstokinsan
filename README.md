# Abon Gulung Gembul - Stok Kertas

Aplikasi manajemen persediaan kemasan dan bahan untuk Abon Gulung Gembul. Berjalan secara lokal di Android melalui Termux dengan Node.js/Express, database JSON persisten, dan frontend PWA.

## Fitur
- Dashboard dan pengelolaan stok.
- Barang masuk, target produksi, laporan, riwayat, dan pengaturan.
- Akun admin/staff dan pencatatan aktivitas.
- Operasi offline melalui cache PWA dan antrean sinkronisasi IndexedDB.
- Backup dan pemulihan database.
- Aplikasi Android WebView sebagai antarmuka ke backend Termux.

## Instalasi Termux

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssl -y
git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
cd abongulunggembulstokinsan
bash scripts/install-termux.sh
```

Jalankan server:

```bash
cd ~/abongulunggembulstokinsan
bash scripts/start-termux.sh
```

Buka `http://127.0.0.1:8787`.

## Database dan migrasi

Database utama berada di `backend/data/data.json` pada perangkat Termux. File ini dan `backend/.env` sengaja tidak disimpan di GitHub. Untuk memindahkan data dari instalasi lama, buat backup dari aplikasi lama lalu pulihkan pada instalasi baru, atau salin file database saat kedua server berhenti setelah membuat salinan cadangan.

**Jangan commit `.env`, `data.json`, token, atau password ke repository.**

Panduan tambahan: [docs/TERMUX_OFFLINE.md](docs/TERMUX_OFFLINE.md).
