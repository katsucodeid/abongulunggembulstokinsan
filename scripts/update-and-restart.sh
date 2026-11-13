#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

ROOT="$HOME/abongulunggembulstokinsan"
SERVER_PID="${1:-}"
BACKEND="$ROOT/backend"
DATA_DIR="${DATA_DIR:-$BACKEND/data}"
REPORT_DIR="${REPORT_DIR:-$HOME/storage/downloads/Abon Gulung Gembul}"
STATUS_FILE="$DATA_DIR/update-status.json"
LOG_FILE="$BACKEND/server-update.log"
PORT="$(sed -n 's/^PORT=//p' "$BACKEND/.env" | tail -n 1)"
PORT="${PORT:-8787}"
BRANCH="$(git -C "$ROOT" branch --show-current)"
SERVER_STOPPED=0

write_status() {
  node - "$STATUS_FILE" "$1" "$2" "$BRANCH" <<'NODE'
const fs = require("fs");
const [file, status, message, branch] = process.argv.slice(2);
fs.mkdirSync(require("path").dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({
  status, message, branch, updatedAt: new Date().toISOString()
}, null, 2), { mode: 0o600 });
NODE
}

port_open() {
  node - "$PORT" <<'NODE'
const net = require("net");
const socket = net.createConnection({host:"127.0.0.1",port:Number(process.argv[2])});
socket.setTimeout(700);
socket.once("connect",()=>{socket.destroy();process.exit(0);});
socket.once("error",()=>process.exit(1));
socket.once("timeout",()=>{socket.destroy();process.exit(1);});
NODE
}

start_server() {
  cd "$BACKEND"
  export REPORT_DIR DATA_DIR
  nohup node server.js >> "$LOG_FILE" 2>&1 </dev/null &
  echo "$!" > "$DATA_DIR/server.pid"
  SERVER_STOPPED=0
}

on_error() {
  code=$?
  trap - ERR
  if [ "$SERVER_STOPPED" -eq 1 ] && ! port_open; then
    echo "Pembaruan gagal; mencoba menyalakan kembali server..." >> "$LOG_FILE"
    start_server || true
  fi
  write_status "failed" "Pembaruan gagal (kode $code). Periksa backend/server-update.log. Database dan file .env tidak dihapus." || true
  exit "$code"
}
trap on_error ERR

cd "$ROOT"
mkdir -p "$DATA_DIR" "$REPORT_DIR"
exec >> "$LOG_FILE" 2>&1
if [ -z "$SERVER_PID" ] || ! [[ "$SERVER_PID" =~ ^[0-9]+$ ]]; then
  echo "PID server tidak valid." >&2
  exit 2
fi
if [ ! -d "$ROOT/.git" ]; then
  echo "Folder repository Git tidak ditemukan." >&2
  exit 2
fi
if [ -z "$BRANCH" ]; then
  echo "Tidak dapat menentukan branch repository." >&2
  exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Ada perubahan lokal di repository. Pembaruan dibatalkan agar file lokal tidak tertimpa." >&2
  exit 3
fi

if [ -f "$DATA_DIR/data.json" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp -p "$DATA_DIR/data.json" "$REPORT_DIR/cadangan-sebelum-pembaruan-$STAMP.txt"
fi
write_status "fetching" "Mencadangkan database dan mengambil kode terbaru dari GitHub…"
sleep 3

git fetch --prune origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

write_status "installing" "Kode terbaru diterapkan. Memasang dependensi Node.js dan memeriksa sintaks…"
cd "$BACKEND"
npm install --no-audit --no-fund
node --check server.js
node --check daily-reports.js
node --check management.js
node --check ../frontend/app.js

write_status "restarting" "Dependensi siap. Menghentikan server lama dan menjalankan server baru…"
if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill -TERM "$SERVER_PID"
fi
SERVER_STOPPED=1

for attempt in $(seq 1 30); do
  if ! port_open; then break; fi
  sleep 1
done
if port_open; then
  echo "Server lama belum melepas port $PORT." >&2
  exit 4
fi

start_server
READY=0
for attempt in $(seq 1 45); do
  if node - "$PORT" <<'NODE'
const http = require("http");
const req = http.get({host:"127.0.0.1",port:Number(process.argv[2]),path:"/api/health",timeout:900},res=>{
  let body="";
  res.on("data",chunk=>body+=chunk);
  res.on("end",()=>{
    try { const data=JSON.parse(body); process.exit(data.ok && data.bootId ? 0 : 1); }
    catch { process.exit(1); }
  });
});
req.on("error",()=>process.exit(1));
req.on("timeout",()=>{req.destroy();process.exit(1);});
NODE
  then READY=1; break; fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "Server baru belum merespons health check." >&2
  exit 5
fi

write_status "completed" "Pembaruan selesai. Server Termux sudah aktif kembali; aplikasi akan memuat ulang otomatis."
echo "Pembaruan selesai. Server aktif pada 127.0.0.1:$PORT" >> "$LOG_FILE"
trap - ERR
exit 0
