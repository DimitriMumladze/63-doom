"""Render an in-game style still of the office with the crew, for approval.

A tiny numpy raycaster using the same conventions the JS engine will use:
walls 2 units tall, eye height 1.0, characters 1.25 units tall, textured
floor/ceiling, distance shading, z-buffered billboards.
Output: assets/chars/office_preview.png (960x600 with a mock status bar).
"""
from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / "assets" / "textures"
P = ROOT / "assets" / "props"
C = ROOT / "assets" / "chars"

SW, SH = 480, 270
VIEW_H = 230
WALL_H, EYE = 2.0, 1.0
FOV = math.radians(66)
PROJ = (SW / 2) / math.tan(FOV / 2)
CY = VIEW_H / 2


def load(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)


# map: '.' empty, letters = wall texture keys
LEGEND = {"W": "window", "P": "plaster", "R": "radiator", "C": "cabinet", "D": "door", "K": "concrete"}
MAP = [
    "KMMMMMMMMMMMMK",
    "W............R",
    "W............P",
    "W............R",
    "W............P",
    "W............R",
    "W............P",
    "W............K",
    "KCCCCCDCCCCCCK",
]
tex = {k: load(T / f"{v}.png") for k, v in LEGEND.items()}
mural = [load(T / f"mural_{i:02d}.png") for i in range(12)]
floor_t = load(T / "floor_oak.png")
ceil_t = load(T / "ceil_concrete.png")
ceil_tray = load(T / "ceil_tray.png")
ceil_light = load(T / "ceil_light.png")


def wall_tex(cell, mx, my):
    if cell == "M":
        return mural[(mx - 1) % 12]
    return tex[cell]


def render(px, py, ang, sprites, target=None):
    img = np.zeros((VIEW_H, SW, 3), np.float32)
    zbuf = np.full(SW, 1e9)
    dx, dy = math.cos(ang), math.sin(ang)
    plx, ply = -dy * math.tan(FOV / 2), dx * math.tan(FOV / 2)

    # floor + ceiling
    ys = np.arange(VIEW_H)
    for y in range(VIEW_H):
        if abs(y + 0.5 - CY) < 0.5:
            continue
        floor = y > CY
        dist = (EYE if floor else WALL_H - EYE) * PROJ / abs(y + 0.5 - CY)
        cam = (np.arange(SW) + 0.5) / SW * 2 - 1
        rx, ry = dx + plx * cam, dy + ply * cam
        wx, wy = px + rx * dist, py + ry * dist
        if floor:
            t = floor_t
            u = ((wx * 64) % 64).astype(int)
            v = ((wy * 64) % 64).astype(int)
            col = t[v, u, :3]
        else:
            u = ((wx * 64) % 64).astype(int)
            v = ((wy * 64) % 64).astype(int)
            cell_y = np.floor(wy).astype(int)
            col = np.where(((cell_y % 3) == 1)[:, None], ceil_light[v, u, :3],
                           np.where(((cell_y % 3) == 2)[:, None], ceil_tray[v, u, :3], ceil_t[v, u, :3]))
        shade = min(1.0, max(0.4, 1.2 - dist / 16))
        img[y] = col * shade

    # walls (DDA)
    for x in range(SW):
        cam = (x + 0.5) / SW * 2 - 1
        rx, ry = dx + plx * cam, dy + ply * cam
        mx, my = int(px), int(py)
        ddx, ddy = abs(1 / rx) if rx else 1e30, abs(1 / ry) if ry else 1e30
        sx, sy = (1 if rx > 0 else -1), (1 if ry > 0 else -1)
        side_x = ((mx + 1 - px) if rx > 0 else (px - mx)) * ddx
        side_y = ((my + 1 - py) if ry > 0 else (py - my)) * ddy
        while True:
            if side_x < side_y:
                side_x += ddx; mx += sx; side = 0
            else:
                side_y += ddy; my += sy; side = 1
            cell = MAP[my][mx]
            if cell != ".":
                break
        dist = (side_x - ddx) if side == 0 else (side_y - ddy)
        hit = (py + dist * ry) if side == 0 else (px + dist * rx)
        u = int((hit - math.floor(hit)) * 64)
        t = wall_tex(cell, mx, my)
        top = CY - (WALL_H - EYE) * PROJ / dist
        bot = CY + EYE * PROJ / dist
        y0, y1 = max(0, int(top)), min(VIEW_H, int(bot))
        if y1 <= y0:
            continue
        v = ((np.arange(y0, y1) + 0.5 - top) / (bot - top) * t.shape[0]).astype(int).clip(0, t.shape[0] - 1)
        shade = max(0.4, 1.2 - dist / 16) * (0.82 if side else 1.0)
        img[y0:y1, x] = t[v, min(u, 63), :3] * shade
        zbuf[x] = dist

    # sprites, far to near
    spr = []
    for (sx_, sy_, im, h_units, lift) in sprites:
        vx, vy = sx_ - px, sy_ - py
        inv = 1 / (plx * dy - dx * ply)
        tx = inv * (dy * vx - dx * vy)
        ty = inv * (-ply * vx + plx * vy)
        if ty > 0.1:
            spr.append((ty, tx, im, h_units, lift))
    for ty, tx, im, h_units, lift in sorted(spr, key=lambda s: -s[0]):
        scr_x = SW / 2 * (1 + tx / ty)
        hpx = h_units * PROJ / ty
        wpx = hpx * im.shape[1] / im.shape[0]
        bottom = CY + (EYE - lift) * PROJ / ty
        top = bottom - hpx
        x0, x1 = int(scr_x - wpx / 2), int(scr_x + wpx / 2)
        shade = max(0.4, 1.2 - ty / 16)
        for x in range(max(0, x0), min(SW, x1)):
            if ty >= zbuf[x]:
                continue
            u = int((x - (scr_x - wpx / 2)) / wpx * im.shape[1])
            ya, yb = max(0, int(top)), min(VIEW_H, int(bottom))
            if yb <= ya:
                continue
            v = ((np.arange(ya, yb) + 0.5 - top) / hpx * im.shape[0]).astype(int).clip(0, im.shape[0] - 1)
            col = im[v, min(u, im.shape[1] - 1)]
            a = col[:, 3:] / 255
            img[ya:yb, x] = img[ya:yb, x] * (1 - a) + col[:, :3] * shade * a
    return np.clip(img, 0, 255).astype(np.uint8)


def main():
    def ch(name, frame="idle"):
        return load(C / name / f"{frame}.png")

    sprites = []
    # three rows of desks with chairs, like the photo
    for row_y in (3.2, 5.2):
        for i, x in enumerate(np.arange(3.0, 12.0, 1.05)):
            kind = "desk_lego" if (i == 3 and row_y > 4) else ("desk_broken" if i == 6 and row_y < 4 else "desk")
            sprites.append((x, row_y, load(P / f"{kind}.png"), 0.62, 0))
            if i % 2 == 0:
                sprites.append((x + 0.2, row_y + 0.55, load(P / ("chair_grey.png" if i == 4 else "chair_black.png")), 0.6, 0))
    sprites.append((1.6, 2.0, load(P / "plant.png"), 0.6, 0))
    sprites.append((12.4, 6.5, load(P / "bin.png"), 0.36, 0))
    for x in np.arange(3.0, 12.0, 3.0):
        for y in (2.2, 4.2, 6.2):
            sprites.append((x, y, load(P / "lamp.png"), 0.35, WALL_H - 0.55))
    sprites.append((5.3, 6.6, load(P / "blood_pool.png"), 0.14, 0))

    crew = [("rider", 4.7, 6.0, "walk2"), ("brute", 6.6, 6.7, "attack1"), ("specs", 8.2, 4.4, "idle"),
            ("tank", 10.0, 6.4, "walk1"), ("hood", 6.2, 2.4, "idle"), ("beard", 11.3, 1.8, "idle")]
    for name, x, y, fr in crew:
        h = 1.25 * (1.15 if name == "beard" else 1.0)
        sprites.append((x, y, ch(name, fr), h, 0))

    views = [render(2.2, 7.4, math.radians(-28), sprites),
             render(7.0, 7.6, math.radians(-90), sprites)]
    for n, view in enumerate(views):
        im = Image.fromarray(view)
        # mock status bar with the 63 logo and the targeted enemy's face
        bar = Image.new("RGB", (SW, SH - VIEW_H), (44, 42, 52))
        d = ImageDraw.Draw(bar)
        d.line((0, 0, SW, 0), fill=(68, 218, 157), width=2)
        try:
            f = ImageFont.truetype("arialbd.ttf", 13)
            fs = ImageFont.truetype("arialbd.ttf", 9)
        except OSError:
            f = fs = ImageFont.load_default()
        logo = Image.open(ROOT / "assets" / "source" / "logo63.jpg").convert("RGB").resize((32, 32), Image.LANCZOS)
        bar.paste(logo, (6, 5))
        d.text((48, 6), "HEALTH 100%", fill=(230, 60, 50), font=f)
        d.text((48, 22), "AMMO 50", fill=(230, 60, 50), font=f)
        face = Image.open(C / "brute" / "face.png").resize((32, 32), Image.NEAREST)
        bar.paste(Image.new("RGB", (36, 36), (20, 20, 26)), (300, 3))
        bar.paste(face, (302, 5), face)
        d.text((342, 6), "RED", fill=(68, 218, 157), font=f)
        d.rectangle((342, 24, 470, 31), outline=(68, 218, 157))
        d.rectangle((344, 26, 440, 29), fill=(230, 60, 50))
        d.text((200, 14), "KILLS 0/6", fill=(230, 230, 230), font=fs)
        full = Image.new("RGB", (SW, SH))
        full.paste(im, (0, 0))
        full.paste(bar, (0, VIEW_H))
        full.resize((SW * 2, SH * 2), Image.NEAREST).save(C / f"office_preview_{n}.png")
    print("ok")


if __name__ == "__main__":
    main()
