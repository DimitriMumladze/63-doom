#!/usr/bin/env bash
# Rebuild the single-file game and upload it to the VPS.
# Live at http://31.97.38.206/officehell/  (nginx site: /etc/nginx/sites-available/officehell)
#
# The page carries every asset as a data URI except the boss music, which is linked
# (see LINKED in tools/bundle.py) and has to go up next to it.
set -euo pipefail
cd "$(dirname "$0")/.."
py tools/bundle.py
DEST=63bits-vps:/var/www/officehell
scp -o BatchMode=yes -q "63_ Office Hell.html" "$DEST/index.html"
ssh -o BatchMode=yes 63bits-vps mkdir -p /var/www/officehell/assets/music
scp -o BatchMode=yes -q assets/music/*.mp3 "$DEST/assets/music/"
echo "Deployed: http://31.97.38.206/officehell/"
