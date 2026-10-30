#!/usr/bin/env bash
# Rebuild the single-file game and upload it to the VPS.
# Live at http://31.97.38.206/officehell/  (nginx site: /etc/nginx/sites-available/officehell)
set -euo pipefail
cd "$(dirname "$0")/.."
py tools/bundle.py
scp -o BatchMode=yes -q "63_ Office Hell.html" 63bits-vps:/var/www/officehell/index.html
echo "Deployed: http://31.97.38.206/officehell/"
