"""Step 1: cut the person out of the teal-curtain photo.

Writes assets/source/guy_cut.png (RGBA, full resolution, background transparent).
The curtain is teal (blue > red); skin, sweater and collar all have red >= blue,
so a simple colour key plus "keep the connected blob, fill its holes" is enough.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source" / "guy.jpg"
OUT = ROOT / "assets" / "source" / "guy_cut.png"

img = Image.open(SRC).convert("RGB")
rgb = np.asarray(img).astype(int)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
lum = (r * 3 + g * 6 + b) / 10

person = (r - b > -4) | ((lum > 170) & (np.abs(r - b) < 25))
mask = Image.fromarray((person * 255).astype(np.uint8))
mask = mask.filter(ImageFilter.MedianFilter(7))

# Keep only the blob connected to the face.
seed = (1000, 700)
work = mask.point(lambda v: 255 if v > 127 else 0)
ImageDraw.floodfill(work, seed, 128)
blob = work.point(lambda v: 255 if v == 128 else 0)

# Fill holes (eye whites, collar button shadows...) by flooding the outside.
pad = Image.new("L", (blob.width + 2, blob.height + 2), 0)
pad.paste(blob, (1, 1))
ImageDraw.floodfill(pad, (0, 0), 64)
pad = pad.crop((1, 1, blob.width + 1, blob.height + 1))
filled = pad.point(lambda v: 0 if v == 64 else 255)

# Slightly soften then re-harden the edge so it is not jaggy before downscaling.
filled = filled.filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 127 else 0)

out = img.copy()
out.putalpha(filled)
out.save(OUT)
bbox = filled.getbbox()
print("saved", OUT, "bbox", bbox)
