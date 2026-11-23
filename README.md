# Abon Gulung Gembul - Stok Kertas

**INSAN Stock Manager · Versi 2.3.0**

Aplikasi manajemen persediaan kemasan dan bahan untuk Abon Gulung Gembul. Berjalan secara lokal di Android melalui Termux dengan Node.js/Express, database JSON persisten, dan frontend PWA.

## Fitur
- Dashboard stok lima jenis kemasan dengan pengaturan batas minimum.
- Pencatatan barang masuk berbasis pack, isi per pack, dan tambahan pcs.
- Target produksi per outlet (Grand Wisata, Bektim, Harapan Indah) dan varian Ori, Beef, Spicy, Cheese.
- Pengaturan kebutuhan Box isi 3/Box isi 5 per varian serta edit target dengan penyesuaian selisih stok.
- Pengurangan stok manual dengan alasan wajib; revisi, pengembalian sebagian, dan pembatalan yang tercatat di audit.
- Laporan produksi harian, stock opname, riwayat transaksi, dan ekspor CSV.
- Analitik pemakaian stok dan kalender target produksi.
- Akun admin/staff, pembatasan login, dan pencatatan aktivitas.
- Mode offline melalui cache PWA, penyimpanan lokal, dan antrean sinkronisasi IndexedDB.
- Backup database ber-checksum SHA-256 dan pemulihan tervalidasi dengan salinan pra-pemulihan.
- Aplikasi Android WebView, penyimpanan laporan ke folder Download, dan alarm native Pulang Kerja.
- Multi-perangkat melalui satu server pusat di Termux.
- Pemeriksaan dan penerapan pembaruan branch main langsung dari aplikasi oleh admin.

## Catatan versi 2.3.0

- Menambahkan halaman Pengguna & Akun yang hanya dapat diakses Admin.
- Admin dapat membuat akun dengan username, password, dan tingkat Admin atau Karyawan; password disimpan sebagai hash bcrypt.
- Memvalidasi username dan panjang password pada frontend serta backend.
- Memperbarui identitas versi dan deskripsi aplikasi pada backend, PWA, dan halaman Tentang & Pembaruan.
- Merapikan tema gelap menjadi monokrom hitam-putih dengan kontras yang konsisten.
- Menambahkan animasi pembuka untuk pemeriksaan koneksi server, dengan fallback ke data lokal saat server tidak tersedia.
- Memperbarui cache service worker agar aset versi baru dimuat.

## Instalasi Termux

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssl -y
git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
cd abongulunggembulstokinsan
bash scripts/install-termux.sh
```

### Jika skrip start tidak ditemukan pada clone lama

Jika Termux menampilkan `No such file or directory` untuk `scripts/start-termux.sh`, clone lokal mungkin belum memuat versi repository terbaru. Perbarui checkout tanpa memaksa atau menimpa perubahan lokal:

```bash
cd ~/abongulunggembulstokinsan
git pull --ff-only
ls -l scripts/start-termux.sh
```

Jika `git pull --ff-only` berhenti karena ada perubahan lokal, amankan perubahan tersebut terlebih dahulu; jangan gunakan `git reset --hard`. Pembaruan ini tidak memerlukan penghapusan `backend/.env` atau database lokal. Setelah skrip tersedia, jalankan perintah pada bagian **Jalankan server**.

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

Buka alamat IP yang ditampilkan dari browser perangkat lain, misalnya `http://192.168.1.20:8787`. Semua perangkat akan memakai database pusat yang sama pada HP server. Perangkat klien tidak perlu menjalankan Termux atau database kedua.

**Batasan keamanan dan instalasi:** alamat LAN HTTP cocok untuk uji coba pada Wi-Fi tepercaya. Browser Android umumnya tidak mengizinkan pemasangan PWA penuh atau service worker pada alamat IP HTTP biasa karena bukan secure context. Untuk memasang PWA dan akses dari luar rumah/kantor, siapkan HTTPS melalui reverse proxy/tunnel atau gunakan aplikasi Android WebView yang dikonfigurasi untuk alamat server. Jangan membuka port Termux langsung ke internet. Lihat panduan jaringan dan keamanan di `docs/MULTI_DEVICE_AND_ALARM.md`.

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
