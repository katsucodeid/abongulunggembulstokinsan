#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg update -y
pkg install -y nodejs-lts git openssl
cd "$HOME"
if [ ! -d abongulunggembulstokinsan ]; then
  git clone https://github.com/katsucodeid/abongulunggembulstokinsan.git
fi
cd abongulunggembulstokinsan/backend
npm install
touch .env
if ! grep -q '^JWT_SECRET=.' .env; then
  echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
fi
if ! grep -q '^ADMIN_USERNAME=.' .env; then
  echo "ADMIN_USERNAME=insanadmin" >> .env
fi
NEW_ADMIN_PASS=""
if ! grep -q '^ADMIN_PASSWORD=.' .env; then
  NEW_ADMIN_PASS="$(openssl rand -hex 10)"
  echo "ADMIN_PASSWORD=$NEW_ADMIN_PASS" >> .env
fi
chmod 600 .env
echo
echo "Menyiapkan akses penyimpanan internal untuk laporan TXT..."
if command -v termux-setup-storage >/dev/null 2>&1; then
  termux-setup-storage
fi
if [ -d "$HOME/storage/downloads" ]; then
  mkdir -p "$HOME/storage/downloads/Abon Gulung Gembul"
  echo "Folder laporan: $HOME/storage/downloads/Abon Gulung Gembul"
else
  echo "PERHATIAN: izin Download belum tersedia. Jalankan termux-setup-storage lalu izinkan akses penyimpanan."
fi
if [ -n "$NEW_ADMIN_PASS" ]; then
  echo
  echo "SIMPAN KREDENSIAL ADMIN INI SEKARANG:"
  echo "Username: insanadmin"
  echo "Password: $NEW_ADMIN_PASS"
  echo "Password hanya ditampilkan saat pertama kali dibuat."
else
  echo "Konfigurasi admin yang sudah ada tetap dipakai dari backend/.env."
fi
echo
echo "Instalasi selesai. Jalankan: bash ~/abongulunggembulstokinsan/scripts/start-termux.sh"
