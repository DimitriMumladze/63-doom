"""Realistic first-person hands and guns (detailed pixel art).

Each gun is painted at 4x (960x680) and reduced to 240x170 by
make_items.finish(). Guns are seen from behind the shooter and converge
toward the screen centre; hands have separate fingers, knuckles and nails;
sleeves are the purple 63 jacket with a mint cuff stripe.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw

import spritekit as sk
from spritekit import poly_mask, ellipse_mask, rrect_mask, limb_mask, mul

FW, FH = 960, 680
SZ = (FW, FH)
CXV = FW // 2

SKIN = (212, 158, 126)
SKIN_HI = (240, 196, 168)
SKIN_LO = (140, 92, 70)
CREASE = (118, 72, 54)
NAIL = (236, 200, 186)
SLEEVE = (58, 56, 150)
MINT = (68, 218, 157)
STEEL = (78, 82, 90)
BLUED = (46, 48, 56)
POLY = (36, 37, 40)
WALNUT = (112, 64, 32)
BRASS = (196, 156, 72)
OLIVE = (86, 92, 60)


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
def material(c, mask, base, kind="metal", spec_x=-0.35, seed=0, hi=1.15, lo=0.45):
    """Shade `mask` like metal (gradient + specular band), wood (grain) or
    polymer (stipple)."""
    box = mask.getbbox()
    if not box:
        return
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    gx = np.linspace(-1, 1, w)[None, :].repeat(h, 0)
    gy = np.linspace(0, 1, h)[:, None].repeat(w, 1)
    f = lo + (hi - lo) * np.clip(1 - 0.6 * gx ** 2 - 0.25 * gx, 0, 1)
    f *= 0.92 + 0.12 * (1 - gy)
    arr = np.empty((h, w, 3))
    arr[:] = base
    rng = np.random.default_rng(seed)
    if kind == "metal":
        spec = np.exp(-((gx - spec_x) / 0.10) ** 2) * 110 + np.exp(-((gx - 0.55) / 0.05) ** 2) * 35
        arr = arr * f[..., None] + spec[..., None]
        arr += rng.normal(0, 2.5, (h, w, 1))
    elif kind == "wood":
        warp = np.sin(gy * 9 + rng.uniform(0, 6)) * 0.08
        grain = np.sin((gx + warp) * 46 + np.sin(gy * 23) * 1.4)
        arr = arr * f[..., None] * (0.9 + 0.12 * grain[..., None])
        arr += np.exp(-((gx - spec_x) / 0.18) ** 2)[..., None] * 40
    elif kind == "polymer":
        arr = arr * f[..., None] + rng.normal(0, 5, (h, w, 1))
        arr += np.exp(-((gx - spec_x) / 0.14) ** 2)[..., None] * 30
    elif kind == "cloth":
        folds = np.sin(gx * 7 + gy * 5) * 0.08 + np.sin(gy * 17 - gx * 3) * 0.05
        arr = arr * (f * (1 + folds))[..., None] + rng.normal(0, 3, (h, w, 1))
    elif kind == "glow":
        arr = arr * (0.85 + 0.35 * (1 - np.abs(gx)))[..., None]
    part = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    part.putalpha(mask.crop(box))
    out = Image.new("RGBA", SZ)
    out.paste(part, (x0, y0))
    c.alpha_composite(out)


def taper(cxb, yb, wb, cxt, yt, wt):
    """Trapezoid from a bottom edge (centre, y, width) to a top edge."""
    return [(cxb - wb / 2, yb), (cxb + wb / 2, yb), (cxt + wt / 2, yt), (cxt - wt / 2, yt)]


def flash(c, x, y, size, seed, colors=sk.FIRE):
    b = sk.burst(int(size), colors, seed=seed)
    c.alpha_composite(b, (int(x - size / 2), int(y - size / 2)))


# --------------------------------------------------------------------------
# hands and sleeves
# --------------------------------------------------------------------------
def _hand_canvas(s, thumb=True, tips=True):
    """Right hand gripping something on its LEFT, seen from behind: the back of
    the hand on the right, short curled fingers wrapping onto the object, and
    the thumb lying forward along it."""
    W = H = int(260 * s)
    c = Image.new("RGBA", (W, H))
    size = (W, H)
    bx0, by0, bx1, by1 = 110 * s, 70 * s, 220 * s, 230 * s
    fh = 30 * s
    for i in range(4):                                   # curled fingers
        fy = 92 * s + i * (fh + 3 * s)
        L = (58 - abs(i - 1.2) * 6) * s
        fx1 = bx0 + 22 * s
        fx0 = fx1 - L
        m = rrect_mask((fx0, fy, fx1, fy + fh), fh * 0.5, size)
        lay = Image.new("RGBA", size)
        sk.fill(lay, SKIN, m, light=(0.3, -0.8), lo=0.58, hi=1.12, curve=0.25)
        d = ImageDraw.Draw(lay)
        d.line((fx0 + L * 0.45, fy + 4 * s, fx0 + L * 0.45, fy + fh - 4 * s), fill=CREASE, width=max(2, int(2.5 * s)))
        d.ellipse((fx1 - 18 * s, fy + 3 * s, fx1 - 4 * s, fy + 12 * s), fill=SKIN_HI)
        if tips:
            d.chord((fx0 + 2 * s, fy + 5 * s, fx0 + 18 * s, fy + fh - 5 * s), 90, 270, fill=NAIL)
        c.alpha_composite(lay)
    m = rrect_mask((bx0, by0, bx1, by1), 40 * s, size)   # back of the hand
    sk.fill(c, SKIN, m, light=(0.4, -0.6), lo=0.58, hi=1.15, curve=0.55)
    d = ImageDraw.Draw(c)
    for i in range(4):                                   # knuckles + tendons
        ky = 96 * s + i * (fh + 3 * s)
        d.ellipse((bx0 - 4 * s, ky, bx0 + 20 * s, ky + 22 * s), fill=mul(SKIN, 1.08))
        d.line((bx0 + 20 * s, ky + 12 * s, bx1 - 26 * s, ky + 34 * s), fill=mul(SKIN, 0.88), width=max(2, int(3 * s)))
    if thumb:                                            # thumb along the gun
        tb, tt = (bx0 + 34 * s, by0 + 44 * s), (bx0 - 4 * s, 26 * s)
        sk.fill(c, SKIN, limb_mask(tb, tt, 62 * s, 34 * s, size), light=(0.6, 0.0), lo=0.6, hi=1.18)
        d = ImageDraw.Draw(c)
        d.ellipse((tt[0] - 12 * s, tt[1] - 6 * s, tt[0] + 10 * s, tt[1] + 16 * s), fill=NAIL)
        d.line((tb[0] - 30 * s, tb[1] - 40 * s, tb[0] - 6 * s, tb[1] - 44 * s), fill=CREASE, width=max(2, int(2.5 * s)))
    return c


def wrist(x, y, s, rot, mirror):
    dx, dy = 70 * s, 92 * s
    if mirror:
        dx = -dx
    t = math.radians(rot)
    return x + dx * math.cos(t) + dy * math.sin(t), y - dx * math.sin(t) + dy * math.cos(t)


def arm(c, x, y, s=0.8, rot=0, mirror=False, tips=True, thumb=False):
    """Sleeve from the bottom corner to the wrist, then the gripping hand."""
    wx, wy = wrist(x, y, s, rot, mirror)
    corner = (wx - 240, FH + 170) if mirror else (wx + 220, FH + 170)
    sleeve(c, corner, (wx, wy), 190, 104)
    hand(c, x, y, s, rot, mirror, thumb=thumb, tips=tips)


def hand(c, x, y, s=1.0, rot=0, mirror=False, thumb=True, tips=True):
    """Paste a gripping hand centred at (x, y)."""
    h = _hand_canvas(s, thumb, tips)
    if mirror:
        h = h.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        h = h.rotate(rot, resample=Image.BICUBIC, expand=True)
    c.alpha_composite(h, (int(x - h.width / 2), int(y - h.height / 2)))


def sleeve(c, a, b, wa=230, wb=150):
    """Jacket sleeve from off-screen (a) to the wrist (b) with cuff + stripe."""
    m = limb_mask(a, b, wa, wb, SZ)
    material(c, m, SLEEVE, "cloth", seed=abs(int(a[0])))
    d = ImageDraw.Draw(c)
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy)
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux
    for k in (0.35, 0.6):
        px, py = a[0] + dx * k, a[1] + dy * k
        d.line((px - nx * wb * 0.35, py - ny * wb * 0.35, px + nx * wb * 0.1 + ux * 40, py + ny * wb * 0.1 + uy * 40),
               fill=mul(SLEEVE, 0.6), width=7)
    cx, cy = b[0] - ux * 34, b[1] - uy * 34
    cuff = limb_mask((cx - ux * 30, cy - uy * 30), (b[0], b[1]), wb * 1.02, wb * 0.96, SZ)
    material(c, cuff, mul(SLEEVE, 0.75), "cloth", seed=3)
    d = ImageDraw.Draw(c)
    d.line((cx - ux * 36 + nx * wb * 0.52, cy - uy * 36 + ny * wb * 0.52,
            cx - ux * 36 - nx * wb * 0.52, cy - uy * 36 - ny * wb * 0.52), fill=MINT, width=12)


# --------------------------------------------------------------------------
# guns
# --------------------------------------------------------------------------
def pistol(frame):
    """Glock-style pistol, two-handed grip, slightly right of centre."""
    c = Image.new("RGBA", SZ)
    r = 30 if frame == 1 else 0
    x = 560
    if frame == 1:
        flash(c, x - 20, 230 + r, 320, seed=11)
    material(c, poly_mask(taper(x - 10, FH + 10, 150, x - 14, 500 + r, 130), SZ), POLY, "polymer")      # grip
    material(c, poly_mask(taper(x - 10, 520 + r, 200, x - 24, 320 + r, 122), SZ), BLUED, "metal", spec_x=-0.5)
    d = ImageDraw.Draw(c)
    for k in range(8):                                   # rear serrations
        yy = 508 + r - k * 10
        d.line((x - 106 + k * 2, yy, x - 80 + k * 2, yy), fill=(20, 20, 24), width=3)
        d.line((x + 66 - k * 2.5, yy, x + 84 - k * 2.5, yy), fill=(20, 20, 24), width=3)
    d.polygon([(x - 86, 530 + r), (x + 66, 530 + r), (x + 58, 506 + r), (x - 78, 506 + r)], fill=(26, 26, 30))
    d.rectangle((x - 80, 306 + r, x - 36, 336 + r), fill=(22, 22, 26))      # rear sight
    d.rectangle((x - 6, 306 + r, x + 38, 336 + r), fill=(22, 22, 26))
    d.ellipse((x - 66, 314 + r, x - 52, 328 + r), fill=(235, 235, 230))
    d.ellipse((x + 10, 314 + r, x + 24, 328 + r), fill=(235, 235, 230))
    d.rectangle((x - 30, 286 + r, x - 12, 320 + r), fill=(22, 22, 26))      # front sight
    d.ellipse((x - 27, 290 + r, x - 15, 302 + r), fill=(240, 240, 236))
    arm(c, x - 84, 556 + r, 0.8, rot=6, mirror=True, thumb=True)
    arm(c, x + 62, 540 + r, 0.8, rot=-4, tips=False)
    return c


def long_gun_hands(c, rx, ry, lx, ly, r, ls=1.0, rs=1.0, lrot=-58, rrot=-14):
    arm(c, lx, ly, 0.8 * ls, lrot, mirror=True)
    arm(c, rx, ry, 0.8 * rs, rrot, tips=False)


def shotgun(frame):
    """Pump shotgun: barrel over magazine tube, ribbed pump, walnut furniture."""
    c = Image.new("RGBA", SZ)
    r = {0: 0, 1: 34, 2: 50}[frame]
    pump = 80 if frame == 2 else 0
    x = 470
    if frame == 1:
        flash(c, x, 160 + r, 400, seed=12)
    # receiver + stock (bottom), barrel + tube converging up
    material(c, poly_mask(taper(x + 70, FH + 40, 260, x + 40, 560 + r, 210), SZ), WALNUT, "wood", seed=1)
    material(c, poly_mask(taper(x + 20, 580 + r, 190, x + 6, 430 + r, 150), SZ), BLUED, "metal")
    material(c, poly_mask(taper(x + 6, 450 + r, 54, x, 180 + r, 26), SZ), BLUED, "metal", spec_x=-0.45)
    material(c, poly_mask(taper(x + 6, 470 + r, 48, x + 2, 240 + r, 24), SZ), STEEL, "metal")
    d = ImageDraw.Draw(c)
    d.ellipse((x - 14, 168 + r, x + 14, 194 + r), fill=(10, 10, 12))          # muzzle
    d.ellipse((x - 5, 158 + r, x + 5, 168 + r), fill=(230, 220, 190))         # bead sight
    # ribbed pump
    py = 360 + r + pump
    material(c, rrect_mask((x - 72, py, x + 80, py + 130), 30, SZ), (54, 40, 30), "polymer", seed=2)
    d = ImageDraw.Draw(c)
    for k in range(6):
        d.line((x - 66, py + 14 + k * 20, x + 74, py + 14 + k * 20), fill=(28, 22, 18), width=6)
    long_gun_hands(c, x + 150, 556 + r, x - 40, py + 56, r)
    return c


def dbshotgun(frame):
    """Side-by-side double barrel; frame 2 = broken open with shells loading."""
    c = Image.new("RGBA", SZ)
    r = {0: 0, 1: 44, 2: 70}[frame]
    x = 480
    if frame == 1:
        flash(c, x - 30, 190 + r, 380, seed=21)
        flash(c, x + 30, 190 + r, 380, seed=22)
    material(c, poly_mask(taper(x + 60, FH + 40, 300, x + 30, 560 + r, 230), SZ), WALNUT, "wood", seed=3)
    # silver engraved receiver
    material(c, poly_mask(taper(x + 20, 590 + r, 230, x + 8, 470 + r, 190), SZ), (150, 152, 158), "metal", spec_x=-0.3)
    d = ImageDraw.Draw(c)
    for k in range(5):
        d.arc((x - 70 + k * 30, 500 + r, x - 30 + k * 30, 540 + r), 0, 180, fill=(110, 112, 118), width=3)
    if frame == 2:
        # barrels dropped: we look into the two chambers, shells going in
        for bx in (x - 46, x + 46):
            d.ellipse((bx - 40, 420 + r, bx + 40, 480 + r), fill=BLUED)
            d.ellipse((bx - 28, 430 + r, bx + 28, 470 + r), fill=(12, 12, 14))
        d.ellipse((x + 18, 426 + r, x + 74, 474 + r), fill=BRASS)
        d.ellipse((x + 34, 440 + r, x + 58, 460 + r), fill=(150, 110, 50))
        long_gun_hands(c, x + 170, 560 + r, x + 50, 440 + r, r, ls=0.9, lrot=-20)
        return c
    for bx, tx in ((x - 30, x - 16), (x + 30, x + 16)):
        material(c, poly_mask(taper(bx, 480 + r, 64, tx, 200 + r, 32), SZ), BLUED, "metal", spec_x=-0.4)
    d = ImageDraw.Draw(c)
    d.polygon(taper(x, 480 + r, 14, x, 200 + r, 6), fill=(30, 30, 34))       # rib
    for tx in (x - 16, x + 16):
        d.ellipse((tx - 15, 190 + r, tx + 15, 212 + r), fill=(10, 10, 12))
    material(c, rrect_mask((x - 96, 390 + r, x + 96, 500 + r), 34, SZ), WALNUT, "wood", seed=4)
    long_gun_hands(c, x + 170, 560 + r, x - 40, 430 + r, r)
    return c


def chaingun(frame):
    """Rotary gun: six barrels with clamp rings, motor housing, carry handle."""
    c = Image.new("RGBA", SZ)
    r = 18 if frame else 0
    x = 480
    if frame:
        flash(c, x, 170 + r, 360, seed=30 + frame)
    material(c, rrect_mask((x - 200, 430 + r, x + 200, FH + 60), 50, SZ), (60, 62, 68), "metal", spec_x=-0.5)
    material(c, poly_mask(taper(x, 450 + r, 230, x, 200 + r, 120), SZ), (52, 54, 60), "metal")
    d = ImageDraw.Draw(c)
    rot = frame * math.pi / 6
    for k in range(6):
        a = rot + k * math.pi / 3
        bx, by = x + math.cos(a) * 46, 214 + r + math.sin(a) * 26
        d.ellipse((bx - 22, by - 16, bx + 22, by + 16), fill=(70, 72, 80))
        d.ellipse((bx - 11, by - 8, bx + 11, by + 8), fill=(8, 8, 8))
    for ry in (300, 380):
        d.rounded_rectangle((x - 104 + (ry - 300) * 0.2, ry + r, x + 104 - (ry - 300) * 0.2, ry + 18 + r), 6,
                            fill=(90, 92, 100))
    d.rounded_rectangle((x - 90, 410 + r, x + 90, 440 + r), 10, fill=(30, 30, 34))   # carry handle
    d.rectangle((x - 180, 520 + r, x + 180, 532 + r), fill=MINT)
    long_gun_hands(c, x + 214, 556 + r, x - 214, 540 + r, r, lrot=-24, rrot=-18)
    return c


def rifle(frame):
    """M4-style carbine: railed upper, front sight post, handguard, magazine."""
    c = Image.new("RGBA", SZ)
    r = {0: 0, 1: 22, 2: 12}[frame]
    x = 500
    if frame:
        flash(c, x - 8, 168 + r, 300, seed=40 + frame)
    material(c, poly_mask(taper(x + 50, FH + 40, 230, x + 30, 560 + r, 170), SZ), POLY, "polymer", seed=5)  # stock
    material(c, poly_mask(taper(x + 20, 590 + r, 160, x + 6, 420 + r, 120), SZ), (64, 66, 60), "metal")      # upper
    d = ImageDraw.Draw(c)
    for k in range(9):                                                         # top rail notches
        yy = 420 + r + k * 18
        d.rectangle((x - 30 + k * 1.5, yy, x + 36 - k * 1.5, yy + 8), fill=(34, 36, 34))
    d.rounded_rectangle((x - 30, 470 + r, x + 40, 520 + r), 10, outline=(24, 24, 26), width=10)  # rear aperture
    # handguard (railed) converging to the muzzle
    material(c, poly_mask(taper(x + 6, 430 + r, 116, x, 250 + r, 72), SZ), (58, 60, 56), "metal", spec_x=-0.5)
    d = ImageDraw.Draw(c)
    for k in range(8):
        yy = 260 + r + k * 22
        hw = 36 + k * 5
        d.line((x - hw, yy, x + hw, yy), fill=(30, 32, 30), width=4)
    d.polygon([(x - 18, 252 + r), (x + 18, 252 + r), (x + 6, 196 + r), (x - 6, 196 + r)], fill=(30, 30, 32))  # FSP
    d.rectangle((x - 3, 186 + r, x + 3, 206 + r), fill=(30, 30, 32))
    material(c, poly_mask(taper(x, 254 + r, 24, x, 214 + r, 18), SZ), BLUED, "metal")
    d = ImageDraw.Draw(c)
    d.ellipse((x - 10, 206 + r, x + 10, 222 + r), fill=(10, 10, 10))
    # magazine peeking out on the left
    material(c, poly_mask([(x - 120, 560 + r), (x - 70, 560 + r), (x - 90, FH), (x - 150, FH)], SZ), (50, 52, 50), "metal")
    long_gun_hands(c, x + 160, 560 + r, x - 54, 440 + r, r, ls=0.9, lrot=-50)
    return c


def rocket(frame):
    """Shoulder tube launcher on the right with an optic and a visible warhead."""
    c = Image.new("RGBA", SZ)
    r = {0: 0, 1: 40, 2: 70}[frame]
    x = 600
    if frame == 1:
        flash(c, x - 20, 240 + r, 420, seed=50)
    material(c, poly_mask(taper(x + 30, FH + 80, 420, x - 10, 300 + r, 200), SZ), OLIVE, "metal", spec_x=-0.4, hi=1.05)
    d = ImageDraw.Draw(c)
    for yy in (430, 560):
        w = 200 + (yy - 300) * 0.55
        d.rectangle((x - w / 2 - 6 + (560 - yy) * 0.05, yy + r, x + w / 2 + 6, yy + 22 + r), fill=(60, 64, 42))
    d.ellipse((x - 106, 270 + r, x + 86, 340 + r), fill=(64, 68, 46))
    d.ellipse((x - 86, 280 + r, x + 66, 332 + r), fill=(16, 16, 14))
    if frame != 2:                                                             # warhead
        d.ellipse((x - 60, 250 + r, x + 40, 316 + r), fill=(96, 110, 70))
        d.polygon([(x - 50, 288 + r), (x + 30, 288 + r), (x - 10, 210 + r)], fill=(110, 124, 80))
        d.line((x - 10, 214 + r, x - 30, 280 + r), fill=(150, 160, 120), width=4)
    # optic on the left of the tube
    material(c, rrect_mask((x - 250, 360 + r, x - 150, 470 + r), 16, SZ), (30, 30, 32), "polymer")
    d = ImageDraw.Draw(c)
    d.ellipse((x - 232, 376 + r, x - 168, 430 + r), fill=(40, 70, 80))
    d.ellipse((x - 220, 386 + r, x - 196, 404 + r), fill=(140, 200, 210))
    if frame == 2:                                                             # left hand loads a rocket
        d.ellipse((x - 70, 140, x + 30, 220), fill=(96, 110, 70))
        d.polygon([(x - 60, 180), (x + 20, 180), (x - 20, 90)], fill=(110, 124, 80))
        long_gun_hands(c, x + 130, 580 + r, x - 40, 230, r, lrot=-80)
        return c
    long_gun_hands(c, x + 130, 580 + r, x - 250, 500 + r, r, lrot=-36)
    return c


def plasma(frame):
    """Sci-fi plasma rifle in 63 colours: purple panels, mint coils."""
    c = Image.new("RGBA", SZ)
    r = {0: 0, 1: 16, 2: 8}[frame]
    x = 480
    glow = (120, 255, 200) if frame else MINT
    if frame:
        flash(c, x, 190 + r, 300 + frame * 30, seed=60 + frame, colors=sk.PLASMA)
    material(c, poly_mask(taper(x + 40, FH + 50, 300, x + 20, 520 + r, 250), SZ), (44, 44, 70), "metal", spec_x=-0.5)
    material(c, poly_mask(taper(x + 10, 540 + r, 230, x, 250 + r, 110), SZ), (54, 54, 96), "metal", spec_x=-0.45)
    d = ImageDraw.Draw(c)
    for k in range(5):                                                         # glowing coils
        yy = 290 + r + k * 50
        hw = 60 + k * 22
        d.rounded_rectangle((x - hw, yy, x + hw, yy + 18), 9, fill=glow)
        d.rounded_rectangle((x - hw + 8, yy + 4, x + hw - 8, yy + 10), 4, fill=(230, 255, 245))
    d.ellipse((x - 46, 226 + r, x + 46, 280 + r), fill=(40, 40, 70))
    d.ellipse((x - 30, 236 + r, x + 30, 270 + r), fill=glow)
    sk_badge(d, x + 70, 560 + r)
    if frame:
        c.paste(sk.add_glow(c, x, 300 + r, 420, 0.55, rgb=(30, 150, 100)), (0, 0))
    long_gun_hands(c, x + 200, 566 + r, x - 196, 520 + r, r, lrot=-30)
    return c


def sk_badge(d, x, y, px=6):
    rows = ["..#########..", ".###########.", "##PPP##PPP###", "##P####PP####",
            "##PPP####P###", "##P#P##PPP###", ".###########.", "..#########.."]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ".":
                d.rectangle((x + i * px, y + j * px, x + i * px + px - 1, y + j * px + px - 1),
                            fill=(56, 56, 146) if ch == "P" else MINT)


GUNS = {
    "pistol": (pistol, 2), "shotgun": (shotgun, 3), "dbshotgun": (dbshotgun, 3), "chaingun": (chaingun, 3),
    "rifle": (rifle, 3), "rocketl": (rocket, 3), "plasmagun": (plasma, 3),
}
