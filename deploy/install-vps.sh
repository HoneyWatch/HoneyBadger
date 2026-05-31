#!/bin/bash
# Run on the VPS as root: bash /opt/honeywatch/HoneyWatchApp/deploy/install-vps.sh
set -euo pipefail

APP_DIR="/opt/honeywatch/HoneyWatchApp"
VENV="/opt/honeywatch/venv"
DB="/opt/honeywatch/honeywatch.db"

if [[ ! -d "$APP_DIR/dashboard" ]]; then
  echo "Missing $APP_DIR/dashboard — copy or clone the repo first."
  exit 1
fi

if [[ ! -f "$DB" ]]; then
  echo "Warning: $DB not found. Dashboard will use mock data until the DB exists."
fi

apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$APP_DIR/requirements.txt"

install -m 644 "$APP_DIR/deploy/honeywatch-dashboard.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable honeywatch-dashboard
systemctl restart honeywatch-dashboard

echo ""
echo "Dashboard status:"
systemctl --no-pager status honeywatch-dashboard || true
echo ""
echo "Open: http://$(curl -s ifconfig.me 2>/dev/null || echo YOUR_VPS_IP):5000/"
echo "Restrict port 5000 in ufw to your IP — see deploy/VPS.md"
