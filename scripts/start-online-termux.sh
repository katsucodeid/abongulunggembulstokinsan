#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
ROOT="$HOME/abongulunggembulstokinsan"
BACKEND="$ROOT/backend"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
cd "$BACKEND"
if [ ! -f .env ]; then
  echo "Konfigurasi backend/.env belum ada. Jalankan scripts/install-termux.sh dahulu."
  exit 1
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Memasang cloudflared dari repository resmi Termux..."
  pkg install cloudflared -y
fi
PORT="$(sed -n 's/^PORT=//p' .env | tail -n 1)"
PORT="${PORT:-8787}"
termux-wake-lock 2>/dev/null || true

if node - "$PORT" <<'NODE'
const net = require("net");
const socket = net.createConnection({host:"127.0.0.1",port:Number(process.argv[2])});
socket.setTimeout(1000);
socket.once("connect",()=>{socket.destroy();process.exit(0)});
socket.once("timeout",()=>{socket.destroy();process.exit(1)});
socket.once("error",()=>process.exit(1));
NODE
then
  echo "Server lokal sudah berjalan pada port $PORT."
else
  echo "Menyalakan server stok..."
  node server.js >> "$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  cleanup() {
    echo "Menghentikan server stok..."
    kill "$SERVER_PID" 2>/dev/null || true
    termux-wake-unlock 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
  READY=0
  for i in $(seq 1 30); do
    if node -e "fetch('http://127.0.0.1:$PORT/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then READY=1; break; fi
    sleep 1
  done
  if [ "$READY" -ne 1 ]; then
    echo "Server gagal aktif. Periksa log: $LOG_DIR/server.log"
    tail -n 40 "$LOG_DIR/server.log" || true
    exit 1
  fi
fi

echo
echo "======================================================"
echo " SERVER STOK AKTIF — jangan tutup sesi Termux ini"
echo " Alamat lokal: http://127.0.0.1:$PORT"
echo "======================================================"
echo "Membuat alamat HTTPS publik Cloudflare Quick Tunnel..."
echo "Salin URL https://....trycloudflare.com yang tampil di bawah."
echo "Masukkan URL itu ke aplikasi Android pengguna lain."
echo "Tekan CTRL+C untuk menghentikan tunnel."
echo
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT"
