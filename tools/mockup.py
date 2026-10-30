"""Render a fake 320x200 in-game screenshot to judge the sprite in context."""
from pathlib import Path
import random

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SP = ROOT / "assets" / "sprites"
SW, SH = 320, 200
VIEW_H = 168
rnd = random.Random(7)

img = Image.new("RGB", (SW, SH))
d = ImageDraw.Draw(img)
hz = VIEW_H // 2
# ceiling / floor with distance darkening
for y in range(VIEW_H):
    k = abs(y - hz) / hz
    if y < hz:
        d.line((0, y, SW, y), fill=(int(40 + 30 * k), int(36 + 24 * k), int(34 + 20 * k)))
    else:
        d.line((0, y, SW, y), fill=(int(48 + 50 * k), int(38 + 36 * k), int(28 + 22 * k)))
# brick back wall
wall_top, wall_bot = hz - 46, hz + 30
for row, y in enumerate(range(wall_top, wall_bot, 8)):
    off = 0 if row % 2 else 10
    for x in range(-off, SW, 20):
        c = rnd.randint(70, 96)
        d.rectangle((x, y, x + 18, y + 6), fill=(c, int(c * 0.72), int(c * 0.55)))
# side walls (perspective trapezoids)
d.polygon([(0, 0), (60, wall_top), (60, wall_bot), (0, VIEW_H)], fill=(58, 46, 38))
d.polygon([(SW, 0), (SW - 60, wall_top), (SW - 60, wall_bot), (SW, VIEW_H)], fill=(50, 40, 34))
arr = np.asarray(img).astype(int)
arr[:VIEW_H] += np.random.default_rng(1).integers(-6, 7, (VIEW_H, SW, 1))
img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")


def put(name, cx, foot, scale):
    s = Image.open(SP / name)
    s = s.resize((max(1, round(s.width * scale)), max(1, round(s.height * scale))), Image.NEAREST)
    img.alpha_composite(s, (round(cx - s.width / 2), round(foot - s.height)))


put("brute_walk1.png", 92, hz + 34, 0.42)
put("brute_attack2.png", 236, hz + 52, 0.62)
put("brute_idle.png", 160, VIEW_H + 40, 1.0)
put("fireball_0.png", 196, hz + 6, 1.0)

# status bar
d = ImageDraw.Draw(img)
d.rectangle((0, VIEW_H, SW, SH), fill=(62, 60, 58))
d.line((0, VIEW_H, SW, VIEW_H), fill=(120, 116, 110))
face = Image.open(SP / "brute_face.png")
fx = SW // 2 - 15
d.rectangle((fx - 2, VIEW_H + 1, fx + 31, SH - 1), fill=(30, 28, 26))
img.alpha_composite(face.resize((29, 32), Image.LANCZOS), (fx + 1, VIEW_H + 1))
d.text((14, VIEW_H + 6), "AMMO 50", fill=(220, 40, 30))
d.text((14, VIEW_H + 18), "HEALTH 100%", fill=(220, 40, 30))
d.text((230, VIEW_H + 12), "KILLS 0/3", fill=(220, 40, 30))
img.convert("RGB").resize((SW * 3, SH * 3), Image.NEAREST).save(SP / "mockup_ingame.png")
print("ok")
