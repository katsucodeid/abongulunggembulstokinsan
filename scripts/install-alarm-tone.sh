#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/frontend/audio/nada-pulang-abon-gulung.mp3"
DEST_DIR="$HOME/storage/shared/Alarms"
DEST="$DEST_DIR/Abon-Gulung-Gembul-Pulang-Kerja.mp3"
if [ ! -f "$SOURCE" ]; then
  echo "File nada tidak ditemukan: $SOURCE"
  echo "Ekstrak paket INSAN yang berisi frontend/audio/nada-pulang-abon-gulung.mp3 terlebih dahulu."
  exit 1
fi
if [ ! -d "$HOME/storage/shared" ]; then
  echo "Meminta izin akses penyimpanan Android…"
  termux-setup-storage || true
  echo "Jika Android menampilkan dialog, izinkan akses lalu jalankan skrip ini sekali lagi."
  exit 1
fi
mkdir -p "$DEST_DIR"
cp "$SOURCE" "$DEST"
if command -v termux-media-scan >/dev/null 2>&1; then termux-media-scan "$DEST" >/dev/null 2>&1 || true; fi
echo "Nada alarm tersalin ke: $DEST"
echo "Buka aplikasi Jam/Clock Android → Alarm → Suara alarm → pilih 'Abon-Gulung-Gembul-Pulang-Kerja'."
echo "Pemilihan nada di aplikasi Jam perlu dilakukan sekali secara manual; setelah dipilih, nada bisa diputar tanpa internet."
