#!/data/data/com.termux/files/usr/bin/bash
set -e
PORT="${PORT:-8787}"
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
if [ -z "$IP" ]; then IP="$(ip -4 addr show wlan0 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"; fi
if [ -z "$IP" ]; then echo "IP Wi-Fi belum ditemukan. Sambungkan HP server ke Wi-Fi/hotspot lalu jalankan lagi."; exit 1; fi
echo "Server INSAN di HP ini harus sudah berjalan."
echo "Alamat untuk perangkat lain pada Wi-Fi/hotspot yang sama:"
echo "http://$IP:$PORT"
echo "Jangan bagikan alamat ini ke jaringan publik tanpa VPN/tunnel dan pengamanan yang sesuai."
