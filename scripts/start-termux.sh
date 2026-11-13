#!/data/data/com.termux/files/usr/bin/bash
set -e
ROOT="$HOME/abongulunggembulstokinsan"
cd "$ROOT/backend"
if [ ! -f .env ]; then echo "File .env belum ada. Jalankan scripts/install-termux.sh"; exit 1; fi
PORT="$(sed -n 's/^PORT=//p' .env | tail -n 1)"
PORT="${PORT:-8787}"
termux-wake-lock 2>/dev/null || true

if [ ! -d "$HOME/storage/downloads" ] && command -v termux-setup-storage >/dev/null 2>&1; then
  echo "Meminta izin penyimpanan internal Android..."
  termux-setup-storage
fi
if [ -d "$HOME/storage/downloads" ]; then
  mkdir -p "$HOME/storage/downloads/Abon Gulung Gembul"
  export REPORT_DIR="$HOME/storage/downloads/Abon Gulung Gembul"
  echo "Laporan TXT: $REPORT_DIR"
else
  echo "PERINGATAN: izin Download belum aktif. Jalankan termux-setup-storage dan izinkan akses file."
fi

# Avoid launching a second Node server on an already occupied port.
if node - "$PORT" <<'NODE'
const net = require("net");
const port = Number(process.argv[2]);
const socket = net.createConnection({ host: "127.0.0.1", port });
socket.setTimeout(1200);
socket.once("connect", () => { socket.destroy(); process.exit(0); });
socket.once("timeout", () => { socket.destroy(); process.exit(1); });
socket.once("error", () => process.exit(1));
NODE
then
  echo "Abon Gulung Gembul - Stok Kertas sudah berjalan pada port $PORT."
  echo "Jangan jalankan server kedua. Untuk menerapkan pembaruan, hentikan server lama dengan CTRL+C pada sesi Termux yang menjalankannya, lalu jalankan skrip ini lagi."
  exit 0
fi

echo "Mode: OFFLINE LOKAL — server hanya menerima koneksi dari HP ini."
echo "Buka aplikasi Android Abon Gulung Gembul pada perangkat yang sama."
npm start
