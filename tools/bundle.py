"""Bundle the game into the single self-contained file the project ships.

Inlines every <script src> and embeds every asset under assets/ as a data URI
(window.EMBED), so the file opens straight from disk and can be shared.

tools/unbundle.py is the inverse, for when a shipped file is ahead of game/.
"""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
ASSETS = ROOT / "assets"
OUT = ROOT / "63_ Office Hell.html"

DIRS = ["textures", "props", "chars", "weapons", "items", "fx", "music", "fonts"]
MIME = {".png": "image/png", ".mp3": "audio/mpeg", ".ttf": "font/ttf"}

# Not embedded: served from assets/ next to the page instead (see assetUrl() in
# assets.js). The two boss songs are 5.3 MB of 7.5 MB -- embedding them tripled the
# page for two tracks most players never hear, and the art budget needs the room.
# deploy.sh uploads these; opened straight from disk they are simply silent.
LINKED = ["music"]

# chars/<id>/ folders that are not crew: the street NPCs, loaded the same way.
EXTRA_CHARS = ["npc"]


def main():
    crew = re.search(r"const CREW = \[([^\]]*)\]", (GAME / "js" / "assets.js").read_text(encoding="utf-8")).group(1)
    crew = re.findall(r"'(\w+)'", crew) + EXTRA_CHARS
    embed, linked = {}, []
    for d in DIRS:
        for f in sorted((ASSETS / d).rglob("*")):
            if not f.is_file() or f.suffix not in MIME:
                continue
            rel = f.relative_to(ASSETS).as_posix()
            # skip debug strips/previews: only chars/<id>/<frame>.png are game assets
            if rel.startswith("textures/_") or (d == "chars" and rel.count("/") < 2):
                continue
            if d == "chars" and rel.split("/")[1] not in crew:
                continue
            if d in LINKED:
                linked.append(rel)
                continue
            embed[rel] = f"data:{MIME[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()

    html = (GAME / "index.html").read_text(encoding="utf-8")

    def inline(m):
        src = (GAME / m.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + src.replace("</script", r"<\/script") + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    head = "<script>window.EMBED = " + json.dumps(embed, separators=(",", ":")) + ";</script>\n"
    html = html.replace("<script>", head + "<script>", 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.name}  {OUT.stat().st_size / 1e6:.1f} MB, {len(embed)} assets embedded")
    if linked:
        mb = sum((ASSETS / r).stat().st_size for r in linked) / 1e6
        print(f"  plus {len(linked)} linked ({mb:.1f} MB): upload assets/ alongside -- " + ", ".join(linked))


if __name__ == "__main__":
    main()
