"""Paint first-person weapons, pickups and projectile/effect sprites.

Outputs:
  assets/weapons/<gun>_<n>.png   first-person views (200x150, bottom-anchored)
  assets/items/*.png             pickups
  assets/fx/*.png                projectiles, explosions, puffs
"""
from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw

import spritekit as sk
from spritekit import fill, poly_mask, ellipse_mask, rrect_mask, limb_mask, mul

ROOT = Path(__file__).resolve().parent.parent
WEP = ROOT / "assets" / "weapons"
ITEMS = ROOT / "assets" / "items"
FX = ROOT / "assets" / "fx"
for d in (WEP, ITEMS, FX):
    d.mkdir(parents=True, exist_ok=True)

SKIN = (206, 150, 118)
SLEEVE = (56, 56, 146)       # 63 purple jacket
MINT = (68, 218, 157)
METAL = (70, 72, 80)
DARK = (30, 30, 34)
WOOD = (120, 76, 40)
BLUED_ = (46, 48, 56)


def finish(hi, path, n=96, outline=True, factor=4):
    small = hi.resize((round(hi.width / factor), round(hi.height / factor)), Image.BOX)
    a = np.asarray(small.getchannel("A")) > 110
    rgb = small.convert("RGB").quantize(n, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    arr = np.zeros((small.height, small.width, 4), np.uint8)
    arr[..., :3] = np.asarray(rgb)
    arr[..., 3] = a * 255
    if outline:
        pad = np.pad(a, 1)
        ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~a
        arr[ring] = (*sk.OUTLINE, 255)
    Image.fromarray(arr).save(path)


# --------------------------------------------------------------------------
# first-person weapons (hi-res 800x600 -> 200x150)
# --------------------------------------------------------------------------
FW, FH = 800, 600
SZ = (FW, FH)


def arm(c, a, b, wa=150, wb=120):
    """Sleeve from off-screen bottom to the wrist, with a mint cuff stripe."""
    fill(c, SLEEVE, limb_mask(a, b, wa, wb, SZ), lo=0.5, hi=1.15)
    d = ImageDraw.Draw(c)
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln
    cx, cy = b[0] - dx / ln * 30, b[1] - dy / ln * 30
    d.line((cx + nx * wb / 2, cy + ny * wb / 2, cx - nx * wb / 2, cy - ny * wb / 2), fill=MINT, width=14)


def hand(c, cx, cy, w, h):
    fill(c, SKIN, rrect_mask((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), w * 0.3, SZ), lo=0.6, hi=1.2)
    d = ImageDraw.Draw(c)
    for i in range(1, 4):
        x = cx - w / 2 + w * i / 4
        d.line((x, cy - h * 0.1, x, cy + h * 0.45), fill=mul(SKIN, 0.6), width=4)


def pistol(frame):
    c = Image.new("RGBA", SZ)
    rec = 26 if frame == 1 else 0
    x = 470
    if frame == 1:
        b = sk.burst(260, sk.FIRE, seed=11)
        c.alpha_composite(b, (x - 130, 120 + rec))
    arm(c, (x + 120, FH + 80), (x + 10, 470 + rec))
    # slide seen from behind, slightly tapered by perspective
    fill(c, METAL, poly_mask([(x - 62, 470 + rec), (x + 62, 470 + rec), (x + 46, 250 + rec), (x - 46, 250 + rec)], SZ),
         lo=0.6, hi=1.3)
    d = ImageDraw.Draw(c)
    d.rectangle((x - 46, 250 + rec, x + 46, 268 + rec), fill=mul(METAL, 1.4))
    d.rectangle((x - 30, 236 + rec, x - 14, 256 + rec), fill=DARK)          # rear sight
    d.rectangle((x + 14, 236 + rec, x + 30, 256 + rec), fill=DARK)
    d.rectangle((x - 6, 226 + rec, x + 6, 250 + rec), fill=(240, 240, 240))  # front sight dot
    for k in range(5):
        d.line((x - 40, 300 + rec + k * 20, x + 40, 300 + rec + k * 20), fill=mul(METAL, 0.7), width=4)
    hand(c, x, 500 + rec, 170, 130)
    hand(c, x - 70, 540 + rec, 120, 110)
    return c


def shotgun(frame):
    c = Image.new("RGBA", SZ)
    x = 400
    rec = {0: 0, 1: 30, 2: 60}[frame]
    tilt = 40 if frame == 2 else 0
    if frame == 1:
        c.alpha_composite(sk.burst(340, sk.FIRE, seed=12), (x - 170, 40 + rec))
    arm(c, (x + 260, FH + 100), (x + 90, 520 + rec), 170, 140)
    pump_y = 330 + rec + (70 if frame == 2 else 0)
    arm(c, (x - 300, FH + 60), (x - 70 - tilt, pump_y + 40), 160, 130)
    # barrel + magazine tube, converging toward the top
    fill(c, METAL, poly_mask([(x - 60 - tilt, 560 + rec), (x + 60 - tilt, 560 + rec), (x + 26 - tilt, 180 + rec),
                              (x - 26 - tilt, 180 + rec)], SZ), lo=0.55, hi=1.35)
    d = ImageDraw.Draw(c)
    d.ellipse((x - 24 - tilt, 166 + rec, x + 24 - tilt, 200 + rec), fill=DARK)
    d.rectangle((x - 6 - tilt, 172 + rec, x + 6 - tilt, 180 + rec), fill=(230, 230, 230))
    fill(c, WOOD, rrect_mask((x - 80 - tilt, pump_y, x + 80 - tilt, pump_y + 110), 26, SZ), lo=0.55, hi=1.25)
    d = ImageDraw.Draw(c)
    for k in range(4):
        d.line((x - 70 - tilt, pump_y + 18 + k * 24, x + 70 - tilt, pump_y + 18 + k * 24), fill=mul(WOOD, 0.6), width=5)
    fill(c, WOOD, rrect_mask((x - 110, 520 + rec, x + 110, FH + 40), 40, SZ), lo=0.55, hi=1.2)
    hand(c, x - 70 - tilt, pump_y + 70, 150, 110)
    hand(c, x + 90, 560 + rec, 170, 130)
    return c


def chaingun(frame):
    c = Image.new("RGBA", SZ)
    x = 400
    rec = 14 if frame else 0
    if frame:
        c.alpha_composite(sk.burst(300, sk.FIRE, seed=13 + frame), (x - 150, 30 + rec))
    arm(c, (x + 290, FH + 100), (x + 150, 500 + rec), 170, 140)
    arm(c, (x - 290, FH + 100), (x - 150, 480 + rec), 170, 140)
    fill(c, METAL, rrect_mask((x - 170, 330 + rec, x + 170, FH + 40), 40, SZ), lo=0.5, hi=1.25)
    fill(c, mul(METAL, 0.8), poly_mask([(x - 110, 360 + rec), (x + 110, 360 + rec), (x + 70, 170 + rec), (x - 70, 170 + rec)], SZ),
         lo=0.5, hi=1.3)
    d = ImageDraw.Draw(c)
    rot = frame * math.pi / 6
    for k in range(6):
        a = rot + k * math.pi / 3
        bx, by = x + math.cos(a) * 46, 200 + rec + math.sin(a) * 26
        d.ellipse((bx - 18, by - 14, bx + 18, by + 14), fill=(50, 50, 56))
        d.ellipse((bx - 9, by - 7, bx + 9, by + 7), fill=(8, 8, 8))
    d.rectangle((x - 150, 420 + rec, x + 150, 436 + rec), fill=MINT)
    hand(c, x - 150, 520 + rec, 150, 120)
    hand(c, x + 150, 540 + rec, 150, 120)
    return c


# --------------------------------------------------------------------------
# pickups
# --------------------------------------------------------------------------
def item(w, h):
    return Image.new("RGBA", (w * 4, h * 4)), (w * 4, h * 4)


def medkit():
    c, s = item(32, 24)
    fill(c, (236, 236, 232), rrect_mask((4, 16, s[0] - 4, s[1] - 4), 12, s), lo=0.65, hi=1.2)
    d = ImageDraw.Draw(c)
    d.rectangle((s[0] / 2 - 10, 28, s[0] / 2 + 10, s[1] - 16), fill=(210, 30, 30))
    d.rectangle((s[0] / 2 - 30, s[1] / 2 - 4, s[0] / 2 + 30, s[1] / 2 + 16), fill=(210, 30, 30))
    d.rectangle((s[0] / 2 - 18, 4, s[0] / 2 + 18, 18), outline=(120, 120, 120), width=5)
    return c


def coffee():
    c, s = item(16, 22)
    fill(c, (240, 240, 236), poly_mask([(8, 20), (s[0] - 8, 20), (s[0] - 14, s[1] - 4), (14, s[1] - 4)], s), lo=0.6, hi=1.2)
    d = ImageDraw.Draw(c)
    d.rectangle((10, 40, s[0] - 10, 58), fill=MINT)
    d.rectangle((8, 8, s[0] - 8, 22), fill=(60, 40, 30))
    for k in range(2):
        d.line((24 + k * 16, 6, 30 + k * 16, -20), fill=(220, 220, 220), width=3)
    return c


def clip():
    c, s = item(16, 14)
    fill(c, (70, 80, 60), rrect_mask((4, 10, s[0] - 4, s[1] - 2), 6, s), lo=0.6, hi=1.3)
    d = ImageDraw.Draw(c)
    for k in range(4):
        d.rectangle((10 + k * 11, 2, 16 + k * 11, 14), fill=(220, 180, 70))
    return c


def shells():
    c, s = item(24, 16)
    fill(c, (150, 40, 30), rrect_mask((4, 18, s[0] - 4, s[1] - 2), 6, s), lo=0.6, hi=1.3)
    d = ImageDraw.Draw(c)
    for k in range(6):
        d.rectangle((10 + k * 14, 4, 20 + k * 14, 22), fill=(200, 40, 30))
        d.rectangle((10 + k * 14, 18, 20 + k * 14, 24), fill=(220, 180, 70))
    return c


def armor():
    c, s = item(32, 28)
    m = poly_mask([(20, 10), (44, 10), (64, 26), (84, 10), (108, 10), (116, 40), (104, 108), (24, 108), (12, 40)], s)
    fill(c, (60, 140, 80), m, lo=0.55, hi=1.25)
    d = ImageDraw.Draw(c)
    d.line((64, 26, 64, 104), fill=(30, 80, 40), width=4)
    d.rectangle((30, 60, 98, 70), fill=(40, 100, 56))
    return c


def gun_pickup(kind):
    w, h = (56, 18) if kind == "shotgun" else (56, 22)
    c, s = item(w, h)
    d = ImageDraw.Draw(c)
    if kind == "shotgun":
        d.rounded_rectangle((70, 20, s[0] - 6, 40), 6, fill=METAL)
        d.rounded_rectangle((4, 24, 90, 64), 14, fill=WOOD)
        d.rounded_rectangle((120, 36, 170, 56), 8, fill=WOOD)
    else:
        d.rounded_rectangle((40, 20, 170, 76), 12, fill=METAL)
        for k in range(3):
            d.rectangle((150, 24 + k * 16, s[0] - 4, 34 + k * 16), fill=(50, 50, 56))
        d.rectangle((60, 40, 140, 48), fill=MINT)
        d.rectangle((70, 76, 96, 86), fill=DARK)
    return c


# --------------------------------------------------------------------------
# projectiles + effects
# --------------------------------------------------------------------------
def fx_ball(size, colors, seed):
    hi = sk.burst(size * 4, colors, seed=seed)
    return hi


def rocket(frame):
    s = 20 * 4
    c = Image.new("RGBA", (s, s))
    c.alpha_composite(sk.burst(s, sk.FIRE, seed=40 + frame), (0, 0))
    d = ImageDraw.Draw(c)
    d.ellipse((s / 2 - 18, s / 2 - 18, s / 2 + 18, s / 2 + 18), fill=(80, 84, 60))
    d.ellipse((s / 2 - 8, s / 2 - 10, s / 2 + 6, s / 2 + 2), fill=(150, 154, 120))
    return c


def puff(frame, colors):
    s = 12 * 4
    c = Image.new("RGBA", (s, s))
    r = [10, 16, 20][frame]
    d = ImageDraw.Draw(c)
    d.ellipse((s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r), fill=colors[min(frame, len(colors) - 1)])
    if frame < 2:
        d.ellipse((s / 2 - r / 2, s / 2 - r / 2, s / 2 + r / 2, s / 2 + r / 2), fill=colors[0])
    return c


def side_pickup(kind):
    """Side view of a gun lying on the floor."""
    c, s = item(60, 22)
    d = ImageDraw.Draw(c)
    if kind == "rifle":
        d.rectangle((60, 22, 200, 46), fill=(64, 66, 60)); d.rectangle((196, 30, 236, 38), fill=BLUED_)
        d.polygon([(4, 30), (64, 24), (64, 52), (10, 64)], fill=(36, 37, 40))
        d.polygon([(100, 46), (124, 46), (118, 84), (96, 82)], fill=(50, 52, 50))
        d.rectangle((80, 14, 150, 22), fill=(34, 36, 34))
    elif kind == "dbshotgun":
        d.rectangle((90, 24, 236, 34), fill=BLUED_); d.rectangle((90, 36, 236, 44), fill=BLUED_)
        d.rectangle((80, 22, 110, 48), fill=(150, 152, 158))
        d.polygon([(4, 40), (84, 26), (86, 52), (12, 74)], fill=WOOD)
    elif kind == "rocketl":
        d.rounded_rectangle((20, 20, 236, 58), 12, fill=(86, 92, 60))
        d.rectangle((100, 58, 120, 82), fill=(30, 30, 32)); d.rectangle((60, 6, 110, 20), fill=(30, 30, 32))
        d.ellipse((222, 20, 240, 58), fill=(16, 16, 14))
    elif kind == "plasmagun":
        d.rounded_rectangle((20, 18, 220, 60), 14, fill=(54, 54, 96))
        for k in range(4):
            d.rectangle((120 + k * 24, 22, 130 + k * 24, 56), fill=MINT)
        d.rectangle((70, 60, 92, 84), fill=(30, 30, 40)); d.ellipse((212, 26, 236, 52), fill=MINT)
    return c


def ammo_box(kind):
    c, s = item(22, 18)
    d = ImageDraw.Draw(c)
    if kind == "rockets":
        fill(c, (70, 76, 50), rrect_mask((4, 30, s[0] - 4, s[1] - 2), 6, s), lo=0.6, hi=1.3)
        for k in range(3):
            d.ellipse((10 + k * 26, 6, 32 + k * 26, 36), fill=(110, 124, 80))
    else:
        fill(c, (54, 54, 96), rrect_mask((10, 14, s[0] - 10, s[1] - 2), 10, s), lo=0.6, hi=1.3)
        d.rectangle((24, 30, s[0] - 24, 46), fill=MINT)
        d.rectangle((30, 4, s[0] - 30, 16), fill=(90, 90, 110))
    return c


def main():
    import fp_weapons
    for name, (painter, n) in fp_weapons.GUNS.items():
        for i in range(n):
            finish(painter(i), WEP / f"{name}_{i}.png", n=128, factor=4.8)
    for k in ("rifle", "dbshotgun", "rocketl", "plasmagun"):
        finish(side_pickup(k), ITEMS / f"{k}.png")
    for k in ("rockets", "cells"):
        finish(ammo_box(k), ITEMS / f"{k}.png")

    finish(medkit(), ITEMS / "medkit.png")
    finish(coffee(), ITEMS / "coffee.png")
    finish(clip(), ITEMS / "clip.png")
    finish(shells(), ITEMS / "shells.png")
    finish(armor(), ITEMS / "armor.png")
    finish(gun_pickup("shotgun"), ITEMS / "shotgun.png")
    finish(gun_pickup("chaingun"), ITEMS / "chaingun.png")

    for i in range(2):
        finish(fx_ball(24, sk.FIRE, 50 + i), FX / f"fireball_{i}.png", outline=False)
        finish(fx_ball(20, sk.PLASMA, 60 + i), FX / f"plasma_{i}.png", outline=False)
        finish(rocket(i), FX / f"rocket_{i}.png", outline=False)
    for i, sz in enumerate((28, 44, 56)):
        b = sk.burst(sz * 4, sk.FIRE, seed=70 + i)
        c = Image.new("RGBA", (56 * 4, 56 * 4))
        c.alpha_composite(b, ((224 - sz * 4) // 2, (224 - sz * 4) // 2))
        finish(c, FX / f"explode_{i}.png", outline=False)
        p = Image.new("RGBA", (40 * 4, 40 * 4))
        pb = sk.burst([60, 110, 150][i], sk.PLASMA, seed=80 + i)
        p.alpha_composite(pb, ((160 - pb.width) // 2, (160 - pb.width) // 2))
        finish(p, FX / f"zap_{i}.png", outline=False)
    for i in range(3):
        finish(puff(i, [(255, 240, 180), (200, 190, 170), (140, 136, 130)]), FX / f"puff_{i}.png", outline=False)
        finish(puff(i, [(230, 40, 30), (170, 10, 10), (110, 0, 0)]), FX / f"blood_{i}.png", outline=False)
    # title logo: the real 63 logo, pixelated
    logo = Image.open(ROOT / "assets" / "source" / "logo63.jpg").convert("RGB")
    logo.resize((96, 96), Image.LANCZOS).quantize(16, dither=Image.Dither.NONE).convert("RGB").save(ITEMS / "logo63.png")
    print("ok")


if __name__ == "__main__":
    main()
