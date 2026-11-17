#!/data/data/com.termux/files/usr/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-insan-stock" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
ROOT="$ROOT"
cd "\$ROOT/backend"
nohup npm start >> "\$ROOT/backend/server.log" 2>&1 &
EOF
chmod +x "$HOME/.termux/boot/start-insan-stock"
echo "Skrip mulai otomatis dibuat untuk repository: $ROOT"
echo "Install dan buka aplikasi Termux:Boot satu kali, lalu restart HP untuk menguji."
