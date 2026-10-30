"""Parametric Doom-style bodies for the 63 crew.

paint(char, pose) -> hi-res RGBA frame (spritekit.HW x HH).
A character is a dict (see build_characters.ROSTER); a pose is a dict of
small offsets plus an optional "act" (None / "wind" / "fire") that drives the
weapon pose. Standing characters are ~5 heads tall; the wheelchair character
is painted seated by paint_seated() with a 4-frame push cycle.
"""
import math

import numpy as np
from PIL import Image, ImageDraw

import spritekit as sk
from spritekit import HW, HH, FLOOR, fill, limb_mask, poly_mask, ellipse_mask, rrect_mask, mul

CX = HW // 2
HEAD_H = 240            # hi-res head height (crown to chin)

MINT = (68, 218, 157)
PURPLE = (56, 56, 146)
GUNMETAL = (58, 60, 66)
GUNDARK = (28, 28, 32)
WOOD = (110, 70, 38)


# --------------------------------------------------------------------------
# small parts
# --------------------------------------------------------------------------
def skin_tones(skin):
    return mul(skin, 1.12), skin, mul(skin, 0.62)


def draw_fist(c, cx, cy, w, h, skin, tint=None):
    lit, mid, dark = skin_tones(tint or skin)
    fill(c, mid, rrect_mask((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), w * 0.28),
         lo=0.62, hi=1.2)
    d = ImageDraw.Draw(c)
    kw = w / 4
    for i in range(4):
        kx = cx - w / 2 + kw * i
        d.ellipse((kx + 2, cy - h / 2 + 2, kx + kw - 2, cy - h / 2 + h * 0.42), fill=lit)
        if i:
            d.line((kx, cy - h / 2 + h * 0.18, kx, cy + h * 0.08), fill=dark, width=max(2, int(w / 28)))
    d.line((cx - w / 2 + 6, cy + h * 0.12, cx + w / 2 - 6, cy + h * 0.12), fill=dark,
           width=max(2, int(w / 28)))


def badge(c, x, y, px=4):
    """Pixel-art 63 logo badge, 11x9 'pixels' of size px (aligned to the
    supersampling grid so it survives the downscale crisply)."""
    x, y = int(x) // px * px, int(y) // px * px
    rows = ["..#########..",
            ".###########.",
            "##PPP##PPP###",
            "##P####PP####",
            "##PPP####P###",
            "##P#P##PPP###",
            ".###########.",
            "..#########.."]
    d = ImageDraw.Draw(c)
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            col = PURPLE if ch == "P" else MINT
            d.rectangle((x + i * px, y + j * px, x + i * px + px - 1, y + j * px + px - 1), fill=col)


def gun_front(c, cx, cy, w, h, body=GUNMETAL, muzzle_r=None, glow=None):
    """A gun pointing at the viewer: foreshortened block + dark muzzle hole."""
    fill(c, body, rrect_mask((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), min(w, h) * 0.18),
         lo=0.55, hi=1.3)
    r = muzzle_r or min(w, h) * 0.28
    d = ImageDraw.Draw(c)
    d.ellipse((cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5), fill=mul(body, 1.5))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=glow or (8, 8, 10))


def flash(c, cx, cy, size, colors, seed):
    b = sk.burst(int(size), colors, seed=seed)
    c.alpha_composite(b, (int(cx - size / 2), int(cy - size / 2)))


# --------------------------------------------------------------------------
# clothing
# --------------------------------------------------------------------------
def top_texture(ch):
    if ch.get("top_tex") is not None:
        return ch["top_tex"]
    return sk.cloth_texture(ch["top_rgb"], seed=hash(ch["id"]) % 1000, grain=ch.get("grain", 9))


def sleeve_is_long(ch):
    return ch["sleeve"] == "long"


def sk_fill_flat(c, rgb, mask):
    layer = Image.new("RGBA", mask.size, rgb + (0,))
    layer.putalpha(mask)
    c.alpha_composite(layer)


def draw_arm(c, ch, side, sh, el, wr, fist_w=64, fist_h=56, tint=None, hand=True):
    """side: -1 viewer-left, +1 viewer-right. Sleeve length from ch['sleeve']."""
    skin = ch["skin"]
    tex = ch["_tex"]
    edge = mul(ch["top_rgb"], 0.3) if sleeve_is_long(ch) else mul(skin, 0.4)
    sk_fill_flat(c, edge, limb_mask(sh, el, 88 if ch["sleeve"] == "long" else 70, 80))
    sk_fill_flat(c, mul(skin, 0.4), limb_mask(el, wr, 80 if ch["sleeve"] == "long" else 62, 68))
    fill(c, skin, limb_mask(sh, el, 60, 54), lo=0.6, hi=1.1)
    fill(c, skin, limb_mask(el, wr, 54, 46), lo=0.6, hi=1.1)
    sleeve = ch["sleeve"]
    if sleeve == "long":
        fill(c, tex, limb_mask(sh, el, 78, 70), lo=0.5, hi=1.0)
        fill(c, tex, limb_mask(el, wr, 70, 60), lo=0.5, hi=1.0)
        d = ImageDraw.Draw(c)
        cuff = mul(ch["top_rgb"], 0.7)
        d.ellipse((wr[0] - 31, wr[1] - 14, wr[0] + 31, wr[1] + 14), fill=cuff)
    else:
        t = 0.5 if sleeve == "short" else 0.62
        end = (sh[0] + (el[0] - sh[0]) * t, sh[1] + (el[1] - sh[1]) * t)
        fill(c, tex, limb_mask(sh, end, 92, 84), lo=0.5, hi=1.0)
        d = ImageDraw.Draw(c)
        d.line((end[0] - 40, end[1] + 4, end[0] + 40, end[1] + 4), fill=mul(ch["top_rgb"], 0.6), width=6)
    if hand:
        hx = wr[0] + (wr[0] - el[0]) * 0.25
        hy = wr[1] + (wr[1] - el[1]) * 0.25
        draw_fist(c, hx, hy, fist_w, fist_h, skin, tint)
        return hx, hy
    return wr


def draw_legs(c, ch, pose, hip_y):
    lf = FLOOR - pose.get("lift_l", 0)
    rf = FLOOR - pose.get("lift_r", 0)
    pants = sk.cloth_texture(ch["pants_rgb"], seed=7, grain=7)
    shorts = ch["bottom"] == "shorts"
    for side, foot, shift in ((-1, lf, pose.get("lx", 0)), (1, rf, pose.get("rx", 0))):
        lx = CX + side * 62 + shift
        bend = (FLOOR - foot) * 0.7 + pose.get("squash", 0) * 0.4
        knee = (lx + side * bend * 0.3, hip_y + (foot - 40 - hip_y) * 0.5)
        ankle = (lx + side * 4, foot - 52)
        hip = (lx - side * 4, hip_y + 10)
        if shorts:
            fill(c, ch["skin"], limb_mask(knee, ankle, 66, 50), lo=0.6, hi=1.1)
            fill(c, pants, limb_mask(hip, (knee[0], knee[1] + 10), 112, 98), lo=0.5, hi=1.05)
            d = ImageDraw.Draw(c)
            d.rectangle((ankle[0] - 26, ankle[1] - 18, ankle[0] + 26, ankle[1] + 4), fill=(230, 230, 226))
        else:
            fill(c, pants, limb_mask(hip, knee, 108, 92), lo=0.5, hi=1.05)
            fill(c, pants, limb_mask(knee, ankle, 92, 76), lo=0.5, hi=1.05)
            d = ImageDraw.Draw(c)
            d.line((knee[0] - 30, knee[1] - 4, knee[0] + 26, knee[1] + 6), fill=mul(ch["pants_rgb"], 0.6), width=5)
            if ch["bottom"] == "cargo":
                px = hip[0] + side * 18
                py = (hip[1] + knee[1]) / 2
                fill(c, mul(ch["pants_rgb"], 1.15), rrect_mask((px - 26, py - 30, px + 26, py + 34), 6),
                     lo=0.6, hi=1.1)
                d.line((px - 26, py - 22, px + 26, py - 22), fill=mul(ch["pants_rgb"], 0.55), width=4)
            if ch["bottom"] == "jeans":
                d.line((hip[0] + side * 30, hip[1] + 20, knee[0] + side * 34, knee[1]),
                       fill=mul(ch["pants_rgb"], 1.35), width=3)
        # shoe
        sw = 54
        shoe = rrect_mask((ankle[0] - sw, foot - 54, ankle[0] + sw, foot), 20)
        fill(c, ch["shoe_rgb"], shoe, lo=0.5, hi=1.4)
        d = ImageDraw.Draw(c)
        d.rectangle((ankle[0] - sw + 2, foot - 12, ankle[0] + sw - 2, foot), fill=ch.get("sole_rgb", (26, 20, 18)))


def draw_torso(c, ch, sy, wy, sw, ww):
    tex = ch["_tex"]
    torso = poly_mask([(CX - sw + 24, sy), (CX + sw - 24, sy), (CX + sw, sy + 40),
                       (CX + ww + 6, wy - 60), (CX + ww, wy), (CX - ww, wy),
                       (CX - ww - 6, wy - 60), (CX - sw, sy + 40)])
    d0 = ImageDraw.Draw(torso)
    d0.ellipse((CX - sw - 4, sy - 6, CX - sw + 84, sy + 84), fill=255)
    d0.ellipse((CX + sw - 84, sy - 6, CX + sw + 4, sy + 84), fill=255)
    fill(c, tex, torso, lo=0.52, hi=1.05, curve=0.7)
    d = ImageDraw.Draw(c)
    dark = mul(ch["top_rgb"], 0.55)
    kind = ch["top"]
    # a couple of folds so it reads as cloth
    for k in (-1, 1):
        d.line((CX + k * ww * 0.55, wy - 120, CX + k * ww * 0.35, wy - 10), fill=mul(ch["top_rgb"], 0.75), width=4)
    if kind == "hoodie":
        # kangaroo pocket + drawstrings + zip
        d.polygon([(CX - ww + 34, wy - 110), (CX + ww - 34, wy - 110), (CX + ww - 14, wy - 8),
                   (CX - ww + 14, wy - 8)], outline=dark, width=6)
        if ch.get("zip"):
            d.line((CX, sy + 50, CX, wy - 6), fill=mul(ch["top_rgb"], 0.45), width=6)
            d.line((CX + 4, sy + 50, CX + 4, wy - 6), fill=mul(ch["top_rgb"], 1.4), width=2)
        for k in (-1, 1):
            d.line((CX + k * 30, sy + 40, CX + k * 34, sy + 150), fill=(200, 196, 186), width=5)
            d.ellipse((CX + k * 34 - 6, sy + 146, CX + k * 34 + 6, sy + 158), fill=(200, 196, 186))
        d.rectangle((CX - ww, wy - 22, CX + ww, wy), fill=dark)
    elif kind == "sweater":
        d.rectangle((CX - ww, wy - 24, CX + ww, wy), fill=dark)
    elif kind == "tee":
        d.line((CX - ww + 6, wy - 4, CX + ww - 6, wy - 4), fill=dark, width=6)


def draw_neck_and_collar(c, ch, sy, head_bottom):
    kind = ch["top"]
    skin = ch["skin"]
    if kind == "hoodie":
        # hood bunched up behind and around the neck
        fill(c, ch["_tex"], ellipse_mask((CX - 128, sy - 70, CX + 128, sy + 64)), lo=0.35, hi=0.8)
    fill(c, skin, rrect_mask((CX - 46, sy - 50, CX + 46, sy + 34), 18), lo=0.4, hi=0.85)
    d = ImageDraw.Draw(c)
    if kind == "tee":
        d.arc((CX - 58, sy - 30, CX + 58, sy + 46), 10, 170, fill=mul(ch["top_rgb"], 0.7), width=12)
    elif kind == "polo":
        col = mul(ch["top_rgb"], 1.1)
        d.polygon([(CX - 52, sy - 6), (CX, sy + 30), (CX - 14, sy + 52), (CX - 66, sy + 18)], fill=col,
                  outline=mul(ch["top_rgb"], 0.55))
        d.polygon([(CX + 52, sy - 6), (CX, sy + 30), (CX + 14, sy + 52), (CX + 66, sy + 18)], fill=col,
                  outline=mul(ch["top_rgb"], 0.55))
        d.rectangle((CX - 12, sy + 30, CX + 12, sy + 120), fill=mul(ch["top_rgb"], 0.85),
                    outline=mul(ch["top_rgb"], 0.55))
        for by in (sy + 58, sy + 92):
            d.ellipse((CX - 6, by - 6, CX + 6, by + 6), fill=(220, 214, 196))
    elif kind == "sweater":
        # white polo collar peeking out, like the photo
        d.polygon([(CX - 62, sy - 4), (CX + 62, sy - 4), (CX + 44, sy + 40), (CX, sy + 58), (CX - 44, sy + 40)],
                  fill=(236, 232, 222))
        d.line((CX, sy + 10, CX, sy + 58), fill=(170, 164, 156), width=4)
        d.arc((CX - 76, sy - 34, CX + 76, sy + 56), 10, 170, fill=mul(ch["top_rgb"], 0.6), width=14)


def paste_head(c, ch, top, lean=0):
    head = ch["head"]
    s = ch.get("head_h", HEAD_H) / head.height
    hd = head.resize((round(head.width * s), round(head.height * s)), Image.LANCZOS)
    x = CX - hd.width // 2 + ch.get("head_dx", 0) + lean
    c.alpha_composite(hd, (x, int(top)))
    return top + hd.height


# --------------------------------------------------------------------------
# weapon arm poses (standing)
# --------------------------------------------------------------------------
def arms_and_weapon(c, ch, pose, sy, wy, sw):
    act = pose.get("act")
    swing = pose.get("swing", 0)
    weapon = ch["weapon"]
    shL = (CX - sw + 34, sy + 50)
    shR = (CX + sw - 34, sy + 50)

    def hang(side, sh, dy=0):
        el = (CX + side * (sw + 8), sy + 200 + dy * 0.4)
        wr = (CX + side * (sw - 2), sy + 330 + dy)
        return draw_arm(c, ch, side, sh, el, wr)

    if weapon == "fists":                       # brawler: boxer guard / punch
        if act == "wind":
            draw_arm(c, ch, 1, shR, (CX + sw + 30, sy + 170), (CX + 70, sy + 90), 76, 66)
            draw_arm(c, ch, -1, shL, (CX - sw - 30, sy + 150), (CX - sw + 20, sy + 40), 64, 56)
        elif act == "fire":
            draw_arm(c, ch, 1, shR, (CX + sw + 10, sy + 190), (CX + 80, sy + 150), 80, 70)
            draw_arm(c, ch, -1, shL, (CX - sw + 10, sy + 120), (CX - 40, sy + 140), 10, 10, hand=False)
            draw_fist(c, CX - 30, sy + 150, 168, 144, ch["skin"])     # fist flying at you
            d = ImageDraw.Draw(c)
            for k in range(5):
                a = k * 0.6 - 1.2
                d.line((CX - 30 + math.cos(a) * 110, sy + 150 + math.sin(a) * 100,
                        CX - 30 + math.cos(a) * 150, sy + 150 + math.sin(a) * 136), fill=(240, 236, 220), width=5)
        else:
            draw_arm(c, ch, -1, shL, (CX - sw - 24, sy + 200 + swing), (CX - 70, sy + 120 + swing), 76, 66)
            draw_arm(c, ch, 1, shR, (CX + sw + 24, sy + 200 - swing), (CX + 70, sy + 120 - swing), 76, 66)
        return

    if weapon == "fireball":                    # fist at chest, conjures fire
        hang(-1, shL, swing)
        if act == "wind":
            hx, hy = draw_arm(c, ch, 1, shR, (CX + sw + 30, sy + 150), (CX + sw - 20, sy - 10),
                              tint=(255, 170, 60))
            c.paste(sk.add_glow(c, hx, hy, 260, 0.9), (0, 0))
            flash(c, hx, hy - 30, 150, sk.FIRE, seed=1)
        elif act == "fire":
            hx, hy = draw_arm(c, ch, 1, shR, (CX + sw + 10, sy + 230), (CX + 30, sy + 200), 80, 70,
                              tint=(255, 200, 110))
            c.paste(sk.add_glow(c, hx, hy, 420, 1.0), (0, 0))
            flash(c, hx - 20, hy - 30, 260, sk.FIRE, seed=2)
        else:
            draw_arm(c, ch, 1, shR, (CX + sw + 18, sy + 240), (CX + 20, sy + 190), 80, 70)
        return

    if weapon == "pistol":
        hang(1, shR, -swing)
        if act in ("wind", "fire"):
            # arm straight at the viewer: short foreshortened arm, gun front-on
            hx, hy = CX - 50, sy + 150
            draw_arm(c, ch, -1, shL, (CX - sw + 10, sy + 120), (hx - 10, hy + 20), hand=False)
            gun_front(c, hx, hy - 20, 64, 60)
            draw_fist(c, hx, hy + 30, 64, 52, ch["skin"])
            if act == "fire":
                flash(c, hx, hy - 24, 150, sk.FIRE, seed=3)
        else:
            hx, hy = hang(-1, shL, swing)
            fill(c, GUNMETAL, rrect_mask((hx - 16, hy + 10, hx + 16, hy + 96), 6), lo=0.6, hi=1.3)
            fill(c, GUNDARK, rrect_mask((hx - 18, hy - 10, hx + 18, hy + 30), 6), lo=0.6, hi=1.3)
        return

    if weapon == "shotgun":
        if act in ("wind", "fire"):
            gx, gy = CX + 10, sy + 190
            draw_arm(c, ch, -1, shL, (CX - sw - 4, sy + 230), (gx - 60, gy + 60), hand=False)
            draw_arm(c, ch, 1, shR, (CX + sw + 4, sy + 210), (gx + 50, gy + 20), hand=False)
            fill(c, WOOD, rrect_mask((gx - 70, gy + 30, gx + 10, gy + 110), 14), lo=0.6, hi=1.2)
            gun_front(c, gx, gy, 96, 76, muzzle_r=22)
            ImageDraw.Draw(c).ellipse((gx - 14, gy + 30, gx + 14, gy + 52), fill=(10, 10, 12))
            draw_fist(c, gx - 60, gy + 70, 62, 54, ch["skin"])
            draw_fist(c, gx + 50, gy + 30, 62, 54, ch["skin"])
            if act == "fire":
                flash(c, gx, gy - 4, 230, sk.FIRE, seed=4)
        else:
            a = (CX - 140, wy + 10 + swing * 0.3)          # stock end
            b = (CX + sw + 40, sy + 40)                     # muzzle end
            draw_arm(c, ch, -1, shL, (CX - sw - 10, sy + 240), (CX - 96, wy - 40), hand=False)
            draw_arm(c, ch, 1, shR, (CX + sw + 20, sy + 220), (CX + 96, sy + 150), hand=False)
            fill(c, WOOD, limb_mask(a, (a[0] + (b[0] - a[0]) * 0.32, a[1] + (b[1] - a[1]) * 0.32), 46, 34),
                 lo=0.6, hi=1.2)
            fill(c, GUNMETAL, limb_mask((a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3), b, 30, 22),
                 lo=0.6, hi=1.3)
            fill(c, WOOD, limb_mask((a[0] + (b[0] - a[0]) * 0.62, a[1] + (b[1] - a[1]) * 0.62),
                                    (a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8), 40, 40), lo=0.6, hi=1.2)
            draw_fist(c, CX - 96, wy - 30, 62, 54, ch["skin"])
            draw_fist(c, a[0] + (b[0] - a[0]) * 0.7, a[1] + (b[1] - a[1]) * 0.7, 62, 54, ch["skin"])
        return

    if weapon == "rocket":
        # big tube on his right shoulder (viewer-left), aimed at you
        tx, ty = CX - sw + 30, sy + 10
        hang(1, shR, -swing) if act is None else None
        if act is not None:
            draw_arm(c, ch, 1, shR, (CX + sw + 6, sy + 200), (CX + 40, sy + 120), hand=False)
        draw_arm(c, ch, -1, shL, (CX - sw - 20, sy + 190), (tx + 20, ty + 110), hand=False)
        fill(c, (78, 84, 58), ellipse_mask((tx - 92, ty - 92, tx + 92, ty + 92)), lo=0.45, hi=1.2)
        d = ImageDraw.Draw(c)
        d.ellipse((tx - 70, ty - 70, tx + 70, ty + 70), fill=(52, 56, 40))
        d.ellipse((tx - 52, ty - 52, tx + 52, ty + 52), fill=(10, 10, 10))
        d.rectangle((tx - 92, ty + 20, tx - 70, ty + 40), fill=(170, 40, 30))      # warning band
        draw_fist(c, tx + 20, ty + 118, 66, 58, ch["skin"])
        if act is not None:
            draw_fist(c, CX + 40, sy + 120, 66, 58, ch["skin"])
        if act == "wind":
            d.ellipse((tx - 30, ty - 30, tx + 30, ty + 30), fill=(180, 60, 20))
        if act == "fire":
            flash(c, tx, ty, 300, sk.FIRE, seed=6)
        return


# --------------------------------------------------------------------------
# full standing figure
# --------------------------------------------------------------------------
def paint(ch, pose):
    if ch.get("seated"):
        return paint_seated(ch, pose)
    c = sk.new_canvas()
    bob = pose.get("bob", 0) + pose.get("squash", 0)
    sw, ww = ch["shoulder"], ch["waist"]
    head_top = 16 + bob
    sy = head_top + ch.get("head_h", HEAD_H) - ch.get("overlap", 22)    # shoulder line
    wy = sy + 300                                                        # waist / belt
    hip_y = wy + 30

    draw_legs(c, ch, pose, hip_y)
    pants = sk.cloth_texture(ch["pants_rgb"], seed=7, grain=7)
    fill(c, pants, poly_mask([(CX - ww - 4, wy - 10), (CX + ww + 4, wy - 10), (CX + ww + 8, hip_y + 70),
                              (CX + 10, hip_y + 80), (CX - 10, hip_y + 80), (CX - ww - 8, hip_y + 70)]),
         lo=0.5, hi=1.05)
    if ch["bottom"] != "shorts" and ch["top"] != "hoodie":
        d = ImageDraw.Draw(c)
        d.rectangle((CX - ww - 2, wy - 6, CX + ww + 2, wy + 20), fill=(40, 28, 22))
        d.rectangle((CX - 18, wy - 8, CX + 18, wy + 22), fill=(190, 160, 90))
        d.rectangle((CX - 8, wy, CX + 8, wy + 14), fill=(40, 28, 22))
    draw_neck_and_collar(c, ch, sy, sy - 10) if ch["top"] == "hoodie" else None
    draw_torso(c, ch, sy, wy + 6, sw, ww)
    if ch["top"] != "hoodie":
        draw_neck_and_collar(c, ch, sy, sy - 10)
    else:
        fill(c, ch["skin"], rrect_mask((CX - 46, sy - 50, CX + 46, sy + 30), 18), lo=0.4, hi=0.85)
    badge(c, CX + sw * 0.42 - 26, sy + 96)
    paste_head(c, ch, head_top)
    arms_and_weapon(c, ch, pose, sy, wy, sw)
    return c


# --------------------------------------------------------------------------
# seated / wheelchair
# --------------------------------------------------------------------------
TIRE = (24, 24, 26)
FRAME = (34, 34, 38)
RIM = (120, 122, 128)


def wheel(c, cx, cy, R, rx, spin, outward, front=False):
    """Cambered wheel seen from the front: ellipse rx x R, spokes rotated by spin."""
    d = ImageDraw.Draw(c)
    if front:
        d.ellipse((cx - rx, cy - R, cx + rx, cy + R), fill=TIRE)
        d.ellipse((cx - rx * 0.5, cy - R * 0.55, cx + rx * 0.5, cy + R * 0.55), fill=(60, 60, 64))
        return
    d.ellipse((cx - rx, cy - R, cx + rx, cy + R), outline=TIRE, width=22)
    d.ellipse((cx - rx + 14, cy - R + 18, cx + rx - 14, cy + R - 18), outline=(70, 72, 78), width=5)
    for k in range(12):
        a = spin + k * math.pi / 6
        ex, ey = cx + math.cos(a) * (rx - 16), cy + math.sin(a) * (R - 20)
        d.line((cx, cy, ex, ey), fill=RIM, width=3)
    # valve / marker so the rotation reads clearly
    a = spin
    mx, my = cx + math.cos(a) * (rx - 10), cy + math.sin(a) * (R - 11)
    d.ellipse((mx - 9, my - 9, mx + 9, my + 9), fill=(210, 210, 214))
    d.ellipse((cx - 14, cy - 18, cx + 14, cy + 18), fill=(150, 152, 158))
    # handrim, slightly outside the wheel
    hx = cx + outward * 16
    d.ellipse((hx - rx + 6, cy - R + 26, hx + rx - 6, cy + R - 26), outline=(170, 172, 178), width=6)


def paint_seated(ch, pose):
    c = sk.new_canvas()
    phase = pose.get("push", 0)                # 0..3 push cycle
    act = pose.get("act")
    lean = pose.get("lean", 0)
    R, wcy = 176, FLOOR - 176
    spin = pose.get("spin", 0.0)
    sw, ww = ch["shoulder"], ch["waist"]
    seat_y = 700
    sy = 420 + lean + pose.get("bob", 0)
    head_top = sy - ch.get("head_h", HEAD_H) + ch.get("overlap", 22)

    # push handles behind the shoulders
    d = ImageDraw.Draw(c)
    for k in (-1, 1):
        x = CX + k * (sw - 10)
        d.line((x, seat_y, x + k * 6, sy - 50), fill=FRAME, width=16)
        d.rounded_rectangle((x + k * 6 - 12, sy - 96, x + k * 6 + 12, sy - 40), 8, fill=(18, 18, 20))
    # big wheels (behind the body)
    for k in (-1, 1):
        wheel(c, CX + k * 196, wcy, R, 58, spin * k, k)
    # frame: seat rails, front tubes, footrest, casters
    d = ImageDraw.Draw(c)
    for k in (-1, 1):
        d.line((CX + k * 140, seat_y, CX + k * 120, FLOOR - 70), fill=FRAME, width=14)
        wheel(c, CX + k * 120, FLOOR - 30, 30, 14, 0, k, front=True)
    d.rectangle((CX - 130, FLOOR - 92, CX + 130, FLOOR - 74), fill=FRAME)

    # legs: thighs toward the viewer, shins down to the footrest
    pants = sk.cloth_texture(ch["pants_rgb"], seed=7, grain=7)
    for k in (-1, 1):
        kx = CX + k * 62
        fill(c, pants, rrect_mask((kx - 60, seat_y - 30, kx + 60, seat_y + 90), 40), lo=0.5, hi=1.1)
        fill(c, pants, limb_mask((kx, seat_y + 70), (kx + k * 4, FLOOR - 150), 100, 80), lo=0.5, hi=1.05)
        fill(c, mul(ch["pants_rgb"], 1.2), rrect_mask((kx - 30 + k * 26, seat_y + 120, kx + 30 + k * 26, seat_y + 196), 8),
             lo=0.6, hi=1.1)                       # cargo pocket
        shoe = rrect_mask((kx - 56, FLOOR - 150, kx + 56, FLOOR - 86), 22)
        fill(c, ch["shoe_rgb"], shoe, lo=0.5, hi=1.4)
        ImageDraw.Draw(c).rectangle((kx - 54, FLOOR - 100, kx + 54, FLOOR - 88), fill=(225, 222, 214))
    # seat cushion edge
    fill(c, FRAME, rrect_mask((CX - 150, seat_y - 40, CX + 150, seat_y), 14), lo=0.6, hi=1.2)

    # torso + head
    draw_torso(c, ch, sy, seat_y - 10, sw, ww)
    draw_neck_and_collar(c, ch, sy, sy - 10)
    badge(c, CX + sw * 0.42 - 26, sy + 96)
    paste_head(c, ch, head_top)

    # arms
    shL, shR = (CX - sw + 34, sy + 50), (CX + sw - 34, sy + 50)
    if act in ("wind", "fire"):
        gx, gy = CX, sy + 180
        draw_arm(c, ch, -1, shL, (CX - sw - 10, sy + 220), (gx - 60, gy + 50), hand=False)
        draw_arm(c, ch, 1, shR, (CX + sw + 10, sy + 220), (gx + 60, gy + 40), hand=False)
        glow = (120, 255, 200) if act == "fire" else (60, 200, 150)
        gun_front(c, gx, gy, 120, 84, body=(46, 48, 70), muzzle_r=26, glow=glow)
        d = ImageDraw.Draw(c)
        d.rectangle((gx - 50, gy - 46, gx + 50, gy - 38), fill=MINT)
        draw_fist(c, gx - 60, gy + 52, 62, 54, ch["skin"])
        draw_fist(c, gx + 60, gy + 42, 62, 54, ch["skin"])
        if act == "fire":
            c.paste(sk.add_glow(c, gx, gy, 380, 0.9, rgb=(20, 140, 90)), (0, 0))
            flash(c, gx, gy, 220, sk.PLASMA, seed=7)
        else:
            c.paste(sk.add_glow(c, gx, gy, 200, 0.5, rgb=(20, 120, 80)), (0, 0))
    else:
        # rifle resting across the lap
        a, b = (CX - 150, seat_y + 40), (CX + 160, seat_y - 40)
        fill(c, (46, 48, 70), limb_mask(a, b, 40, 30), lo=0.6, hi=1.3)
        ImageDraw.Draw(c).line((CX - 60, seat_y + 12, CX + 60, seat_y - 18), fill=MINT, width=6)
        # hands on the handrims; the push cycle walks them along the rim
        ys = [-0.92, -0.62, -0.30, -0.80][phase]
        out = [0, 0, 6, 26][phase]
        grip = phase != 3
        for k, sh in ((-1, shL), (1, shR)):
            hx = CX + k * (196 + 16 + out)
            hy = wcy + ys * (R - 26)
            el = (CX + k * (sw + 26), sy + 200)
            draw_arm(c, ch, k, sh, el, (hx - k * 6, hy - 20), hand=False)
            fw = 66 + [0, 4, 10, 0][phase]
            draw_fist(c, hx, hy, fw, fw * 0.82, ch["skin"])
            if grip:
                ImageDraw.Draw(c).line((hx - k * 6, hy - fw * 0.3, hx - k * 6, hy + fw * 0.3),
                                       fill=(170, 172, 178), width=6)
    return c
