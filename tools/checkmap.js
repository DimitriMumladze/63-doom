// Check a map spec before anyone plays it.  node tools/checkmap.js [name] [--ascii]
//
// A map is hand-authored data, and the mistakes it invites are all the same ones:
// a row a character short, a spawn point inside a wall, a shed with no doorway, a
// loot pile nobody can reach. This catches those without starting the game.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');

const MAPS = {
  yard: { file: 'maps/yard.js', spec: 'YARD_MAP_SPEC' },
  office: { file: 'maps/office.js', spec: 'OFFICE_MAP' },
  block: { file: 'maps/block.js', spec: 'BLOCK_MAP_SPEC' },
};

const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'yard';
const ascii = process.argv.includes('--ascii');
const m = MAPS[which];
if (!m) { console.error(`unknown map "${which}" -- try: ${Object.keys(MAPS).join(', ')}`); process.exit(2); }
if (!fs.existsSync(path.join(JS, m.file))) { console.error(`${m.file} does not exist yet`); process.exit(2); }

// A map file is data; it needs collide.js for the grid helpers and nothing else.
const ctx = vm.createContext({ console, Math, Object, Array, String, Number, JSON,
  Uint8Array, Int16Array, Float32Array, module: undefined });
for (const f of ['collide.js', m.file]) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
}
const spec = vm.runInContext(m.spec, ctx);
const { buildCollision, blockedAt, freeCircle } = vm.runInContext(
  '({ buildCollision, blockedAt, freeCircle })', ctx);

const PLAYER_R = 0.24;
let problems = 0;
const bad = s => { console.log('  PROBLEM  ' + s); problems++; };

// ---- shape ----
const rows = spec.rows, h = rows.length, w = rows[0].length;
console.log(`${m.spec}  "${spec.name}"  ${w} x ${h} = ${w * h} cells`);
for (let y = 0; y < h; y++) {
  if (rows[y].length !== w) bad(`row ${y} is ${rows[y].length} characters, not ${w}`);
}

const C = buildCollision(spec);
let open = 0;
for (let i = 0; i < C.solid.length; i++) if (!C.solid[i] && !C.block[i]) open++;
console.log(`  ${open} cells you can stand in (${(100 * open / (w * h)).toFixed(0)}%), ` +
  `${C.spawns.length} spawns, ${C.loot.length} loot spots`);

// ---- zones cover the map and stay inside it ----
const covered = new Uint8Array(w * h);
for (const z of spec.zones) {
  if (z.x0 < 0 || z.y0 < 0 || z.x1 >= w || z.y1 >= h) bad(`zone "${z.name}" runs off the map`);
  if (z.x1 < z.x0 || z.y1 < z.y0) bad(`zone "${z.name}" has its corners backwards`);
  for (let y = Math.max(0, z.y0); y <= Math.min(h - 1, z.y1); y++) {
    for (let x = Math.max(0, z.x0); x <= Math.min(w - 1, z.x1); x++) covered[y * w + x] = 1;
  }
}
let bare = 0;
for (let i = 0; i < covered.length; i++) if (!covered[i] && !C.solid[i]) bare++;
if (bare) bad(`${bare} standable cells are in no zone (they get default flats and light 0.5)`);

// ---- every spawn and every loot spot has to be somewhere you can be ----
for (const [label, list, r] of [['spawn', C.spawns, PLAYER_R], ['loot', C.loot, 0]]) {
  for (const p of list) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (blockedAt(C, cx, cy)) bad(`${label} at (${p.x}, ${p.y}) is inside a wall or a prop`);
    else if (r && !freeCircle(C, p.x, p.y, r)) {
      bad(`${label} at (${p.x}, ${p.y}) is in a gap too tight to stand in`);
    }
  }
}

// ---- can you walk from any spawn to all the others, and to every loot pile? ----
// blockedAt() calls a door solid, because the server never knows how far one has
// slid. Walking, you can open it, so the flood fill goes through doors.
const walkable = (x, y) => !blockedAt(C, x, y) || !!C.door[y * w + x];
const seen = new Uint8Array(w * h);
const q = [];
if (C.spawns.length) {
  const s0 = C.spawns[0];
  const i0 = Math.floor(s0.y) * w + Math.floor(s0.x);
  seen[i0] = 1; q.push(i0);
}
for (let qi = 0; qi < q.length; qi++) {
  const i = q[qi], x = i % w, y = (i / w) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const ni = ny * w + nx;
    if (seen[ni] || !walkable(nx, ny)) continue;
    seen[ni] = 1; q.push(ni);
  }
}
const doorCells = C.door.reduce((n, v) => n + v, 0);
// q includes the door cells it walked through, which `open` does not count
const reached = q.filter(i => !C.door[i]).length;
console.log(`  ${reached} of those ${open} reachable from the first spawn` +
  (doorCells ? ` (through ${doorCells} door cells)` : ''));
if (reached < open) {
  bad(`${open - reached} standable cells are walled off from the rest of the map`);
}
for (const [label, list] of [['spawn', C.spawns], ['loot', C.loot]]) {
  for (const p of list) {
    const i = Math.floor(p.y) * w + Math.floor(p.x);
    if (!blockedAt(C, Math.floor(p.x), Math.floor(p.y)) && !seen[i]) {
      bad(`${label} at (${p.x}, ${p.y}) is cut off from the first spawn`);
    }
  }
}

// ---- are the spawns far enough apart to drop fifteen people? ----
// Only a battle royale map needs that, and a battle royale map is one with loot in it.
const isBR = C.loot.length > 0;
if (isBR && C.spawns.length) {
  if (C.spawns.length < 15) bad(`only ${C.spawns.length} spawns for up to 15 players`);
  let worst = Infinity, pair = [0, 0];
  for (let i = 0; i < C.spawns.length; i++) {
    for (let j = i + 1; j < C.spawns.length; j++) {
      const d = Math.hypot(C.spawns[i].x - C.spawns[j].x, C.spawns[i].y - C.spawns[j].y);
      if (d < worst) { worst = d; pair = [i, j]; }
    }
  }
  if (C.spawns.length > 1) {
    console.log(`  closest two spawns are ${worst.toFixed(1)} cells apart (#${pair[0]} and #${pair[1]})`);
    if (worst < 8) bad('two spawns are within 8 cells: people will land on top of each other');
  }
} else if (!isBR) {
  console.log(`  campaign map: ${C.spawns.length} start point, no loot spots`);
}

// ---- loot spread ----
if (C.loot.length) {
  const tiers = {};
  for (const l of C.loot) tiers[l.tier] = (tiers[l.tier] || 0) + 1;
  console.log('  loot by tier: ' + Object.entries(tiers).map(([t, n]) => `${t}:${n}`).join('  '));
}

// ---- unknown wall letters would throw at Assets.get() in the browser ----
const KNOWN = new Set('.KPRWCSTBpkstGHVEXYJFZOrUyfuDLNAQIvM'.split(''));
const unknown = new Map();
for (let y = 0; y < h; y++) {
  for (const ch of rows[y]) if (!KNOWN.has(ch)) unknown.set(ch, (unknown.get(ch) || 0) + 1);
}
for (const [ch, n] of unknown) bad(`${n} cells use "${ch}", which no wall table knows`);

if (ascii) {
  console.log('');
  const mark = new Map();
  for (const s of C.spawns) mark.set(Math.floor(s.y) * w + Math.floor(s.x), '@');
  for (const l of C.loot) {
    const i = Math.floor(l.y) * w + Math.floor(l.x);
    if (!mark.has(i)) mark.set(i, String(l.tier));
  }
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      line += mark.get(i) || (C.block[i] ? '+' : (C.solid[i] ? rows[y][x] : ' '));
    }
    console.log('  ' + line);
  }
  console.log('\n  @ spawn   0/1/2 loot by tier   + prop   space walkable');
}

console.log(problems ? `\n${problems} problem(s)` : '\nmap is sound');
process.exit(problems ? 1 : 0);
