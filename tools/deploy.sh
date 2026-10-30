#!/usr/bin/env bash
# Upload the live single-file game to the VPS.
# Live at http://31.97.38.206/officehell/  (nginx site: /etc/nginx/sites-available/officehell)
#
# What ships is the committed "63_ Office Hell.html" at the repo root -- the file the team
# edits directly. It is NOT built from game/ any more: tools/bundle.py rebundles the older
# modular source into dist/63-office-hell.html, which has no co-op, bosses, touch or gamepad
# support, so deploying that output would roll production back. See README, "Two codebases".
set -euo pipefail
cd "$(dirname "$0")/.."
scp -o BatchMode=yes -q "63_ Office Hell.html" 63bits-vps:/var/www/officehell/index.html
echo "Deployed: http://31.97.38.206/officehell/"
