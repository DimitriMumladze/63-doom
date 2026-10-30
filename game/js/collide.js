// The geometry of a level, with nothing in it that needs a browser.
//
// This is the half of level building that server.js also needs: which cells you
// cannot walk into, and how far a shot travels before it hits a wall. buildLevel()
// in level.js calls buildCollision() for exactly these arrays and then decorates
// them with textures and lighting, so there is one implementation of "is that
// solid" and the server and the players can never disagree about it.
//
// Loaded before engine.js in the browser; required by server.js in Node.
'use strict';

const WALL_H = 2.0;        // walls are this tall; the eye sits at half of it

// Props that take up a whole cell rather than being a circle you walk around.
// The value is how many cells, along the thing's facing (cars are three long).
// level.js checks this against DECOR at build time so the two cannot drift.
const BLOCKING = {
  desk: 1, desk_lego: 1, desk_broken: 1, desk_soviet: 1, sofa: 1,
  lexus: 3, bmw: 3,
};

// Walls you can shoot and walk through once open. A battle royale map has none --
// sliding doors are the one piece of state the server would have to arbitrate
// per frame, and they buy nothing in a last-one-standing match.
const DOOR_CHARS = 'DEFLUu';

function buildCollision(spec) {
  const rows = spec.rows, h = rows.length, w = rows[0].length, N = w * h;
  const C = {
    w, h, rows,
    solid: new Uint8Array(N),
    block: new Uint8Array(N),
    door: new Uint8Array(N),
    spawns: [], loot: [],
  };
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const i = y * w + x;
      C.solid[i] = 1;
      if (DOOR_CHARS.includes(ch)) C.door[i] = 1;
    }
  }
  for (const t of spec.things) {
    const [type, x, y, a] = t;
    if (type === 'start' || type === 'brspawn') { C.spawns.push({ x, y, a: a || 0 }); continue; }
    if (type === 'loot') { C.loot.push({ x, y, tier: a || 0 }); continue; }
    const cells = BLOCKING[type];
    if (!cells) continue;
    if (cells === 1) { C.block[Math.floor(y) * w + Math.floor(x)] = 1; continue; }
    // a run of cells centred on (x, y), laid out along the facing
    const ox = Math.round(Math.cos(a || 0)), oy = Math.round(Math.sin(a || 0)), k0 = (cells - 1) / 2;
    for (let k = -k0; k <= k0; k++) {
      const cx = Math.floor(x) + k * ox, cy = Math.floor(y) + k * oy;
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) C.block[cy * w + cx] = 1;
    }
  }
  return C;
}

// Off the map, a wall, or a prop's cell. Doors count as closed: only the browser
// knows how far one has slid, and battle royale maps have none.
function blockedAt(C, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= C.w || cy >= C.h) return true;
  const i = cy * C.w + cx;
  return !!(C.solid[i] || C.block[i]);
}

// A circle of radius r at (x, y) with nothing in it. Same test as Game.free(),
// minus the props you walk around and the people -- the server uses it to tell
// whether a position a player claims is somewhere they could actually stand.
function freeCircle(C, x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!blockedAt(C, cx, cy)) continue;
      const nx = Math.max(cx, Math.min(x, cx + 1)), ny = Math.max(cy, Math.min(y, cy + 1));
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return false;
    }
  }
  return true;
}

// Distance to the first wall along (dx, dy) from (px, py). The same DDA as
// Engine.castDist, so a shot the shooter's browser thought was clear reads as
// clear on the server too. (dx, dy) need not be normalised: the answer comes back
// in multiples of its length, exactly as the renderer's does.
function castSolid(C, px, py, dx, dy, maxD = 64) {
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
  const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let sideX = (dx < 0 ? px - mx : mx + 1 - px) * ddx;
  let sideY = (dy < 0 ? py - my : my + 1 - py) * ddy;
  // a 96-cell map is ~190 steps across the diagonal, so this cap is not reachable
  for (let i = 0; i < 512; i++) {
    let d;
    if (sideX < sideY) { d = sideX; sideX += ddx; mx += sx; } else { d = sideY; sideY += ddy; my += sy; }
    if (d > maxD) return maxD;
    if (mx < 0 || my < 0 || mx >= C.w || my >= C.h) return d;
    if (C.solid[my * C.w + mx]) return d;
  }
  return maxD;
}

// Is b in sight of a? Mirrors Game.sees().
function canSee(C, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 0.01) return true;
  return castSolid(C, ax, ay, dx / d, dy / d, d + 1) >= d - 0.05;
}

// ----------------------------------------------------------------------
// Composing a big map out of blocks (see maps/). A grid is an array of char
// arrays; gridRows() turns it back into the strings a spec wants.
// ----------------------------------------------------------------------
function mapGrid(w, h, ch = '.') {
  return Array.from({ length: h }, () => new Array(w).fill(ch));
}

// Draw `rows` into G with its top-left at (x0, y0). A space in `rows` means
// "leave what is already there", so blocks can be any shape.
function stamp(G, x0, y0, rows) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y], gy = y0 + y;
    if (gy < 0 || gy >= G.length) continue;
    for (let x = 0; x < row.length; x++) {
      const gx = x0 + x;
      if (gx < 0 || gx >= G[gy].length || row[x] === ' ') continue;
      G[gy][gx] = row[x];
    }
  }
}

function rect(G, x0, y0, x1, y1, ch) {
  for (let x = x0; x <= x1; x++) { G[y0][x] = ch; G[y1][x] = ch; }
  for (let y = y0; y <= y1; y++) { G[y][x0] = ch; G[y][x1] = ch; }
}

function fillRect(G, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) G[y][x] = ch;
}

function border(G, ch) { rect(G, 0, 0, G[0].length - 1, G.length - 1, ch); }

function gridRows(G) { return G.map(r => r.join('')); }

// Shift every [type, x, y, a] of a block's things by (dx, dy), for stamping a
// place's contents alongside its walls.
function offsetThings(things, dx, dy) {
  return things.map(t => [t[0], t[1] + dx, t[2] + dy, ...t.slice(3)]);
}

// Node (server.js) requires this; in the browser it is just a script and the
// names above are globals, so this line does nothing.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WALL_H, BLOCKING, DOOR_CHARS, buildCollision, blockedAt, freeCircle,
    castSolid, canSee, mapGrid, stamp, rect, fillRect, border, gridRows, offsetThings };
}
