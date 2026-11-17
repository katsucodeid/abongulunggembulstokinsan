# Matriks Migrasi API ke Mode Mandiri

Dokumen ini melengkapi `ANDROID_APK_MANDIRI.md`. Seluruh route berikut ditemukan pada kode backend di branch eksperimen. Tidak satu pun boleh hilang saat migrasi.

## Endpoint dan cakupan lokal

| Endpoint | Fungsi yang wajib dipertahankan | Otorisasi |
|---|---|---|
| `POST /api/auth/login` | Verifikasi username/password, throttle, sesi lokal | Semua |
| `GET /api/health` | Status engine lokal (bukan status internet) | Publik lokal |
| `GET /api/state` | Stok, definisi barang, riwayat, identitas pengguna | Login |
| `POST /api/sync` | Operasi idempoten: stock-in, stock-out, production | Login |
| `PUT /api/transactions/:id` | Edit transaksi dengan hitung ulang stok dan audit | Sesuai role/aturan lama |
| `DELETE /api/transactions/:id` | Hapus transaksi dan balikkan dampak stok secara aman | Sesuai role/aturan lama |
| `GET /api/report` | Laporan dan ringkasan stok/produksi | Login |
| `GET/POST /api/users` | Daftar dan pembuatan akun | Admin |
| `POST /api/transactions/:id/corrections` | revise, return, reverse; pembatasan pemilik transaksi | Admin/pembuat |
| `GET /api/admin/backup` | Backup penuh dengan checksum | Admin |
| `POST /api/admin/restore` | Validasi checksum, safety backup, restore atomik | Admin |
| `GET /api/admin/settings` | Pengaturan minimum stok | Admin |
| `PUT /api/admin/settings/min-stock` | Simpan batas minimum stok | Admin |
| `GET /api/analytics/usage` | Statistik pemakaian 7–365 hari | Login |
| `GET /api/production/calendar` | Kalender produksi bulanan | Login |
| `GET /api/export/transactions.csv` | Ekspor riwayat CSV | Login |
| `GET /api/admin/audit` | Riwayat audit admin | Admin |

## Perilaku bisnis yang harus identik

- Item stok: `box3`, `box5outer`, `box5inner`, `paper`, `mika`.
- Outlet produksi: Grand Wisata, Bektim, Harapan Indah.
- Produksi memiliki varian ori, beef, spicy, cheese dan konfigurasi kemasan per varian.
- Stok tidak boleh negatif; jumlah harus integer aman.
- ID operasi diproses hanya sekali; retry tidak boleh menggandakan transaksi.
- Koreksi stok harus merujuk pengurangan manual, menghitung koreksi terdahulu, dan membatasi staff pada transaksi sendiri.
- Edit/hapus harus membalik perubahan stok terdahulu lalu menerapkan perubahan baru secara atomik.
- Seluruh perubahan penting mencatat audit; kegagalan penyimpanan harus mengembalikan stok, transaksi, dan audit ke keadaan sebelum operasi.
- Data tanggal, lokasi, catatan, pembuat, timestamp, dan seluruh detail lines harus tetap dipertahankan.

## Temuan penting untuk implementasi

1. Frontend saat ini memakai bearer token JWT yang diterbitkan backend. APK offline harus menggantinya dengan sesi lokal yang disimpan aman; jangan memakai JWT_SECRET server atau menanam secret ke APK.
2. Backend menyimpan seluruh database sebagai objek JSON dengan properti tambahan seperti `stockStartDate`, `settings`, `auditLog`, `processed`, `users`, dan `transactions`. Skema SQLite awal perlu menampung semuanya sebelum migrasi.
3. Password pengguna yang ada berupa bcrypt hash. Migrasi harus tetap dapat memverifikasi hash lama atau memaksa reset password melalui prosedur admin yang aman; jangan menyalin password plaintext.
4. `/api/update/*` adalah pembaruan kode melalui GitHub. Fitur ini tidak boleh menjadi dependensi aplikasi offline. Di mode mandiri, pembaruan APK harus berupa pemasangan versi APK baru dan migrasi SQLite forward-only.
5. Backend juga memuat alur backup/restore yang menyimpan backup pra-restore. Perilaku proteksi ini harus direplikasi sebelum fitur restore lokal dinyatakan selesai.

## Status APK build yang sudah ada

Workflow `Build Abon Gulung Gembul APK` pernah berhasil pada commit `ec2e213`, menghasilkan artifact `Abon-Gulung-Gembul-Stok-Kertas-APK`. Itu hanya membuktikan wrapper Android saat ini bisa dikompilasi. APK tersebut **belum offline mandiri**, sebab `MainActivity` masih membuka `http://127.0.0.1:8787` dan frontend masih memanggil route API backend.

Jangan distribusikan artifact build tersebut sebagai APK mandiri. Status offline baru boleh diberikan setelah MainActivity membuka aset lokal, semua endpoint di atas dipenuhi oleh SQLite/local service, dan pengujian mode pesawat lulus.
