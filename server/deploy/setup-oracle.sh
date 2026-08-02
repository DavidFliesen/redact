#!/usr/bin/env bash
# ============================================================
# Redact engine — one-time setup on an Oracle Cloud "Always Free"
# Ampere (ARM) instance running Ubuntu 22.04/24.04.
#
# Run it once, as a sudo-capable user, from inside the repo's
# server/ folder:  bash deploy/setup-oracle.sh
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="${SUDO_USER:-$USER}"

echo "==> Installing system packages"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-pip

echo "==> Creating virtualenv"
python3 -m venv "$APP_DIR/.venv"
# shellcheck disable=SC1091
source "$APP_DIR/.venv/bin/activate"
pip install --upgrade pip
pip install -r "$APP_DIR/requirements.txt"

echo "==> Installing Chromium for Playwright (plus its OS libraries)"
python -m playwright install --with-deps chromium

echo "==> Installing the systemd service"
sudo cp "$APP_DIR/deploy/redact-api.service" /etc/systemd/system/redact-api.service
sudo sed -i "s#__APP_DIR__#$APP_DIR#g; s#__USER__#$SERVICE_USER#g" /etc/systemd/system/redact-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now redact-api

echo "==> Opening the firewall for HTTP/HTTPS (Caddy will use these)"
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || true

cat <<'NEXT'

==> Engine is running on 127.0.0.1:8000 (behind the firewall).

Two things left:

1) Give it a public HTTPS address. The PWA is served over HTTPS by
   GitHub Pages, so the browser will refuse to call a plain-HTTP engine.
   The easy path is Caddy (automatic certificates):

     sudo apt-get install -y caddy
     sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
     sudo nano /etc/caddy/Caddyfile        # put in your domain + email
     sudo systemctl restart caddy

2) Lock down who can call it, then point the app at it:
     - set REDACT_ALLOW_ORIGIN in the service file to your Pages origin
       (e.g. https://davidfliesen.github.io) and: sudo systemctl restart redact-api
     - in the site, edit assets/js/config.js:
         window.REDACT_API_BASE = "https://your-engine-domain";

Smoke test first: start the service with REDACT_DEMO=1 to get a fake
"Demo Records" broker you can scan and clean without touching real sites.
NEXT

echo "==> Done."
