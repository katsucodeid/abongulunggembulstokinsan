# Abon Gulung Gembul - Stok Kertas

Aplikasi manajemen persediaan kemasan dan bahan untuk Abon Gulung Gembul. Berjalan secara lokal di Android melalui Termux dengan Node.js/Express, database JSON persisten, dan frontend PWA.

## Fitur
- Dashboard dan pengelolaan stok.
- Barang masuk, target produksi, laporan, riwayat, dan pengaturan.
- Akun admin/staff dan pencatatan aktivitas.
- Operasi offline melalui cache PWA dan antrean sinkronisasi IndexedDB.
- Backup dan pemulihan database.
- Aplikasi Android WebView sebagai antarmuka ke backend Termux.
- Akses multi-perangkat melalui satu server pusat yang tetap berjalan di Termux.
- Nada alarm Pulang Kerja yang dapat disimpan dan diputar offline setelah aset audio dipasang.

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

## Menggunakan beberapa perangkat

Jalankan backend hanya pada **satu HP server** di Termux. Sambungkan HP server dan perangkat lain ke Wi-Fi/hotspot yang sama, lalu jalankan:

```bash
bash scripts/show-lan-url.sh
```

Buka alamat IP yang ditampilkan dari browser perangkat lain, misalnya `http://192.168.1.20:8787`. Semua perangkat akan memakai database pusat yang sama pada HP server. Perangkat klien tidak perlu menjalankan server/database kedua. Untuk akses dari luar jaringan lokal, gunakan VPN privat atau tunnel yang diamankan; jangan membuka port Termux langsung ke internet.

Lihat [panduan multi-perangkat dan alarm](docs/MULTI_DEVICE_AND_ALARM.md).

## Nada alarm Pulang Kerja

Paket pembaruan yang menyertakan file MP3 harus diekstrak ke root repository sehingga file tersedia di `frontend/audio/nada-pulang-abon-gulung.mp3`. Setelah aplikasi dimuat ulang, nada akan muncul sebagai **Pulang Kerja · Abon Gulung Gembul** dan disimpan lokal untuk pemutaran offline.

Untuk menyalin file ke folder nada alarm sistem Android:

```bash
bash scripts/install-alarm-tone.sh
```

Lalu pilih file tersebut melalui aplikasi Jam/Clock Android → Alarm → Suara alarm. Pemilihan nada sistem memerlukan tindakan manual satu kali. Alarm PWA sendiri tidak dijamin berbunyi jika browser ditutup atau Android menghentikan proses.

## Database dan migrasi

Database utama berada di `backend/data/data.json` pada perangkat Termux server. File ini dan `backend/.env` sengaja tidak disimpan di GitHub. Untuk memindahkan data dari instalasi lama, buat backup dari aplikasi lama lalu pulihkan pada instalasi baru, atau salin file database saat kedua server berhenti setelah membuat salinan cadangan.

**Jangan commit `.env`, `data.json`, token, atau password ke repository.**
