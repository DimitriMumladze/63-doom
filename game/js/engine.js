// Software raycaster: textured walls (2 units tall), sliding doors, floor and
// ceiling casting, per-cell light/tint, z-buffered billboard sprites.
'use strict';

const VW = 480;           // 3D view width (internal pixels)
const VH = 230;           // 3D view height; the HUD bar sits below
const SCREEN_H = 270;
const CY = VH / 2;
const WALL_H = 2.0;
const EYE = 1.0;          // eye height; equals WALL_H - EYE so floor/ceiling rows mirror
const FOV = 66 * Math.PI / 180;
const PLANE = Math.tan(FOV / 2);
const PROJ = (VW / 2) / PLANE;

const Engine = {
  ctx: null,
  image: null,
  buf: null,
  zbuf: new Float32Array(VW),
  wtop: new Int16Array(VW),      // per-column wall span, so floor/ceiling skip covered pixels
  wbot: new Int16Array(VW),
  flash: 0,               // extra light from muzzle flashes / explosions

  init(canvas) {
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(VW, VH);
    this.buf = new Uint32Array(this.image.data.buffer);
  },

  // ------------------------------------------------------------------
  // lighting helpers
  // ------------------------------------------------------------------
  distLight(d) {
    const v = 1.25 - d / 15;
    return v < 0.22 ? 0.22 : (v > 1 ? 1 : v);
  },

  // ------------------------------------------------------------------
  // ray cast used by gameplay (bullets, sight). Returns euclidean distance
  // to the first solid wall/closed door along (dx, dy) (dx, dy normalized).
  // ------------------------------------------------------------------
  castDist(level, px, py, dx, dy, maxD = 64) {
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let sideX = (dx < 0 ? px - mx : mx + 1 - px) * ddx;
    let sideY = (dy < 0 ? py - my : my + 1 - py) * ddy;
    for (let i = 0; i < 256; i++) {
      let d;
      if (sideX < sideY) { d = sideX; sideX += ddx; mx += sx; } else { d = sideY; sideY += ddy; my += sy; }
      if (d > maxD) return maxD;
      if (mx < 0 || my < 0 || mx >= level.w || my >= level.h) return d;
      const idx = my * level.w + mx;
      if (level.solid[idx]) {
        const door = level.doorAt[idx];
        if (!door) return d;
        const hit = this.doorHit(door, px, py, dx, dy, mx, my);
        if (hit >= 0) return hit;
      }
    }
    return maxD;
  },

  // distance along (rx, ry) to the door plane if the ray hits the closed part, else -1
  doorHit(door, px, py, rx, ry, mx, my) {
    if (door.orient === 'h') {
      if (ry === 0) return -1;
      const t = (my + 0.5 - py) / ry;
      if (t <= 0) return -1;
      const hx = px + t * rx;
      if (Math.floor(hx) !== mx) return -1;
      return (hx - mx) >= door.open ? t : -1;
    }
    if (rx === 0) return -1;
    const t = (mx + 0.5 - px) / rx;
    if (t <= 0) return -1;
    const hy = py + t * ry;
    if (Math.floor(hy) !== my) return -1;
    return (hy - my) >= door.open ? t : -1;
  },

  // ------------------------------------------------------------------
  // frame rendering
  // ------------------------------------------------------------------
  render(cam, level, sprites) {
    const buf = this.buf;
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
    const plX = -dirY * PLANE, plY = dirX * PLANE;
    const px = cam.x, py = cam.y;
    const flash = this.flash;
    const lw = level.w, lh = level.h;

    // ---------------- walls ----------------
    const horizon = this.horizon = cam.horizon === undefined ? CY : cam.horizon;
    const eyeZ = this.eyeZ = cam.eyeZ === undefined ? EYE : cam.eyeZ;
    const zbuf = this.zbuf;
    const wtop = this.wtop, wbot = this.wbot;
    for (let x = 0; x < VW; x++) {
      const camX = 2 * (x + 0.5) / VW - 1;
      const rx = dirX + plX * camX, ry = dirY + plY * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = rx === 0 ? 1e30 : Math.abs(1 / rx);
      const ddy = ry === 0 ? 1e30 : Math.abs(1 / ry);
      const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
      let sideX = (rx < 0 ? px - mx : mx + 1 - px) * ddx;
      let sideY = (ry < 0 ? py - my : my + 1 - py) * ddy;
      let side = 0, dist = 64, u = 0, tex = null, pmx = mx, pmy = my;
      for (let i = 0; i < 256; i++) {
        pmx = mx; pmy = my;
        if (sideX < sideY) { dist = sideX; sideX += ddx; mx += sx; side = 0; } else { dist = sideY; sideY += ddy; my += sy; side = 1; }
        if (mx < 0 || my < 0 || mx >= lw || my >= lh) { tex = level.defWall; break; }
        const idx = my * lw + mx;
        if (!level.solid[idx]) continue;
        const door = level.doorAt[idx];
        if (door) {
          const t = this.doorHit(door, px, py, rx, ry, mx, my);
          if (t < 0) continue;
          dist = t;
          const hit = door.orient === 'h' ? px + t * rx : py + t * ry;
          u = (hit - Math.floor(hit)) - door.open;
          side = door.orient === 'h' ? 1 : 0;
          tex = level.wallTex[idx];
          pmx = mx; pmy = my;
          break;
        }
        tex = level.wallTex[idx];
        const hit = side === 0 ? py + dist * ry : px + dist * rx;
        u = hit - Math.floor(hit);
        if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) u = 1 - u;
        break;
      }
      zbuf[x] = dist;
      const top = horizon - (WALL_H - eyeZ) * PROJ / dist;
      const bot = horizon + eyeZ * PROJ / dist;
      const y0 = top < 0 ? 0 : Math.ceil(top);
      const y1 = bot > VH ? VH : Math.ceil(bot);
      wtop[x] = y0; wbot[x] = y1;
      const tw = tex.w, th = tex.h, td = tex.data;
      let tu = Math.floor(u * tw);
      if (tu < 0) tu = 0; else if (tu >= tw) tu = tw - 1;
      let lc = 1, tr = 1, tg = 1, tb = 1;
      if (pmx >= 0 && pmy >= 0 && pmx < lw && pmy < lh) {
        const li = pmy * lw + pmx;
        lc = level.light[li]; tr = level.tintR[li]; tg = level.tintG[li]; tb = level.tintB[li];
      }
      const l = lc * this.distLight(dist) * (side ? 0.84 : 1) + flash;
      const vStep = th / (bot - top);
      let v = (y0 + 0.5 - top) * vStep;
      for (let y = y0; y < y1; y++, v += vStep) {
        let tv = v | 0;
        if (tv >= th) tv = th - 1;
        buf[y * VW + x] = shade(td[tv * tw + tu], l * tr, l * tg, l * tb);
      }
    }

    // ---------------- floor + ceiling ----------------
    const r0x = dirX - plX, r0y = dirY - plY;
    const r1x = dirX + plX, r1y = dirY + plY;
    // the horizon moves with pitch (looking up/down) and the eye height with
    // jumping/crouching, so floor and ceiling rows are cast separately
    for (let y = 0; y < VH; y++) {
      const floor = y + 0.5 > horizon;
      const p = floor ? y + 0.5 - horizon : horizon - (y + 0.5);
      if (p < 0.5) continue;
      const rowDist = (floor ? eyeZ : WALL_H - eyeZ) * PROJ / p;
      const stepX = rowDist * (r1x - r0x) / VW;
      const stepY = rowDist * (r1y - r0y) / VW;
      let fx = px + rowDist * r0x + stepX * 0.5;
      let fy = py + rowDist * r0y + stepY * 0.5;
      const dl = this.distLight(rowDist);
      const row = y * VW;
      for (let x = 0; x < VW; x++, fx += stepX, fy += stepY) {
        if (y >= wtop[x] && y < wbot[x]) continue;      // a wall is already drawn here
        const cx = Math.floor(fx), cy = Math.floor(fy);
        let ci = -1;
        if (cx >= 0 && cy >= 0 && cx < lw && cy < lh) ci = cy * lw + cx;
        const tu = ((fx - cx) * 64) & 63;
        const tv = ((fy - cy) * 64) & 63;
        let tex, l, tr, tg, tb;
        if (ci >= 0) {
          tex = floor ? level.floorTex[ci] : level.ceilTex[ci];
          l = level.light[ci] * dl + flash;
          tr = level.tintR[ci]; tg = level.tintG[ci]; tb = level.tintB[ci];
        } else {
          tex = floor ? level.defFloor : level.defCeil; l = dl * 0.5; tr = tg = tb = 1;
        }
        if (!floor) l = tex.bright ? (l < 0.9 ? 0.9 : l) : l * 0.85;
        buf[row + x] = shade(tex.data[tv * 64 + tu], l * tr, l * tg, l * tb);
      }
    }

    // ---------------- sprites ----------------
    const invDet = 1 / (plX * dirY - dirX * plY);
    const vis = [];
    for (const s of sprites) {
      const vx = s.x - px, vy = s.y - py;
      const ty = invDet * (-plY * vx + plX * vy);
      if (ty < 0.12) continue;
      const tx = invDet * (dirY * vx - dirX * vy);
      vis.push({ s, tx, ty });
    }
    vis.sort((a, b) => b.ty - a.ty);
    for (const { s, tx, ty } of vis) this.drawSprite(s, tx, ty, level, flash);
  },

  drawSprite(s, tx, ty, level, flash) {
    const tex = s.tex;
    const buf = this.buf, zbuf = this.zbuf;
    const scrX = (VW / 2) * (1 + tx / ty);
    const hpx = s.h * PROJ / ty;
    const wpx = hpx * tex.w / tex.h;
    const bottom = this.horizon + (this.eyeZ - (s.lift || 0)) * PROJ / ty;
    const top = bottom - hpx;
    const left = scrX - wpx / 2;
    const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(VW, Math.ceil(scrX + wpx / 2));
    if (x1 <= x0) return;
    const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH, Math.ceil(bottom));
    if (y1 <= y0) return;
    let l = 1, tr = 1, tg = 1, tb = 1;
    if (!s.bright) {
      const cx = Math.floor(s.x), cy = Math.floor(s.y);
      const li = (cx >= 0 && cy >= 0 && cx < level.w && cy < level.h) ? cy * level.w + cx : -1;
      l = (li >= 0 ? level.light[li] : 0.5) * this.distLight(ty) + flash;
      if (li >= 0) { tr = level.tintR[li]; tg = level.tintG[li]; tb = level.tintB[li]; }
    }
    const fr = l * tr * (s.tintR || 1), fg = l * tg * (s.tintG || 1), fb = l * tb * (s.tintB || 1);
    const tw = tex.w, th = tex.h, td = tex.data;
    const uStep = tw / wpx, vStep = th / hpx;
    const flip = s.flip;
    for (let x = x0; x < x1; x++) {
      if (ty >= zbuf[x]) continue;
      let tu = ((x + 0.5 - left) * uStep) | 0;
      if (tu >= tw) tu = tw - 1;
      if (flip) tu = tw - 1 - tu;
      let v = (y0 + 0.5 - top) * vStep;
      for (let y = y0; y < y1; y++, v += vStep) {
        let tv = v | 0;
        if (tv >= th) tv = th - 1;
        const c = td[tv * tw + tu];
        if ((c >>> 24) < 128) continue;
        buf[y * VW + x] = shade(c, fr, fg, fb);
      }
    }
  },

  // first-person weapon, bottom-centred, with light level l (1 = full)
  drawWeapon(tex, ox, oy, l) {
    const buf = this.buf;
    const x0 = Math.round(VW / 2 - tex.w / 2 + ox);
    const y0 = Math.round(VH - tex.h + oy);
    for (let y = 0; y < tex.h; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= VH) continue;
      for (let x = 0; x < tex.w; x++) {
        const sx = x0 + x;
        if (sx < 0 || sx >= VW) continue;
        const c = tex.data[y * tex.w + x];
        if ((c >>> 24) < 128) continue;
        buf[sy * VW + sx] = shade(c, l, l, l);
      }
    }
  },

  // full-screen colour wash (damage = red, pickup = gold)
  wash(r, g, b, a) {
    if (a <= 0) return;
    const buf = this.buf, ia = 1 - a;
    const ar = r * a, ag = g * a, ab = b * a;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      const cr = ((c & 255) * ia + ar) | 0;
      const cg = (((c >>> 8) & 255) * ia + ag) | 0;
      const cb = (((c >>> 16) & 255) * ia + ab) | 0;
      buf[i] = 0xff000000 | (cb << 16) | (cg << 8) | cr;
    }
  },

  present() {
    this.ctx.putImageData(this.image, 0, 0);
  },
};

function shade(c, fr, fg, fb) {
  let r = (c & 255) * fr, g = ((c >>> 8) & 255) * fg, b = ((c >>> 16) & 255) * fb;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;
  return 0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
}
