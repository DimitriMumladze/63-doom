"""Split a shipped single-file build back into the modular source: the inverse of bundle.py.

Reads the self-contained HTML (default: "63_ Office Hell.html"), then writes

  game/index.html   the markup, with <script src="js/*.js"> tags back in place
  game/js/*.js      one file per inlined <script> block, in MODULES order
  assets/<key>      every file embedded in window.EMBED, decoded

This exists because the single file was edited directly for a while and became the only
copy of several features and ~119 assets. Run it only when a shipped file is ahead of
game/ again; the normal direction is tools/bundle.py.
"""
from pathlib import Path
import base64
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
ASSETS = ROOT / "assets"

# Assets bundle.py links instead of embedding (see its LINKED) are not in a build and
# so cannot be recovered from one; they live in the repo under assets/.
#
# The inlined <script> blocks, in the order bundle.py emits them (EMBED is handled apart).
MODULES = ["assets", "engine", "level", "maps/office", "audio", "settings", "game", "net",
           "hud", "main"]


def main(src=ROOT / "63_ Office Hell.html"):
    html = Path(src).read_text(encoding="utf-8")

    embed_re = re.compile(r"<script>window\.EMBED = (\{.*?\});</script>\n", re.S)
    m = embed_re.search(html)
    if not m:
        sys.exit("no window.EMBED block found -- is this a bundled build?")
    embed = json.loads(m.group(1))

    wrote = 0
    for key, uri in embed.items():
        out = ASSETS / key
        raw = base64.b64decode(uri.split(",", 1)[1])
        if out.exists() and out.read_bytes() == raw:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(raw)
        wrote += 1
    print(f"assets: {len(embed)} embedded, {wrote} written, {len(embed) - wrote} already identical")

    html = embed_re.sub("", html, count=1)

    blocks = list(re.finditer(r"<script>\n(.*?)\n</script>", html, re.S))
    if len(blocks) != len(MODULES):
        sys.exit(f"found {len(blocks)} script blocks, expected {len(MODULES)}: {MODULES}")

    (GAME / "js").mkdir(parents=True, exist_ok=True)
    for name, b in zip(MODULES, blocks):
        # group(1) already ends with the module's own newline; bundle.py adds the framing one
        src_text = b.group(1).replace(r"<\/script", "</script")
        out = GAME / "js" / f"{name}.js"
        out.parent.mkdir(parents=True, exist_ok=True)   # js/maps/ and friends
        out.write_text(src_text, encoding="utf-8")
        print(f"  game/js/{name}.js  {len(src_text):>7,} bytes")

    # markup only, with the <script src> tags restored
    out, last = [], 0
    for name, b in zip(MODULES, blocks):
        out.append(html[last:b.start()])
        out.append(f'<script src="js/{name}.js"></script>')
        last = b.end()
    out.append(html[last:])
    (GAME / "index.html").write_text("".join(out), encoding="utf-8")
    print(f"game/index.html  {sum(len(s) for s in out):,} bytes")


if __name__ == "__main__":
    main(*sys.argv[1:])
