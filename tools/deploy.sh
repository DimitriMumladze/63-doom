#!/usr/bin/env bash
# Rebuild the single-file game and upload it.   bash tools/deploy.sh [--server]
# Live at http://31.97.38.206/officehell/  (nginx site: /etc/nginx/sites-available/officehell)
#
# The page carries every asset as a data URI except the boss music, which is linked
# (see LINKED in tools/bundle.py) and has to go up next to it.
#
# --server also uploads the match server and the rules it shares with the game
# (collide.js, weapons.js and the battle royale map -- see the top of server.js).
# It does NOT restart the service: this is a shared machine, so that is left to you:
#
#   sudo systemctl restart officehell && journalctl -u officehell -f
set -euo pipefail
cd "$(dirname "$0")/.."

py tools/bundle.py

HOST=63bits-vps
WEB=/var/www/officehell
SRV=/opt/officehell

scp -o BatchMode=yes -q "63_ Office Hell.html" "$HOST:$WEB/index.html"
ssh -o BatchMode=yes "$HOST" mkdir -p "$WEB/assets/music"
scp -o BatchMode=yes -q assets/music/*.mp3 "$HOST:$WEB/assets/music/"
echo "Deployed the page: http://31.97.38.206/officehell/"

if [ "${1:-}" = "--server" ]; then
  ssh -o BatchMode=yes "$HOST" mkdir -p "$SRV/game/js/maps"
  scp -o BatchMode=yes -q server.js "$HOST:$SRV/"
  scp -o BatchMode=yes -q game/js/collide.js game/js/weapons.js "$HOST:$SRV/game/js/"
  scp -o BatchMode=yes -q game/js/maps/yard.js "$HOST:$SRV/game/js/maps/"
  echo "Deployed the server to $SRV. Restart it yourself:"
  echo "  sudo systemctl restart officehell && journalctl -u officehell -f"
fi
