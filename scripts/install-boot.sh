#!/data/data/com.termux/files/usr/bin/bash
set -e
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-insan-stock" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
cd "$HOME/abongulunggembulstokinsan/backend"
nohup npm start >> "$HOME/abongulunggembulstokinsan/backend/server.log" 2>&1 &
EOF
chmod +x "$HOME/.termux/boot/start-insan-stock"
echo "Skrip mulai otomatis dibuat."
echo "Install dan buka aplikasi Termux:Boot satu kali, lalu restart HP untuk menguji."
