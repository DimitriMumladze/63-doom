"""Build every 63 crew enemy: frames, HUD face, and approval sheets.

Run tools/heads.py first (it writes assets/source/heads/*.png).
Outputs:
  assets/chars/<id>/<frame>.png   game frames (128x256, death frames 256x256)
  assets/chars/<id>/face.png      64x64 HUD portrait
  assets/chars/lineup.png         all six idle at 2x (approval)
  assets/chars/faces.png          face close-ups at 4x (approval)
  assets/chars/<id>_strip.png     every frame of one character at 2x
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import spritekit as sk
import bodies

ROOT = Path(__file__).resolve().parent.parent
HEADS = ROOT / "assets" / "source" / "heads"
OUT = ROOT / "assets" / "chars"

ROSTER = [
    dict(id="brute", name="DIMITRI", role="Fireball thrower", weapon="fireball",
         top="sweater", top_rgb=(150, 28, 34), sleeve="long", knit=True,
         bottom="jeans", pants_rgb=(54, 58, 74), shoe_rgb=(52, 36, 28),
         shoulder=172, waist=142, hp=60),
    dict(id="tank", name="NIKOLOZ", role="Brawler (melee charger)", weapon="fists",
         top="tee", top_rgb=(88, 124, 146), sleeve="short",
         bottom="shorts", pants_rgb=(42, 42, 48), shoe_rgb=(214, 214, 210), sole_rgb=(60, 60, 64),
         shoulder=180, waist=140, hp=120),
    dict(id="irakli", name="IRAKLI", role="Shotgunner", weapon="shotgun",
         top="tee", top_rgb=(222, 220, 214), stripes=(208, 158, 70), sleeve="short", head_h=262, overlap=56,
         bottom="jeans", pants_rgb=(58, 66, 92), shoe_rgb=(40, 36, 34),
         shoulder=164, waist=138, hp=50),
    dict(id="beard", name="BIG DIMITRI", role="Boss: rocket launcher", weapon="rocket",
         top="hoodie", top_rgb=(42, 40, 42), sleeve="long", head_h=272, overlap=64,
         bottom="cargo", pants_rgb=(60, 60, 52), shoe_rgb=(44, 34, 28),
         shoulder=184, waist=152, hp=400, scale=1.15),
    dict(id="rider", name="LASHA", role="Plasma rifle, fast", weapon="plasma", seated=True,
         top="tee", top_rgb=(36, 34, 36), sleeve="short",
         bottom="cargo", pants_rgb=(40, 38, 40), shoe_rgb=(30, 30, 32), sole_rgb=(225, 222, 214),
         shoulder=150, waist=126, hp=70),
]

STAND_FRAMES = {
    "idle": {},
    "walk1": {"bob": 8, "lift_r": 34, "lx": -6, "rx": 8, "swing": -14},
    "walk2": {"bob": 0},
    "walk3": {"bob": 8, "lift_l": 34, "lx": -8, "rx": 6, "swing": 14},
    "attack1": {"act": "wind", "bob": 4},
    "attack2": {"act": "fire", "bob": -4},
}
SEAT_FRAMES = {
    "idle": {"push": 0},
    "walk1": {"push": 0, "spin": 0.0, "lean": 0},
    "walk2": {"push": 1, "spin": 0.26, "lean": 8},
    "walk3": {"push": 2, "spin": 0.52, "lean": 14},
    "walk4": {"push": 3, "spin": 0.70, "lean": 4},
    "attack1": {"act": "wind"},
    "attack2": {"act": "fire"},
}
DEATH_ORDER = ["pain", "death1", "death2", "death3", "death4"]


def knit_texture():
    src = Image.open(ROOT / "assets" / "source" / "guy_cut.png").convert("RGB")
    tile = src.crop((330, 1450, 830, 1800))
    tile = tile.resize((tile.width // 4, tile.height // 4), Image.LANCZOS)
    return sk.tiled(tile)


def striped(base, stripe, period=30, width=9):
    """Breton-style striped tee: soft fabric noise + horizontal stripes."""
    tex = sk.cloth_texture(base, seed=5, grain=6)
    d = ImageDraw.Draw(tex)
    for y in range(0, tex.height, period):
        d.rectangle((0, y, tex.width, y + width), fill=stripe)
    return tex


def sample_skin(head):
    """Forehead is plain skin on everyone (no glasses/beard); it is a highlight,
    so darken a little for arms and necks."""
    a = np.asarray(head).astype(int)
    h, w = a.shape[:2]
    reg = a[int(h * .2):int(h * .32), int(w * .38):int(w * .62)].reshape(-1, 4)
    reg = reg[reg[:, 3] > 0][:, :3]
    return tuple(int(v * 0.86) for v in np.median(reg, 0))


def frames_for(ch):
    hi = {}
    poses = SEAT_FRAMES if ch.get("seated") else STAND_FRAMES
    for name, pose in poses.items():
        hi[name] = bodies.paint(ch, pose)
    base = SEAT_FRAMES["idle"] if ch.get("seated") else {}
    chest_y = 590 if ch.get("seated") else 420

    pn = bodies.paint(ch, dict(base, bob=10, lean=10))
    pn = sk.tint(pn, (255, 40, 30), 0.26)
    sk.blood_drops(pn, sk.HW / 2 + 40, chest_y, 9, 70, seed=3)
    hi["pain"] = pn

    d1 = sk.tint(bodies.paint(ch, dict(base, bob=12, lean=12)), (255, 30, 20), 0.16)
    sk.blood_drops(d1, sk.HW / 2, chest_y, 22, 150, seed=4)
    hi["death1"] = sk.widen(d1)
    if ch.get("seated"):
        body = sk.tint(bodies.paint(ch, base), (120, 0, 0), 0.12)
        sk.blood_drops(body, sk.HW / 2, chest_y, 10, 90, seed=5)
        hi["death2"] = sk.place(body, rot=-24, dx=20)
        hi["death3"] = sk.place(sk.tint(body, (90, 0, 0), 0.1), rot=-64, dx=40)
        last = sk.tint(body, (80, 0, 0), 0.15)
    else:
        d2 = sk.tint(bodies.paint(ch, {"squash": 90, "lx": -14, "rx": 14}), (120, 0, 0), 0.12)
        sk.blood_drops(d2, sk.HW / 2, chest_y + 60, 10, 90, seed=5)
        hi["death2"] = sk.place(d2, rot=-22, dx=24)
        hi["death3"] = sk.place(sk.tint(bodies.paint(ch, {"squash": 120}), (90, 0, 0), 0.15), rot=-62, dx=40)
        last = sk.tint(bodies.paint(ch, {}), (80, 0, 0), 0.2)
    corpse = sk.place(last, rot=-90, sy=0.6)
    pool = Image.new("RGBA", (sk.HDW, sk.HH))
    ImageDraw.Draw(pool).ellipse((60, sk.FLOOR - 90, sk.HDW - 60, sk.FLOOR + 4), fill=(110, 0, 0, 255))
    pool.alpha_composite(corpse, (0, -14))
    hi["death4"] = pool
    return hi


def build(ch, knit):
    ch = dict(ch)
    ch["head"] = Image.open(HEADS / f"{ch['id']}.png")
    ch["skin"] = ch.get("skin") or sample_skin(ch["head"])
    if ch.get("knit"):
        ch["_tex"] = knit
    elif ch.get("stripes"):
        ch["_tex"] = striped(ch["top_rgb"], ch["stripes"])
    else:
        ch["_tex"] = bodies.top_texture(ch)
    hi = frames_for(ch)
    small = {k: sk.to_pixels(v) for k, v in hi.items()}

    face_px = small["idle"][0].crop((24, 0, 104, 72))
    grays = [(v, v, v + 4) for v in range(20, 220, 25)]
    extra = (sk.FIRE + sk.PLASMA + sk.skin_ramp(sk.mul(ch["skin"], 1.25), sk.mul(ch["skin"], 0.18))
             + sk.BLOOD + grays + [bodies.MINT, bodies.PURPLE, sk.OUTLINE])
    pal = sk.build_palette([small["idle"][0], small["walk2"][0]] + [face_px] * 4, extra, n_adaptive=100)

    out = OUT / ch["id"]
    out.mkdir(parents=True, exist_ok=True)
    done = {}
    for k, (rgb, alpha) in small.items():
        done[k] = sk.finalize(rgb, alpha, pal)
        done[k].save(out / f"{k}.png")

    # HUD portrait: the photo head itself, fitted into 64x64
    head = ch["head"]
    s = 64 / max(head.width, head.height)
    face = head.resize((max(1, round(head.width * s)), max(1, round(head.height * s))), Image.LANCZOS)
    port = Image.new("RGBA", (64, 64))
    port.alpha_composite(face, ((64 - face.width) // 2, 64 - face.height))
    a = np.asarray(port.getchannel("A")) > 110
    port = sk.finalize(port.convert("RGB"), a, pal)
    port.save(out / "face.png")
    return ch, done, port


def font(size):
    try:
        return ImageFont.truetype("arialbd.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def main():
    knit = knit_texture()
    meta = {}
    results = []
    for ch in ROSTER:
        c, done, port = build(ch, knit)
        results.append((c, done, port))
        meta[c["id"]] = dict(name=c["name"], role=c["role"], weapon=c["weapon"], hp=c["hp"],
                             scale=c.get("scale", 1.0), seated=bool(c.get("seated")),
                             frames=list(done.keys()))
        print(c["id"], "skin", c["skin"], "frames", len(done))
    (OUT / "roster.json").write_text(json.dumps(meta, indent=2))

    bg, floor = (34, 30, 30, 255), (56, 46, 38, 255)
    # lineup: idle at 2x with names
    cellw = 300
    lineup = Image.new("RGBA", (cellw * len(results), 600), bg)
    d = ImageDraw.Draw(lineup)
    d.rectangle((0, 530, lineup.width, 600), fill=floor)
    for i, (c, done, _) in enumerate(results):
        im = done["idle"].resize((256, 512), Image.NEAREST)
        lineup.alpha_composite(im, (i * cellw + (cellw - 256) // 2, 24))
        d.text((i * cellw + cellw // 2, 548), c["name"], fill=(68, 218, 157), font=font(26), anchor="mm")
        d.text((i * cellw + cellw // 2, 580), c["role"], fill=(220, 214, 200), font=font(15), anchor="mm")
    lineup.save(OUT / "lineup.png")

    # faces: the sprite's head region at 4x next to the HUD portrait
    faces = Image.new("RGBA", (len(results) * 300, 330), bg)
    d = ImageDraw.Draw(faces)
    for i, (c, done, port) in enumerate(results):
        box = (24, 0, 104, 70) if not c.get("seated") else (24, 34, 104, 104)
        crop = done["idle"].crop(box)
        tile = Image.new("RGBA", crop.size, bg)
        tile.alpha_composite(crop)
        faces.alpha_composite(tile.resize((crop.width * 3, crop.height * 3), Image.NEAREST),
                              (i * 300 + 30, 10))
        d.text((i * 300 + 150, 240), c["name"], fill=(68, 218, 157), font=font(22), anchor="mm")
        faces.alpha_composite(port, (i * 300 + 118, 260))
    faces.save(OUT / "faces.png")

    # per-character animation strips at 2x
    for c, done, _ in results:
        names = list(done.keys())
        wsum = sum(done[k].width for k in names) + 12 * (len(names) + 1)
        strip = Image.new("RGBA", (wsum, sk.H + 40), bg)
        ImageDraw.Draw(strip).rectangle((0, sk.H + 12, wsum, sk.H + 40), fill=floor)
        x = 12
        for k in names:
            strip.alpha_composite(done[k], (x, 14))
            x += done[k].width + 12
        strip.resize((strip.width * 2, strip.height * 2), Image.NEAREST).save(OUT / f"{c['id']}_strip.png")


if __name__ == "__main__":
    main()
