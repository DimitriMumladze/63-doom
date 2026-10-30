"""Office art for 63 Office Hell, recreated from assets/source/office.jpg.

Walls are 64x128 (walls are two map units tall), floor/ceiling flats 64x64,
props are transparent billboards. The mural is rectified straight out of the
photo (only the band above everyone's heads, with the hanging lamps painted
out), so no real people end up in the game.

Outputs: assets/textures/*.png and assets/props/*.png
"""
from pathlib import Path
import math
import random

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import spritekit as sk

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source" / "office.jpg"
TEX = ROOT / "assets" / "textures"
PROPS = ROOT / "assets" / "props"
TEX.mkdir(parents=True, exist_ok=True)
PROPS.mkdir(parents=True, exist_ok=True)

TW, TH = 64, 128
MURAL_TILES = 12
rnd = random.Random(63)
rng = np.random.default_rng(63)


def quantize(img, n=48):
    """Posterize a texture to n colours (keeps alpha)."""
    rgb = img.convert("RGB").quantize(n, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    if img.mode == "RGBA":
        rgb.putalpha(img.getchannel("A"))
    return rgb


def noise(w, h, amp, scale=8, fine=0.4):
    n = rng.normal(0, 1, (h // scale + 2, w // scale + 2))
    n = np.asarray(Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8))
                   .resize((w, h), Image.BICUBIC)).astype(float) - 128
    return n / 40 * amp + rng.normal(0, amp * fine, (h, w))


def flat(w, h, rgb, amp=8, scale=8):
    arr = np.empty((h, w, 3))
    arr[:] = rgb
    arr += noise(w, h, amp, scale)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# --------------------------------------------------------------------------
# mural from the photo
# --------------------------------------------------------------------------
def mural():
    img = cv2.imread(str(SRC))
    # paint out the hanging lamps that cross the mural
    mask = np.zeros(img.shape[:2], np.uint8)
    for (x0, y0, x1, y1, t) in [(575, 507, 685, 507, 14), (875, 473, 1010, 473, 14),
                                (1462, 414, 1830, 377, 18), (1300, 360, 1330, 360, 6)]:
        cv2.line(mask, (x0, y0), (x1, y1), 255, t)
    img = cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)
    # wall quad: top edge under the ceiling, bottom edge just above the heads
    top_l, top_r = (604, 455), (2000, 250)
    bot_l, bot_r = (604, 642), (2000, 698)
    W, Hh = MURAL_TILES * TW * 4, 84 * 4
    M = cv2.getPerspectiveTransform(np.float32([top_l, top_r, bot_r, bot_l]),
                                    np.float32([[0, 0], [W, 0], [W, Hh], [0, Hh]]))
    flat_img = cv2.warpPerspective(img, M, (W, Hh), flags=cv2.INTER_AREA)
    band = Image.fromarray(cv2.cvtColor(flat_img, cv2.COLOR_BGR2RGB))
    band = band.filter(ImageFilter.UnsharpMask(radius=3, percent=80))
    band = band.resize((MURAL_TILES * TW, 84), Image.BOX)

    # lower part of the wall: the mural's grey ground with a skirting board
    strip = Image.new("RGB", (MURAL_TILES * TW, TH))
    base = flat(MURAL_TILES * TW, TH, (150, 146, 142), amp=5)
    strip.paste(base, (0, 0))
    strip.paste(band, (0, 0))
    d = ImageDraw.Draw(strip)
    # soft shadow line under the mural band, plain wall below (desks stand there)
    d.line((0, 84, MURAL_TILES * TW, 84), fill=(120, 116, 112))
    d.rectangle((0, TH - 6, MURAL_TILES * TW, TH), fill=(30, 30, 32))
    strip = quantize(strip, 64)
    for i in range(MURAL_TILES):
        strip.crop((i * TW, 0, (i + 1) * TW, TH)).save(TEX / f"mural_{i:02d}.png")
    strip.save(TEX / "_mural_full.png")


# --------------------------------------------------------------------------
# procedural walls
# --------------------------------------------------------------------------
def skirting(d, col=(28, 28, 30)):
    d.rectangle((0, TH - 6, TW, TH), fill=col)


def wall_plaster():
    im = flat(TW, TH, (178, 162, 130), amp=6)
    skirting(ImageDraw.Draw(im))
    return im


def wall_window():
    im = Image.new("RGB", (TW, TH))
    arr = np.zeros((TH, TW, 3))
    y = np.linspace(0, 1, TH)[:, None]
    arr[:] = np.array([226, 232, 236])
    arr += (noise(TW, TH, 6, 16))[..., None]
    arr[..., 2] += 6 * y
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    # faint city blocks through the glass, lower half
    for i in range(5):
        x = rnd.randint(2, 54)
        d.rectangle((x, 64 + rnd.randint(0, 20), x + rnd.randint(6, 12), 112), fill=(200, 206, 212))
    frame = (54, 56, 60)
    d.rectangle((0, 0, 3, TH), fill=frame)
    d.rectangle((TW - 3, 0, TW, TH), fill=frame)
    d.rectangle((0, 0, TW, 4), fill=frame)
    d.rectangle((0, 44, TW, 47), fill=frame)
    d.rectangle((0, 112, TW, TH), fill=frame)
    d.line((5, 10, 20, 40), fill=(245, 248, 250), width=2)
    return im


def wall_cabinet():
    im = flat(TW, TH, (184, 146, 100), amp=5, scale=4)
    arr = np.asarray(im).astype(float)
    arr += (np.sin(np.arange(TW) * 1.7)[None, :] * 4)[..., None]       # vertical grain
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.line((32, 0, 32, TH), fill=(110, 84, 56), width=1)
    d.line((0, 38, TW, 38), fill=(110, 84, 56), width=1)
    d.line((0, 0, 0, TH), fill=(110, 84, 56), width=1)
    for x in (28, 36):
        d.rounded_rectangle((x - 1, 16, x + 1, 30), 1, fill=(200, 200, 204))
        d.rounded_rectangle((x - 1, 52, x + 1, 74), 1, fill=(200, 200, 204))
    skirting(d, (60, 50, 40))
    return im


def wall_concrete():
    im = flat(TW, TH, (126, 122, 116), amp=12, scale=6)
    d = ImageDraw.Draw(im)
    for y in (0, 42, 84):
        d.line((0, y, TW, y), fill=(98, 96, 92))
    for (x, y) in [(10, 20), (50, 20), (10, 62), (50, 62), (10, 104), (50, 104)]:
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(84, 82, 80))
    return im


def wall_radiator():
    im = wall_plaster()
    d = ImageDraw.Draw(im)
    d.rectangle((4, 74, TW - 4, 116), fill=(30, 30, 32))
    for x in range(6, TW - 4, 6):
        d.line((x, 76, x, 114), fill=(52, 52, 56))
    return im


def wall_door():
    im = flat(TW, TH, (176, 136, 90), amp=4, scale=4)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, TW - 1, TH - 1), outline=(40, 40, 44), width=3)
    d.rectangle((12, 16, 52, 52), fill=(60, 70, 76), outline=(40, 40, 44))
    d.line((14, 18, 28, 50), fill=(110, 124, 130), width=2)
    d.rectangle((48, 70, 54, 74), fill=(210, 210, 214))
    return im


def wall_server():
    im = flat(TW, TH, (26, 28, 32), amp=4)
    d = ImageDraw.Draw(im)
    d.rectangle((2, 2, TW - 3, TH - 3), outline=(60, 62, 70), width=2)
    for y in range(8, TH - 10, 9):
        d.rectangle((6, y, TW - 7, y + 6), fill=(40, 42, 48), outline=(58, 60, 66))
        for x in range(10, 30, 5):
            d.point((x, y + 3), fill=rnd.choice([(60, 220, 120), (60, 220, 120), (240, 180, 40), (40, 40, 44)]))
        d.line((36, y + 3, 54, y + 3), fill=(20, 20, 24))
    return im


def wall_tiles():
    im = flat(TW, TH, (226, 226, 222), amp=3)
    d = ImageDraw.Draw(im)
    for y in range(0, TH, 16):
        d.line((0, y, TW, y), fill=(170, 170, 168))
    for x in range(0, TW, 16):
        d.line((x, 0, x, TH), fill=(170, 170, 168))
    return im


def wall_whiteboard():
    im = wall_plaster()
    d = ImageDraw.Draw(im)
    d.rectangle((4, 22, TW - 4, 86), fill=(236, 238, 240), outline=(150, 152, 156))
    d.line((10, 74, 20, 60, 30, 66, 44, 40, 56, 34), fill=(60, 140, 120), width=2)
    d.text((10, 26), "63", fill=(70, 60, 150))
    d.line((32, 30, 56, 30), fill=(200, 60, 50))
    return im


def gone_wrong(im, seed, amount=1.0):
    """Blood splatter + scorch for the 'office gone wrong' variants."""
    r = random.Random(seed)
    im = im.copy()
    d = ImageDraw.Draw(im)
    for _ in range(int(10 * amount)):
        x, y, s = r.randint(0, TW), r.randint(20, TH - 20), r.randint(2, 7)
        d.ellipse((x - s, y - s, x + s, y + s), fill=r.choice(sk.BLOOD))
    for _ in range(int(3 * amount)):
        x = r.randint(4, TW - 4)
        y = r.randint(30, 80)
        d.line((x, y, x + r.randint(-2, 2), y + r.randint(14, 40)), fill=(120, 0, 0), width=2)
    arr = np.asarray(im).astype(float)
    arr *= 0.78
    arr[..., 0] *= 1.12
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# --------------------------------------------------------------------------
# floor and ceiling (64x64)
# --------------------------------------------------------------------------
def floor_oak():
    im = Image.new("RGB", (64, 64))
    d = ImageDraw.Draw(im)
    for row in range(8):
        y = row * 8
        off = (row * 23) % 64
        for k in range(-1, 2):
            x0 = off + k * 64 - 32
            base = rnd.choice([(196, 140, 78), (206, 152, 88), (186, 132, 72), (200, 146, 84)])
            d.rectangle((x0, y, x0 + 63, y + 7), fill=base)
            d.line((x0, y, x0, y + 7), fill=(130, 88, 46))
        d.line((0, y + 7, 64, y + 7), fill=(150, 104, 58))
    arr = np.asarray(im).astype(float)
    arr += noise(64, 64, 5, 4)[..., None] + (np.sin(np.arange(64) * 0.9)[None, :] * 3)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def ceiling_concrete():
    im = flat(64, 64, (98, 94, 88), amp=10, scale=6)
    d = ImageDraw.Draw(im)
    d.line((0, 0, 64, 0), fill=(80, 78, 74))
    d.line((0, 32, 64, 32), fill=(84, 82, 78))
    return im


def ceiling_tray():
    im = ceiling_concrete()
    d = ImageDraw.Draw(im)
    d.rectangle((0, 22, 64, 42), fill=(150, 152, 156))
    for x in range(2, 64, 6):
        d.rectangle((x, 26, x + 2, 28), fill=(90, 92, 96))
        d.rectangle((x + 3, 35, x + 5, 37), fill=(90, 92, 96))
    d.line((0, 22, 64, 22), fill=(190, 192, 196))
    d.line((0, 10, 64, 10), fill=(30, 30, 32), width=3)                   # black pipe
    return im


def ceiling_light():
    im = ceiling_concrete()
    d = ImageDraw.Draw(im)
    d.rectangle((0, 26, 64, 38), fill=(36, 36, 38))
    d.rectangle((0, 29, 64, 35), fill=(255, 246, 220))
    return im


# --------------------------------------------------------------------------
# props (billboards), painted at 4x with the sprite kit
# --------------------------------------------------------------------------
OAK = (196, 150, 96)
BLACK = (30, 30, 34)


def finish(hi, name, n=64):
    small = hi.resize((hi.width // 4, hi.height // 4), Image.BOX)
    a = np.asarray(small.getchannel("A")) > 110
    rgb = quantize(small.convert("RGB"), n)
    arr = np.zeros((small.height, small.width, 4), np.uint8)
    arr[..., :3] = np.asarray(rgb)
    arr[..., 3] = a * 255
    pad = np.pad(a, 1)
    ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~a
    arr[ring] = (*sk.OUTLINE, 255)
    Image.fromarray(arr).save(PROPS / f"{name}.png")


def monitor(d, x, y, w, h, screen_seed, broken=False):
    d.rectangle((x, y, x + w, y + h), fill=(14, 14, 16))
    r = random.Random(screen_seed)
    if broken:
        d.rectangle((x + 6, y + 6, x + w - 6, y + h - 6), fill=(20, 22, 30))
        d.line((x + 10, y + 10, x + w - 20, y + h - 8), fill=(200, 210, 230), width=3)
        d.line((x + w - 30, y + 8, x + 30, y + h - 12), fill=(200, 210, 230), width=2)
    else:
        d.rectangle((x + 6, y + 6, x + w - 6, y + h - 6), fill=(30, 34, 44))
        for i in range(8):
            ly = y + 14 + i * (h - 24) / 8
            lx = x + 12 + r.randint(0, 3) * 8
            d.line((lx, ly, lx + r.randint(20, w - 50), ly),
                   fill=r.choice([(120, 200, 255), (240, 200, 120), (180, 240, 160), (230, 230, 230)]), width=4)
    d.rectangle((x + w / 2 - 8, y + h, x + w / 2 + 8, y + h + 30), fill=(20, 20, 22))
    d.rectangle((x + w / 2 - 34, y + h + 26, x + w / 2 + 34, y + h + 34), fill=(20, 20, 22))


def desk(name, broken=False, blood=False, lego=False):
    w, h = 128 * 4, 96 * 4
    c = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(c)
    # divider panel, two monitors, then desk top edge and legs
    sk.fill(c, OAK, sk.rrect_mask((40, 40, w - 40, 210), 6, (w, h)), lo=0.75, hi=1.1, curve=0.2)
    d = ImageDraw.Draw(c)
    monitor(d, 60, 90, 170, 110, 1, broken)
    monitor(d, 282, 96, 160, 104, 2)
    d.rectangle((0, 236, w, 262), fill=OAK)
    d.rectangle((0, 256, w, 262), fill=(150, 108, 64))
    d.rectangle((90, 226, 220, 240), fill=(40, 40, 44))             # keyboard
    d.rectangle((300, 226, 420, 240), fill=(40, 40, 44))
    if lego:
        for i in range(10):
            x = 240 + i * 8
            d.rectangle((x, 214, x + 6, 236), fill=rnd.choice([(220, 40, 40), (250, 200, 40), (40, 120, 220), (60, 180, 80)]))
    else:
        d.rectangle((450, 196, 470, 236), fill=(190, 220, 240))     # water bottle
        d.rectangle((452, 186, 468, 196), fill=(40, 90, 200))
    for x in (14, w - 30):
        d.rectangle((x, 262, x + 16, h), fill=BLACK)
    d.rectangle((14, h - 70, w - 14, h - 60), fill=BLACK)
    if blood:
        sk.blood_drops(c, 300, 180, 14, 90, seed=8)
    finish(c, name)


def chair(name, back_rgb, mesh=True):
    w, h = 64 * 4, 88 * 4
    c = Image.new("RGBA", (w, h))
    sk.fill(c, back_rgb, sk.rrect_mask((40, 10, w - 40, 190), 40, (w, h)), lo=0.6, hi=1.2)
    d = ImageDraw.Draw(c)
    if mesh:
        for x in range(50, w - 40, 10):
            d.line((x, 20, x, 180), fill=sk.mul(back_rgb, 0.6), width=2)
    sk.fill(c, sk.mul(back_rgb, 0.9), sk.rrect_mask((30, 190, w - 30, 236), 18, (w, h)), lo=0.6, hi=1.2)
    d = ImageDraw.Draw(c)
    d.rectangle((w / 2 - 8, 236, w / 2 + 8, 300), fill=(60, 62, 66))
    for k in (-1, 0, 1):
        d.line((w / 2, 300, w / 2 + k * 100, 330), fill=(40, 40, 44), width=12)
        d.ellipse((w / 2 + k * 100 - 14, 322, w / 2 + k * 100 + 14, 350), fill=(20, 20, 22))
    for k in (-1, 1):
        d.rounded_rectangle((w / 2 + k * 100 - 14, 150, w / 2 + k * 100 + 14, 196), 6, fill=(30, 30, 34))
    finish(c, name)


def bin_prop():
    w, h = 32 * 4, 44 * 4
    c = Image.new("RGBA", (w, h))
    sk.fill(c, (28, 28, 30), sk.poly_mask([(6, 20), (w - 6, 20), (w - 18, h - 4), (18, h - 4)], (w, h)), lo=0.6, hi=1.4)
    d = ImageDraw.Draw(c)
    d.rectangle((0, 12, w, 26), fill=(40, 40, 44))
    for x in range(14, w - 14, 14):
        d.line((x, 30, x + 4, h - 10), fill=(46, 46, 50), width=3)
    finish(c, "bin")


def plant():
    w, h = 48 * 4, 72 * 4
    c = Image.new("RGBA", (w, h))
    sk.fill(c, (220, 220, 214), sk.poly_mask([(40, 190), (w - 40, 190), (w - 56, h - 4), (56, h - 4)], (w, h)), lo=0.7, hi=1.2)
    d = ImageDraw.Draw(c)
    r = random.Random(4)
    for _ in range(28):
        a = r.uniform(-2.6, -0.5)
        L = r.uniform(60, 170)
        x0, y0 = w / 2, 190
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        d.line((x0, y0, x1, y1), fill=(40, 100, 50), width=4)
        d.ellipse((x1 - 16, y1 - 10, x1 + 16, y1 + 10), fill=r.choice([(50, 140, 70), (70, 160, 80), (40, 110, 60)]))
    finish(c, "plant")


def lamp():
    """Hanging linear light, drawn near the ceiling by the engine."""
    w, h = 112 * 4, 40 * 4
    c = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(c)
    d.line((60, 0, 60, 110), fill=(20, 20, 20), width=3)
    d.line((w - 60, 0, w - 60, 110), fill=(20, 20, 20), width=3)
    d.rectangle((10, 110, w - 10, 140), fill=(24, 24, 26))
    d.rectangle((14, 136, w - 14, 150), fill=(255, 246, 220))
    finish(c, "lamp")


def blood_pool():
    w, h = 64 * 4, 16 * 4
    c = Image.new("RGBA", (w, h))
    ImageDraw.Draw(c).ellipse((10, 6, w - 10, h - 6), fill=(110, 0, 0, 255))
    sk.blood_drops(c, w / 2, h / 2, 10, 110, seed=2)
    finish(c, "blood_pool")


def spark_frames():
    for i in range(2):
        w = 40 * 4
        c = Image.new("RGBA", (w, w))
        b = sk.burst(w - 20 - i * 30, [(255, 255, 255), (200, 230, 255), (120, 180, 255), (60, 120, 240), (40, 60, 200), (30, 30, 120)], seed=30 + i)
        c.alpha_composite(b, (10 + i * 15, 10 + i * 15))
        finish(c, f"spark_{i}")


def main():
    mural()
    walls = {
        "plaster": wall_plaster(), "window": wall_window(), "cabinet": wall_cabinet(),
        "concrete": wall_concrete(), "radiator": wall_radiator(), "door": wall_door(),
        "server": wall_server(), "tiles": wall_tiles(), "whiteboard": wall_whiteboard(),
    }
    for k, im in walls.items():
        quantize(im).save(TEX / f"{k}.png")
    for k in ("plaster", "concrete", "server", "tiles"):
        quantize(gone_wrong(walls[k], seed=len(k))).save(TEX / f"{k}_hell.png")
    quantize(floor_oak()).save(TEX / "floor_oak.png")
    quantize(gone_wrong(floor_oak().resize((64, 128)), 3).resize((64, 64))).save(TEX / "floor_oak_hell.png")
    quantize(flat(64, 64, (120, 122, 126), amp=8)).save(TEX / "floor_server.png")
    quantize(ceiling_concrete()).save(TEX / "ceil_concrete.png")
    quantize(ceiling_tray()).save(TEX / "ceil_tray.png")
    quantize(ceiling_light()).save(TEX / "ceil_light.png")

    desk("desk"), desk("desk_lego", lego=True), desk("desk_broken", broken=True, blood=True)
    chair("chair_black", (36, 36, 40)), chair("chair_grey", (150, 146, 138), mesh=False)
    bin_prop(), plant(), lamp(), blood_pool(), spark_frames()
    print("textures:", len(list(TEX.glob("*.png"))), "props:", len(list(PROPS.glob("*.png"))))


if __name__ == "__main__":
    main()
