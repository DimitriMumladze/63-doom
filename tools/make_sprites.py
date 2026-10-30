"""Step 2: turn the cut-out photo into a Doom-style pixel enemy ("Brute").

Everything is composed at 4x resolution (HI) and then box-downscaled to the
final sprite size, quantized to a shared limited palette and outlined, which
gives the chunky hand-painted look of 90s sprites while keeping the face
readable.

Outputs in assets/sprites/:
  brute_<frame>.png        individual frames (128x208, transparent)
  brute_sheet.png          all frames in a row
  fireball_*.png           projectile + explosion frames
  brute_face.png           64x64 face portrait for the HUD
  preview.png              big nearest-neighbour preview on a dark floor
"""
from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CUT = ROOT / "assets" / "source" / "guy_cut.png"
OUT = ROOT / "assets" / "sprites"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 128, 208          # final sprite size
K = 4                    # supersampling factor
HW, HH = W * K, H * K    # 512 x 832

PHOTO_TOP = 16                    # hi-res y where the top of the head goes
PHOTO_X0, PHOTO_W = 16, 480       # hi-res x span of the cut-out
SRC_BBOX = (23, 267, 1978, 2000)  # person bbox in the source photo
S = PHOTO_W / (SRC_BBOX[2] - SRC_BBOX[0])


def src_to_hi(x, y):
    return PHOTO_X0 + (x - SRC_BBOX[0]) * S, PHOTO_TOP + (y - SRC_BBOX[1]) * S


# --------------------------------------------------------------------------
# Photo layer
# --------------------------------------------------------------------------
def load_photo():
    im = Image.open(CUT).crop(SRC_BBOX)
    rgb, a = im.convert("RGB"), im.getchannel("A")
    # Punch up the face so brows / eyes / moustache survive the downscale.
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=10, percent=90, threshold=2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.18)
    rgb = ImageEnhance.Color(rgb).enhance(1.05)
    arr = np.asarray(rgb).astype(float) / 255.0
    # Gritty grade: crush shadows, warm the mids a bit.
    arr = np.clip(arr, 0, 1) ** 1.12
    arr[..., 0] *= 1.03
    arr[..., 2] *= 0.92
    rgb = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    im = rgb.convert("RGBA")
    im.putalpha(a)
    size = (PHOTO_W, round((SRC_BBOX[3] - SRC_BBOX[1]) * S))
    return im.resize(size, Image.LANCZOS)


PHOTO = load_photo()
PHOTO_BOTTOM = PHOTO_TOP + PHOTO.height                     # ~441
_cols = np.nonzero(np.asarray(PHOTO.getchannel("A"))[PHOTO.height - 60] > 128)[0]
ARM_L = PHOTO_X0 + _cols.min()      # outer edge of the left sleeve at the seam
ARM_R = PHOTO_X0 + _cols.max()
FIST_X0, _ = src_to_hi(750, 0)
FIST_X1, _ = src_to_hi(1100, 0)
_, FIST_Y0 = src_to_hi(0, 1850)


def photo_layer(feather=56):
    """Photo with its straight bottom cut faded out into the painted body."""
    p = PHOTO.copy()
    a = np.asarray(p.getchannel("A")).astype(float)
    h = a.shape[0]
    ramp = np.ones(h)
    ramp[h - feather:] = np.linspace(1, 0, feather)
    fade = np.repeat(ramp[:, None], a.shape[1], axis=1)
    p.putalpha(Image.fromarray((a * fade).astype(np.uint8)))
    return p


# Sweater knit texture sampled straight from the photo, used for drawn parts.
def knit_texture():
    src = Image.open(CUT).convert("RGB").crop((330, 1450, 830, 1800))
    tile = src.resize((round(src.width * S), round(src.height * S)), Image.LANCZOS)
    tex = Image.new("RGB", (HW, HH))
    for y in range(0, HH, tile.height):
        for x in range(0, HW, tile.width):
            tex.paste(tile, (x, y))
    return tex


KNIT = knit_texture()

SKIN_LIT = (222, 160, 132)
SKIN_MID = (176, 112, 88)
SKIN_DARK = (104, 56, 42)
PANTS = (74, 74, 60)
BOOT = (52, 36, 28)
BELT = (64, 40, 26)
BRASS = (196, 156, 72)


def shaded(base, mask, light=(0.35, 0.0), lo=0.55, hi=1.15):
    """Fill `mask` with `base` (colour or RGB image), darkened toward the edges
    away from the upper-left light, for a quick volume read."""
    if isinstance(base, tuple):
        base = Image.new("RGB", (HW, HH), base)
    box = mask.getbbox()
    if not box:
        return Image.new("RGBA", (HW, HH))
    x0, y0, x1, y1 = box
    xs = np.linspace(-1, 1, x1 - x0)
    ys = np.linspace(-1, 1, y1 - y0)
    gx, gy = np.meshgrid(xs, ys)
    # rounded "cylinder" falloff plus a directional term
    f = 1 - 0.55 * gx ** 2 - (gx * light[0] + gy * light[1]) * 0.6
    f = np.clip(f, 0, 1) * (hi - lo) + lo
    fac = np.ones((HH, HW))
    fac[y0:y1, x0:x1] = f
    arr = np.asarray(base).astype(float) * fac[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    out.putalpha(mask)
    return out


def poly_mask(points):
    m = Image.new("L", (HW, HH), 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m


def ellipse_mask(box):
    m = Image.new("L", (HW, HH), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m


def rrect_mask(box, r):
    m = Image.new("L", (HW, HH), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, r, fill=255)
    return m


def draw_fist(canvas, cx, cy, w, h, tint=None):
    """A clenched fist seen from the front: palm block + 4 knuckles."""
    m = rrect_mask((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), w * 0.25)
    col = SKIN_MID if tint is None else tint
    canvas.alpha_composite(shaded(col, m, lo=0.6, hi=1.25))
    d = ImageDraw.Draw(canvas)
    kw = w / 4
    for i in range(4):
        kx = cx - w / 2 + kw * i
        d.ellipse((kx + 2, cy - h / 2 + 2, kx + kw - 2, cy - h / 2 + h * 0.45),
                  fill=SKIN_LIT if tint is None else tint)
        d.line((kx + kw, cy - h / 2 + h * 0.15, kx + kw, cy + h * 0.1),
               fill=SKIN_DARK, width=3)
    d.line((cx - w / 2 + 6, cy + h * 0.12, cx + w / 2 - 6, cy + h * 0.12),
           fill=SKIN_DARK, width=3)


# --------------------------------------------------------------------------
# Pose composition
# --------------------------------------------------------------------------
def compose(pose):
    """pose keys: bob, lfoot, rfoot (hi-res y of boot soles), lx, rx
    (sideways leg shift), arm (hanging-fist y offset), squash (legs bent),
    glow (0..1 fire around chest fist), punch (0..1 fist thrust forward)."""
    bob = pose.get("bob", 0)
    sq = pose.get("squash", 0)
    lf, rf = pose.get("lfoot", 828), pose.get("rfoot", 828)
    lx, rx = pose.get("lx", 0), pose.get("rx", 0)
    up = bob + sq                     # how far the whole upper body drops
    c = Image.new("RGBA", (HW, HH))

    top = PHOTO_BOTTOM + up
    hip_y = 540 + up
    # --- legs (behind everything) --------------------------------------
    for side, foot, shift in (("L", lf, lx), ("R", rf, rx)):
        x0, x1 = (122, 246) if side == "L" else (270, 394)
        x0, x1 = x0 + shift, x1 + shift
        knee = hip_y + (foot - 40 - hip_y) * 0.5
        bend = max(0, 828 - foot) * 0.6 + sq * 0.5
        kx = (-1 if side == "L" else 1) * bend * 0.25
        leg = poly_mask([(x0, hip_y), (x1, hip_y),
                         (x1 + kx + 4, knee), (x1 - 10, foot - 40),
                         (x0 + 10, foot - 40), (x0 + kx - 4, knee)])
        c.alpha_composite(shaded(PANTS, leg, lo=0.45, hi=1.1))
        d = ImageDraw.Draw(c)
        d.line((x0 + kx + 14, knee, x1 + kx - 14, knee), fill=(46, 46, 38), width=6)
        boot = rrect_mask((x0 - 6, foot - 48, x1 + 6, foot), 14)
        c.alpha_composite(shaded(BOOT, boot, lo=0.5, hi=1.4))
        d.rectangle((x0 - 4, foot - 10, x1 + 4, foot), fill=(30, 20, 16))
        d.line((x0 + 8, foot - 40, x1 - 20, foot - 40), fill=(96, 70, 52), width=4)

    # --- pelvis + belt ---------------------------------------------------
    hips = poly_mask([(104, 512 + up), (412, 512 + up), (408, 600 + up),
                      (108, 600 + up)])
    c.alpha_composite(shaded(PANTS, hips, lo=0.45, hi=1.1))
    belt = poly_mask([(102, 508 + up), (414, 508 + up), (412, 540 + up), (104, 540 + up)])
    c.alpha_composite(shaded(BELT, belt, lo=0.6, hi=1.3))
    d = ImageDraw.Draw(c)
    d.rectangle((238, 506 + up, 278, 542 + up), fill=BRASS)
    d.rectangle((248, 514 + up, 268, 534 + up), fill=BELT)
    d.line((238, 506 + up, 278, 506 + up), fill=(240, 210, 130), width=3)

    # --- sweater below the photo cut ------------------------------------
    torso = poly_mask([(84, top - 60), (432, top - 60), (414, 514 + up),
                       (102, 514 + up)])
    c.alpha_composite(shaded(KNIT, torso, lo=0.62, hi=0.98))
    d = ImageDraw.Draw(c)
    d.rectangle((102, 500 + up, 414, 514 + up), fill=(110, 18, 22))  # ribbed hem

    # --- hanging arm (viewer's left) ------------------------------------
    arm_dy = pose.get("arm", 0)
    sleeve = poly_mask([(ARM_L, top - 60), (90, top - 60), (98, 560 + up + arm_dy),
                        (max(ARM_L, 24) + 2, 560 + up + arm_dy)])
    c.alpha_composite(shaded(KNIT, sleeve, lo=0.5, hi=0.95))
    d = ImageDraw.Draw(c)
    d.rectangle((24, 548 + up + arm_dy, 100, 566 + up + arm_dy), fill=(104, 16, 20))
    draw_fist(c, 62, 600 + up + arm_dy, 80, 68)

    # --- upper right arm down to the elbow ------------------------------
    upper = poly_mask([(428, top - 60), (ARM_R, top - 60), (min(ARM_R, 496), 528 + up),
                       (430, 528 + up)])
    c.alpha_composite(shaded(KNIT, upper, lo=0.45, hi=0.85))
    elbow = ellipse_mask((424, 488 + up, 502, 562 + up))
    c.alpha_composite(shaded(KNIT, elbow, lo=0.45, hi=0.85))

    # --- photo (head, shoulders) ----------------------------------------
    p = photo_layer()
    c.alpha_composite(p, (PHOTO_X0, PHOTO_TOP + up))

    # creases separating the arms from the torso
    d = ImageDraw.Draw(c)
    d.line((90, 350 + up, 96, 548 + up), fill=(60, 6, 8), width=5)
    d.line((428, 350 + up, 430, 500 + up), fill=(60, 6, 8), width=5)

    # --- forearm: elbow -> fist held in front of the chest --------------
    fcx, fcy = pose.get("fist", (242, 428))
    fcy += up
    ex, ey = 436, 522 + up
    nx, ny = fcy - ey, ex - fcx          # perpendicular to the forearm
    ln = math.hypot(nx, ny)
    nx, ny = nx / ln * 36, ny / ln * 36
    fore_pts = [(ex + nx, ey + ny), (ex - nx, ey - ny),
                (fcx - nx * 0.8, fcy - ny * 0.8), (fcx + nx * 0.8, fcy + ny * 0.8)]
    shadow = poly_mask([(x + 6, y + 22) for x, y in fore_pts])
    ImageDraw.Draw(shadow).rectangle((0, 500 + up, HW, HH), fill=0)  # sweater only
    sh = Image.new("RGBA", (HW, HH), (30, 2, 4, 0))
    sh.putalpha(Image.fromarray((np.minimum(np.asarray(shadow), np.asarray(c.getchannel("A"))) * 0.6).astype(np.uint8)))
    c.alpha_composite(sh)
    fore = poly_mask(fore_pts)
    c.alpha_composite(shaded(KNIT, fore, light=(0.0, -0.6), lo=0.55, hi=1.05))
    d = ImageDraw.Draw(c)
    cap = ellipse_mask((ex - 38, ey - 38, ex + 38, ey + 38))
    c.alpha_composite(shaded(KNIT, cap, light=(0.0, -0.6), lo=0.5, hi=0.95))
    d = ImageDraw.Draw(c)
    d.line((ex - nx, ey - ny, fcx - nx * 0.8, fcy - ny * 0.8), fill=(150, 34, 36), width=4)
    d.line((ex + nx, ey + ny, fcx + nx * 0.8, fcy + ny * 0.8), fill=(48, 4, 6), width=7)
    # cuff + fist
    d.line((fcx - nx * 0.9 + 14, fcy - ny * 0.9 + 14, fcx + nx * 0.9 + 14, fcy + ny * 0.9 + 14),
           fill=(104, 16, 20), width=16)
    draw_fist(c, fcx, fcy, 88, 74, tint=pose.get("fist_tint"))

    return c


# --------------------------------------------------------------------------
# Effects
# --------------------------------------------------------------------------
FIRE = [(255, 255, 220), (255, 236, 120), (255, 190, 40), (240, 120, 20),
        (200, 60, 10), (130, 24, 8)]


def fireball(size, seed=0, tongues=True):
    """Radial fireball on its own transparent hi-res canvas of `size`."""
    rnd = random.Random(seed)
    im = Image.new("RGBA", (size, size))
    cx = cy = size / 2
    R = size * 0.42
    yy, xx = np.mgrid[0:size, 0:size]
    ang = np.arctan2(yy - cy, xx - cx)
    wob = np.zeros_like(ang)
    if tongues:
        for k in (5, 7, 11):
            wob += np.sin(ang * k + rnd.uniform(0, 6.28)) * rnd.uniform(0.05, 0.11)
    dist = np.hypot(xx - cx, yy - cy) / (R * (1 + wob))
    arr = np.zeros((size, size, 4), np.uint8)
    bands = [0.28, 0.48, 0.66, 0.82, 0.93, 1.0]
    for i in range(len(bands) - 1, -1, -1):
        sel = dist <= bands[i]
        arr[sel, :3] = FIRE[i]
        arr[sel, 3] = 255
    return Image.fromarray(arr)


def add_glow(c, cx, cy, r, strength):
    """Orange light spill (additive-ish) around a point."""
    arr = np.asarray(c).astype(float)
    yy, xx = np.mgrid[0:HH, 0:HW]
    fall = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 1.6 * strength
    a = arr[..., 3:] / 255
    arr[..., 0] += fall * 150 * a[..., 0]
    arr[..., 1] += fall * 80 * a[..., 0]
    arr[..., 2] += fall * 10 * a[..., 0]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def tint(c, rgb, amount):
    arr = np.asarray(c).astype(float)
    arr[..., :3] = arr[..., :3] * (1 - amount) + np.array(rgb) * amount
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def blood_drops(c, cx, cy, n, spread, seed):
    rnd = random.Random(seed)
    d = ImageDraw.Draw(c)
    for _ in range(n):
        a = rnd.uniform(-math.pi, 0)
        r = rnd.uniform(0.2, 1) * spread
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8
        s = rnd.uniform(5, 13)
        d.ellipse((x - s, y - s, x + s, y + s), fill=rnd.choice(
            [(150, 10, 10), (110, 0, 0), (190, 30, 20)]))


# --------------------------------------------------------------------------
# Downscale, palette, outline
# --------------------------------------------------------------------------
def to_pixels(hi):
    small = hi.resize((hi.width // K, hi.height // K), Image.BOX)
    a = np.asarray(small.getchannel("A"))
    rgb = small.convert("RGB")
    return rgb, (a > 110)


def build_palette(samples, extra):
    """Shared palette: adaptive colours from the base frames + fixed ramps."""
    strip = Image.new("RGB", (sum(s.width for s in samples), max(s.height for s in samples)))
    x = 0
    for s in samples:
        strip.paste(s, (x, 0))
        x += s.width
    adaptive = strip.quantize(72, method=Image.MEDIANCUT).getpalette()[:72 * 3]
    cols = [tuple(adaptive[i:i + 3]) for i in range(0, len(adaptive), 3)] + extra
    pal = []
    for col in cols:
        pal += list(col)
    pal += [0] * (768 - len(pal))
    pimg = Image.new("P", (1, 1))
    pimg.putpalette(pal)
    return pimg, len(cols)


OUTLINE = (20, 10, 8)


def finalize(rgb, alpha, pal):
    q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    arr = np.zeros((rgb.height, rgb.width, 4), np.uint8)
    arr[..., :3] = np.asarray(q)
    arr[..., 3] = alpha * 255
    # 1-px dark outline around the silhouette
    pad = np.pad(alpha, 1)
    ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~alpha
    arr[ring] = (*OUTLINE, 255)
    return Image.fromarray(arr)


DW = 224                 # death frames are wider (body falls sideways)
HDW = DW * K


def place(hi_sprite, rot=0, sy=1.0, dx=0):
    """Rotate a standing hi-res frame, then sit it on the floor of a wide
    death canvas (bottom-aligned, centred + dx)."""
    big = Image.new("RGBA", (HW * 3, HH * 3))
    big.alpha_composite(hi_sprite, (HW, HH))
    if rot:
        big = big.rotate(rot, resample=Image.BICUBIC, center=(HW * 1.5, HH * 2 - 10))
    big = big.crop(big.getbbox())
    if sy != 1:
        big = big.resize((big.width, round(big.height * sy)), Image.LANCZOS)
    if big.width > HDW - 16:
        f = (HDW - 16) / big.width
        big = big.resize((round(big.width * f), round(big.height * f)), Image.LANCZOS)
    out = Image.new("RGBA", (HDW, HH))
    out.alpha_composite(big, ((HDW - big.width) // 2 + dx, HH - 8 - big.height))
    return out


# --------------------------------------------------------------------------
# Frames
# --------------------------------------------------------------------------
def make_frames():
    frames = {}
    idle = compose({})
    frames["idle"] = idle
    frames["walk1"] = compose({"bob": 8, "lfoot": 828, "rfoot": 784, "lx": -8,
                               "rx": 6, "arm": -10})
    frames["walk2"] = compose({"bob": 0})
    frames["walk3"] = compose({"bob": 8, "lfoot": 784, "rfoot": 828, "lx": -10,
                               "rx": 4, "arm": 8})

    # attack: wind-up (fist ignites) then throw (fireball in front of fist)
    # wind-up: fist pulled up to the shoulder and set on fire
    a1 = compose({"bob": 4, "fist": (300, 340), "fist_tint": (255, 170, 60)})
    a1 = add_glow(a1, 300, 344, 260, 0.9)
    fb = fireball(130, seed=1)
    a1.alpha_composite(fb, (300 - 65, 344 - 100))
    frames["attack1"] = a1

    # throw: fist thrust forward, big fireball leaving the hand
    a2 = compose({"bob": -2, "fist": (232, 440), "fist_tint": (255, 200, 110)})
    a2 = add_glow(a2, 232, 430, 420, 1.0)
    fb = fireball(250, seed=2)
    a2.alpha_composite(fb, (232 - 125, 430 - 150))
    frames["attack2"] = a2

    # pain: flinch + red flash + a little blood
    pn = compose({"bob": 10, "lx": -6, "rx": 6})
    pn = tint(pn, (255, 40, 30), 0.28)
    blood_drops(pn, 300, 330, 9, 70, seed=3)
    frames["pain"] = pn

    # death: blood burst, knees buckle, topple, corpse
    d1 = compose({"bob": 10})
    d1 = tint(d1, (255, 30, 20), 0.18)
    blood_drops(d1, 250, 420, 22, 150, seed=4)
    frames["death1"] = place(d1)
    d2 = compose({"squash": 90, "lx": -14, "rx": 14})
    d2 = tint(d2, (120, 0, 0), 0.12)
    blood_drops(d2, 240, 470, 10, 90, seed=5)
    frames["death2"] = place(d2, rot=-22, dx=24)
    d3 = compose({"squash": 120})
    frames["death3"] = place(tint(d3, (90, 0, 0), 0.15), rot=-62, dx=40)
    corpse = place(tint(compose({}), (80, 0, 0), 0.2), rot=-90, sy=0.6)
    pool = Image.new("RGBA", (HDW, HH))
    ImageDraw.Draw(pool).ellipse((40, HH - 90, HDW - 40, HH - 4), fill=(110, 0, 0, 255))
    pool.alpha_composite(corpse, (0, -14))
    frames["death4"] = pool
    return frames


def main():
    frames = make_frames()
    small = {k: to_pixels(v) for k, v in frames.items()}
    skin = [tuple(round(a + (b - a) * t) for a, b in zip((252, 214, 188), (34, 16, 12)))
            for t in np.linspace(0, 1, 14)]
    extra = FIRE + skin + [(150, 10, 10), (110, 0, 0), (190, 30, 20), (70, 0, 0), OUTLINE]
    face = small["idle"][0].crop((36, 0, 92, 72))
    pal, ncol = build_palette([small["idle"][0], small["walk1"][0]] + [face] * 4, extra)
    print("palette colours:", ncol)

    order = ["idle", "walk1", "walk2", "walk3", "attack1", "attack2", "pain",
             "death1", "death2", "death3", "death4"]
    done = {}
    for k in order:
        done[k] = finalize(*small[k], pal)
        done[k].save(OUT / f"brute_{k}.png")

    sheet = Image.new("RGBA", (sum(done[k].width for k in order), H))
    x = 0
    for k in order:
        sheet.alpha_composite(done[k], (x, 0))
        x += done[k].width
    sheet.save(OUT / "brute_sheet.png")

    # projectile + explosion
    for i in range(2):
        fb = fireball(128, seed=10 + i).resize((24, 24), Image.BOX)
        fb.save(OUT / f"fireball_{i}.png")
    for i, sz in enumerate((150, 220, 256)):
        ex = fireball(256, seed=20 + i)
        ex = ex.resize((sz, sz), Image.LANCZOS)
        base = Image.new("RGBA", (256, 256))
        base.alpha_composite(ex, ((256 - sz) // 2, (256 - sz) // 2))
        if i == 2:
            arr = np.asarray(base).copy()
            arr[..., 3] = (arr[..., 3] * 0.55).astype(np.uint8)
            base = Image.fromarray(arr)
        base.resize((48, 48), Image.BOX).save(OUT / f"explode_{i}.png")

    # HUD face portrait
    face = Image.open(CUT).convert("RGBA").crop((600, 300, 1400, 1180))
    face = face.filter(ImageFilter.UnsharpMask(radius=8, percent=80))
    face = face.resize((58, 64), Image.LANCZOS)
    rgb = face.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    rgb.putalpha(face.getchannel("A").point(lambda v: 255 if v > 110 else 0))
    rgb.save(OUT / "brute_face.png")

    # preview: frames on a dark floor, 3x nearest-neighbour
    pv = Image.new("RGBA", (sheet.width + 16 * (len(order) + 1), H + 40), (36, 30, 28, 255))
    ImageDraw.Draw(pv).rectangle((0, H + 8, pv.width, pv.height), fill=(58, 48, 40, 255))
    x = 16
    for k in order:
        pv.alpha_composite(done[k], (x, 16))
        x += done[k].width + 16
    pv = pv.resize((pv.width * 2, pv.height * 2), Image.NEAREST)
    pv.save(OUT / "preview.png")
    big = Image.new("RGBA", (W, H), (36, 30, 28, 255))
    big.alpha_composite(done["idle"])
    big.resize((W * 4, H * 4), Image.NEAREST).save(OUT / "preview_idle_4x.png")


if __name__ == "__main__":
    main()
