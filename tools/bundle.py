"""Bundle the game into one self-contained HTML file: dist/63-office-hell.html.

Inlines every <script src> and embeds every PNG under assets/ as a data URI
(window.EMBED), so the file opens straight from disk and can be shared.
"""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

DIRS = ["textures", "props", "chars", "weapons", "items", "fx"]


def main():
    crew = re.search(r"const CREW = \[([^\]]*)\]", (GAME / "js" / "assets.js").read_text(encoding="utf-8")).group(1)
    crew = re.findall(r"'(\w+)'", crew)
    embed = {}
    for d in DIRS:
        for f in sorted((ASSETS / d).rglob("*.png")):
            rel = f.relative_to(ASSETS).as_posix()
            # skip debug strips/previews: only chars/<id>/<frame>.png are game assets
            if rel.startswith("textures/_") or (d == "chars" and rel.count("/") < 2):
                continue
            if d == "chars" and rel.split("/")[1] not in crew:
                continue
            embed[rel] = "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode()

    html = (GAME / "index.html").read_text(encoding="utf-8")

    def inline(m):
        src = (GAME / m.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + src.replace("</script", "<\\/script") + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    head = "<script>window.EMBED = " + json.dumps(embed, separators=(",", ":")) + ";</script>\n"
    html = html.replace("<script>", head + "<script>", 1)
    out = DIST / "63-office-hell.html"
    out.write_text(html, encoding="utf-8")
    print(f"{out}  {out.stat().st_size / 1e6:.1f} MB, {len(embed)} images")


if __name__ == "__main__":
    main()
