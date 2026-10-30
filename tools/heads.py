"""Cut each colleague's head out of their photo.

Per photo we hand-place an ellipse around the head (after an optional rotation
to level the eyes). Outside a slightly grown ellipse is definite background,
the inner core is definite foreground, and GrabCut decides the edge band in
between. Output: assets/source/heads/<id>.png (RGBA, upright, tightly cropped)
plus assets/source/heads/_debug.png for checking every cut by eye.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source"
OUT = SRC / "heads"
OUT.mkdir(parents=True, exist_ok=True)

# id: photo, rotate (deg, PIL ccw) about centre, head ellipse (cx, cy, rx, ry)
# in rotated coords, chin_y (cut neck just below), upscale for low-res photos.
HEADS = {
    "brute": dict(photo="p1_brute.jpg", rot=0, ell=(1000, 728, 388, 468), chin=1235, up=1.0),
    "specs": dict(photo="p2_specs.jpg", rot=0, ell=(532, 492, 112, 138), chin=640, up=2.0, sat=0.8),
    "tank":  dict(photo="p3_tank.jpg",  rot=0, ell=(500, 510, 98, 120), chin=648, up=2.0),
    "hood":  dict(photo="p4_hood.jpg",  rot=28, center=(450, 545), ell=(412, 510, 262, 325),
                  chin=850, up=1.0),
    "beard": dict(photo="p5_beard.jpg", rot=0, ell=(270, 340, 124, 170), chin=566, up=2.5,
                  # the dark beard sits on a dark hoodie: force it in by hand
                  force=[(156, 372), (386, 372), (380, 450), (352, 520), (302, 560),
                         (238, 560), (188, 518), (162, 450)]),
    "irakli": dict(photo="p7_irakli.png", rot=0, ell=(402, 270, 150, 200), chin=528, up=1.0, sat=0.85,
                   force=[(262, 320), (548, 320), (542, 420), (502, 490), (432, 524), (368, 524),
                          (300, 490), (266, 420)]),
    "rider": dict(photo="p6_rider.jpg", rot=0, ell=(523, 322, 94, 134), chin=462, up=2.0, sat=0.72),
}


def ellipse_mask(shape, cx, cy, rx, ry):
    m = np.zeros(shape[:2], np.uint8)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 255, -1)
    return m


def cut_head(cfg):
    im = Image.open(SRC / cfg["photo"]).convert("RGB")
    if cfg["rot"]:
        im = im.rotate(cfg["rot"], resample=Image.BICUBIC, center=cfg.get("center"),
                       fillcolor=(0, 0, 0))
    up = cfg["up"]
    cx, cy, rx, ry = cfg["ell"]
    chin = cfg["chin"]
    if up != 1:
        im = im.resize((round(im.width * up), round(im.height * up)), Image.LANCZOS)
        cx, cy, rx, ry, chin = cx * up, cy * up, rx * up, ry * up, chin * up
    img = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)

    mask = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)
    mask[ellipse_mask(img.shape, cx, cy, rx * 1.12, ry * 1.08) > 0] = cv2.GC_PR_BGD
    mask[ellipse_mask(img.shape, cx, cy, rx * 0.97, ry * 0.97) > 0] = cv2.GC_PR_FGD
    mask[ellipse_mask(img.shape, cx, cy, rx * 0.72, ry * 0.78) > 0] = cv2.GC_FGD
    mask[int(chin):, :] = cv2.GC_BGD
    if "force" in cfg:
        pts = (np.array(cfg["force"], np.float32) * up).astype(np.int32)
        cv2.fillPoly(mask, [pts], int(cv2.GC_FGD))
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # keep the biggest blob, fill holes, smooth the edge
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = np.where(lab == big, 255, 0).astype(np.uint8)
    flood = fg.copy()
    h, w = fg.shape
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    fg = fg | cv2.bitwise_not(flood)
    k = max(3, int(rx * 0.04) | 1)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    fg = cv2.GaussianBlur(fg, (k, k), 0)
    fg = np.where(fg > 127, 255, 0).astype(np.uint8)

    rgba = im.convert("RGBA")
    rgba.putalpha(Image.fromarray(fg))
    box = rgba.getbbox()
    return rgba.crop(box), im, fg


def grade(head, target_mean=150.0, sat=0.9):
    """Even out exposure / white balance across photos, then sharpen features."""
    rgb = head.convert("RGB")
    a = np.asarray(head.getchannel("A")) > 0
    arr = np.asarray(rgb).astype(float)
    skin = arr[a]
    lum = skin.mean()
    arr *= target_mean / max(lum, 1)
    # nudge white balance toward a common warm skin ratio (R:G:B ~ 1 : .72 : .6)
    m = arr[a].mean(0)
    want = np.array([1.0, 0.72, 0.60]) * m.sum() / 2.32
    arr = arr * (0.6 + 0.4 * want / np.maximum(m, 1))
    rgb = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    radius = max(2, head.width / 80)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=radius, percent=110, threshold=2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    out = rgb.convert("RGBA")
    out.putalpha(head.getchannel("A"))
    return out


def main():
    debug = []
    for key, cfg in HEADS.items():
        head, full, fg = cut_head(cfg)
        head = grade(head, sat=cfg.get("sat", 0.9))
        head.save(OUT / f"{key}.png")
        # debug: head on magenta, normalised to 300 px tall
        dbg = Image.new("RGBA", head.size, (255, 0, 255, 255))
        dbg.alpha_composite(head)
        dbg = dbg.resize((round(head.width * 300 / head.height), 300), Image.LANCZOS)
        debug.append(dbg)
        print(key, head.size)
    W = sum(d.width for d in debug) + 10 * len(debug)
    sheet = Image.new("RGBA", (W, 300), (20, 20, 20, 255))
    x = 0
    for d in debug:
        sheet.alpha_composite(d, (x, 0))
        x += d.width + 10
    sheet.save(OUT / "_debug.png")


if __name__ == "__main__":
    main()
