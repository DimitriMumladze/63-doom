"""Shared helpers for painting Doom-style sprites.

Everything is painted on a 4x supersampled canvas (HW x HH), then box-
downscaled, quantized to a limited palette and given a 1-px dark outline.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw

W, H = 128, 256          # final character frame size
K = 4                    # supersampling
HW, HH = W * K, H * K    # 512 x 1024
FLOOR = HH - 8           # hi-res y of the soles
DW = 256                 # death frames are wider (body falls sideways)
HDW = DW * K

OUTLINE = (20, 10, 8)
FIRE = [(255, 255, 220), (255, 236, 120), (255, 190, 40), (240, 120, 20),
        (200, 60, 10), (130, 24, 8)]
PLASMA = [(240, 255, 250), (170, 255, 220), (80, 236, 170), (40, 190, 140),
          (30, 120, 110), (40, 50, 110)]      # 63 mint -> 63 purple
BLOOD = [(190, 30, 20), (150, 10, 10), (110, 0, 0), (70, 0, 0)]


def new_canvas(w=HW, h=HH):
    return Image.new("RGBA", (w, h))


# --------------------------------------------------------------------------
# masks
# --------------------------------------------------------------------------
def poly_mask(points, size=(HW, HH)):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in points], fill=255)
    return m


def ellipse_mask(box, size=(HW, HH)):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m


def rrect_mask(box, r, size=(HW, HH)):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, r, fill=255)
    return m


def limb_mask(a, b, wa, wb, size=(HW, HH)):
    """Tapered capsule from point a (width wa) to point b (width wb)."""
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy) or 1
    nx, ny = -dy / ln, dx / ln
    m = poly_mask([(ax + nx * wa / 2, ay + ny * wa / 2), (bx + nx * wb / 2, by + ny * wb / 2),
                   (bx - nx * wb / 2, by - ny * wb / 2), (ax - nx * wa / 2, ay - ny * wa / 2)],
                  size)
    d = ImageDraw.Draw(m)
    d.ellipse((ax - wa / 2, ay - wa / 2, ax + wa / 2, ay + wa / 2), fill=255)
    d.ellipse((bx - wb / 2, by - wb / 2, bx + wb / 2, by + wb / 2), fill=255)
    return m


# --------------------------------------------------------------------------
# painting
# --------------------------------------------------------------------------
def shaded(base, mask, light=(0.35, 0.0), lo=0.55, hi=1.15, curve=0.55):
    """Fill `mask` with `base` (RGB tuple or image), darkened toward the edges
    and away from an upper-left light, for a quick volume read."""
    box = mask.getbbox()
    out = Image.new("RGBA", mask.size)
    if not box:
        return out
    x0, y0, x1, y1 = box
    xs = np.linspace(-1, 1, x1 - x0)
    ys = np.linspace(-1, 1, y1 - y0)
    gx, gy = np.meshgrid(xs, ys)
    f = 1 - curve * gx ** 2 - (gx * light[0] + gy * light[1]) * 0.6
    f = np.clip(f, 0, 1) * (hi - lo) + lo
    if isinstance(base, tuple):
        arr = np.empty((y1 - y0, x1 - x0, 3))
        arr[:] = base
    else:
        arr = np.asarray(base.crop(box).convert("RGB")).astype(float)
    arr = arr * f[..., None]
    part = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    part.putalpha(mask.crop(box))
    out.paste(part, (x0, y0))
    return out


def fill(canvas, base, mask, **kw):
    canvas.alpha_composite(shaded(base, mask, **kw))


def tiled(tile, size=(HW, HH)):
    tex = Image.new("RGB", size)
    for y in range(0, size[1], tile.height):
        for x in range(0, size[0], tile.width):
            tex.paste(tile, (x, y))
    return tex


def cloth_texture(rgb, seed, size=(HW, HH), grain=10):
    """Flat colour with soft fabric noise, so big areas don't look plastic."""
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (size[1] // 8 + 1, size[0] // 8 + 1))
    n = np.asarray(Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8))
                   .resize(size, Image.BICUBIC)).astype(float) - 128
    fine = rng.normal(0, grain * 0.5, (size[1], size[0]))
    arr = np.empty((size[1], size[0], 3))
    arr[:] = rgb
    arr += (n * grain / 110 + fine * 0.5)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def mul(rgb, f):
    return tuple(int(max(0, min(255, c * f))) for c in rgb)


# --------------------------------------------------------------------------
# effects
# --------------------------------------------------------------------------
def burst(size, colors, seed=0, tongues=True, bands=(0.28, 0.48, 0.66, 0.82, 0.93, 1.0)):
    """Banded radial blast (fireball / plasma) on its own canvas."""
    rnd = random.Random(seed)
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
    for i in range(len(bands) - 1, -1, -1):
        sel = dist <= bands[i]
        arr[sel, :3] = colors[i]
        arr[sel, 3] = 255
    return Image.fromarray(arr)


def add_glow(c, cx, cy, r, strength, rgb=(150, 80, 10)):
    """Coloured light spill on the sprite around a point."""
    arr = np.asarray(c).astype(float)
    hh, ww = arr.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    fall = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 1.6 * strength
    a = arr[..., 3] / 255
    for i in range(3):
        arr[..., i] += fall * rgb[i] * a
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def tint(c, rgb, amount):
    arr = np.asarray(c).astype(float)
    arr[..., :3] = arr[..., :3] * (1 - amount) + np.array(rgb) * amount
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def blood_drops(c, cx, cy, n, spread, seed):
    rnd = random.Random(seed)
    d = ImageDraw.Draw(c)
    for _ in range(n):
        a = rnd.uniform(-math.pi, math.pi)
        r = rnd.uniform(0.2, 1) * spread
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8
        s = rnd.uniform(6, 15)
        d.ellipse((x - s, y - s, x + s, y + s), fill=rnd.choice(BLOOD[:3]))


def place(hi_sprite, rot=0, sy=1.0, dx=0, pivot=None):
    """Rotate a standing hi-res frame about its feet, then sit it on the floor
    of the wide death canvas (bottom-aligned, centred + dx)."""
    big = Image.new("RGBA", (HW * 3, HH * 3))
    big.alpha_composite(hi_sprite, (HW, HH))
    if rot:
        px, py = pivot or (HW / 2, FLOOR)
        big = big.rotate(rot, resample=Image.BICUBIC, center=(HW + px, HH + py))
    bb = big.getbbox()
    big = big.crop(bb)
    if sy != 1:
        big = big.resize((big.width, max(1, round(big.height * sy))), Image.LANCZOS)
    if big.width > HDW - 16:
        f = (HDW - 16) / big.width
        big = big.resize((round(big.width * f), round(big.height * f)), Image.LANCZOS)
    out = Image.new("RGBA", (HDW, HH))
    out.alpha_composite(big, ((HDW - big.width) // 2 + dx, FLOOR - big.height))
    return out


def widen(hi_sprite):
    """Put a normal-width frame in the middle of a death-width canvas."""
    out = Image.new("RGBA", (HDW, HH))
    out.alpha_composite(hi_sprite, ((HDW - HW) // 2, 0))
    return out


# --------------------------------------------------------------------------
# downscale / palette / outline
# --------------------------------------------------------------------------
def to_pixels(hi):
    small = hi.resize((hi.width // K, hi.height // K), Image.BOX)
    a = np.asarray(small.getchannel("A"))
    return small.convert("RGB"), (a > 110)


def skin_ramp(light=(252, 214, 188), dark=(34, 16, 12), n=14):
    return [tuple(round(a + (b - a) * t) for a, b in zip(light, dark))
            for t in np.linspace(0, 1, n)]


def build_palette(samples, extra, n_adaptive=80):
    strip = Image.new("RGB", (sum(s.width for s in samples), max(s.height for s in samples)))
    x = 0
    for s in samples:
        strip.paste(s, (x, 0))
        x += s.width
    n_adaptive = min(n_adaptive, 256 - len(extra))
    adaptive = strip.quantize(n_adaptive, method=Image.MEDIANCUT).getpalette()[:n_adaptive * 3]
    cols = [tuple(adaptive[i:i + 3]) for i in range(0, len(adaptive), 3)] + list(extra)
    pal = [v for col in cols for v in col]
    pal += [0] * (768 - len(pal))
    pimg = Image.new("P", (1, 1))
    pimg.putpalette(pal)
    return pimg


def finalize(rgb, alpha, pal):
    q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    arr = np.zeros((rgb.height, rgb.width, 4), np.uint8)
    arr[..., :3] = np.asarray(q)
    arr[..., 3] = alpha * 255
    pad = np.pad(alpha, 1)
    ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~alpha
    arr[ring] = (*OUTLINE, 255)
    return Image.fromarray(arr)
