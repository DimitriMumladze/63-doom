// Level building: a grid of wall letters + lighting zones + placed things, flattened
// into the flat typed arrays the renderer and the gameplay code read.
//
// A level *spec* is plain data -- { name, rows, zones, things } -- and lives in
// game/js/maps/. buildLevel(spec) turns one into a runtime level. See maps/office.js
// for the letter legend; the tables below say what each letter and thing type means.
'use strict';

const WALL_KEYS = {
  K: 'concrete', P: 'plaster', R: 'radiator', W: 'window', C: 'cabinet', S: 'server',
  T: 'tiles', B: 'whiteboard', p: 'plaster_hell', k: 'concrete_hell', s: 'server_hell',
  t: 'tiles_hell', D: 'door', L: 'door',
  G: 'plaster_grey', H: 'plaster_grey_panel', V: 'glass_wall', E: 'door_entry',
  X: 'facade_pillar', Y: 'facade_glass', J: 'facade_slats', F: 'door_front', Z: 'fence_metal', O: 'wall_concrete_low',
  r: 'soviet_wall', U: 'door_soviet',
  y: 'kremlin_wall', f: 'flag_ru_wall', u: 'door_kremlin',
};

// walls that pick one of several textures by position
const WALL_VARIANTS = { v: ['poster_0', 'poster_1', 'poster_2'] };

// facade cells: this tall (in units) when seen from the street, plain grey from inside
const FACADE_H = { X: 6, Y: 6, J: 6 };

// pictures spanning several cells: cell n of a run of the same letter (along the
// row, or down the column for a vertical run) shows '<name>_n'
const WALL_STRIPS = { N: 'dino', A: 'stairs', Q: 'sign63', I: 'portrait' };
// strips on a south wall are seen looking south, where east is on the left, so they count from the east
const STRIPS_FROM_EAST = { I: true };

const DOOR_KEYS = 'DEFLUu';

function stripIndex(rows, x, y, ch) {
  let n = 0;
  const horiz = rows[y][x - 1] === ch || rows[y][x + 1] === ch;
  const dx = STRIPS_FROM_EAST[ch] ? 1 : -1;
  if (horiz) while (rows[y][x + dx * (1 + n)] === ch) n++;
  else while (y - 1 - n >= 0 && rows[y - 1 - n][x] === ch) n++;
  return n;
}

const DECOR = {
  desk: { h: 0.62, solid: 'cell' }, desk_lego: { h: 0.62, solid: 'cell' }, desk_broken: { h: 0.62, solid: 'cell' },
  chair_black: { h: 0.6, r: 0.22 }, chair_grey: { h: 0.6, r: 0.22 },
  bin: { h: 0.36, r: 0.16 }, plant: { h: 0.62, r: 0.2 },
  lamp: { h: 0.3, lift: WALL_H - 0.5 },
  blood_pool: { h: 0.12 },
  spark: { h: 0.32, lift: 0.5, anim: ['spark_0', 'spark_1'], bright: true },
  sofa: { h: 0.5, solid: 'cell' }, coffee_table: { h: 0.3, r: 0.3 },
  scooter: { h: 0.75, r: 0.15 }, hanging_chair: { h: 0.95, r: 0.3 },
  pendant: { h: 0.4, lift: WALL_H - 0.4, bright: true },
  doormat: { h: 0.04 },
  // cars show front / side / rear depending on where you look from and block `cells` cells
  lexus: { h: 1.06, dirs: ['car_lexus_front', 'car_lexus_side', 'car_lexus_rear'], cells: 3 },
  // the BMW sprites have 20 px more on top for the raised bonnet
  bmw: { h: 1.2, dirs: ['car_bmw_front', 'car_bmw_side', 'car_bmw_rear'], cells: 3 },
  streetlamp: { h: 3.2, r: 0.1 }, lamp_glow: { h: 0.35, lift: 2.88, bright: true },
  shrub: { h: 0.55, r: 0.25 }, ac_unit: { h: 0.6, r: 0.3 }, plate65: { h: 0.14, lift: 1.3 },
  soviet_flag: { h: 1.8, r: 0.12 }, bust: { h: 1.1, r: 0.25 }, samovar: { h: 0.95, r: 0.25 },
  tv_rubin: { h: 0.85, r: 0.3 }, desk_soviet: { h: 0.62, solid: 'cell' }, matryoshka: { h: 0.4, r: 0.12 },
  coat_stand: { h: 1.6, r: 0.15 }, star_lamp: { h: 0.22, lift: 1.4, bright: true },
  russian_flag: { h: 1.8, r: 0.12 }, throne: { h: 1.3, r: 0.35 },
};

// friendly people: not enemies, can't be shot, the player bumps into them.
// frames cycle on `beats` (seconds per frame); `line` shows in a speech box when you come within talkR;
// `dirs` + `path` = rides back and forth along x between path[0] and path[1]
const NPCS = {
  npc_bmw: { h: 1.25, r: 0.25, frames: ['bmw_0', 'bmw_1'], beats: [2.6, 1.4], talkR: 2.6,
    line: 'კიდე გაფუჭდა ამის დედას შევეცი' },
  npc_lexus: { h: 1.25, r: 0.25, frames: ['lexus_0', 'lexus_1'], beats: [3.0, 1.2], talkR: 2.6, smoke: true,
    line: 'ზაჰესში მოდიხარ ძმა?' },
  npc_rider: { h: 1.45, r: 0.3, dirs: ['rider_front', 'rider_side', 'rider_rear'], path: [2.0, 27.0], speed: 2.2 },
};

const PICKUPS = {
  medkit: { h: 0.24 }, coffee: { h: 0.22 }, clip: { h: 0.15 }, shells: { h: 0.16 },
  armor: { h: 0.3 }, shotgun: { h: 0.18 }, chaingun: { h: 0.22 },
  rifle: { h: 0.2 }, dbshotgun: { h: 0.2 }, rocketl: { h: 0.22 }, plasmagun: { h: 0.22 },
  rockets: { h: 0.2 }, cells: { h: 0.2 },
};

const DEFAULTS = { wall: 'concrete', floor: 'floor_oak', ceil: 'ceil_concrete', sky: 'sky_dusk' };

function buildLevel(spec) {
  const rows = spec.rows, h = rows.length, w = rows[0].length;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) console.error('map row', y, 'has length', rows[y].length);
  }
  const def = Object.assign({}, DEFAULTS, spec.defaults);
  const N = w * h;
  const L = {
    name: spec.name || '', w, h,
    solid: new Uint8Array(N), block: new Uint8Array(N),
    wallTex: new Array(N).fill(null), doorAt: new Array(N).fill(null), doors: [],
    wallTexIn: new Array(N).fill(null), wallH: new Float32Array(N).fill(WALL_H), lintel: new Array(N).fill(null),
    sky: new Uint8Array(N), skyTex: Assets.get('tex/' + def.sky),
    floorTex: new Array(N), ceilTex: new Array(N),
    light: new Float32Array(N), baseLight: new Float32Array(N), flicker: new Float32Array(N),
    tintR: new Float32Array(N).fill(1), tintG: new Float32Array(N).fill(1), tintB: new Float32Array(N).fill(1),
    zone: new Array(N).fill(''),
    defWall: Assets.get('tex/' + def.wall), defFloor: Assets.get('tex/' + def.floor),
    defCeil: Assets.get('tex/' + def.ceil),
    decor: [], decorAt: new Array(N).fill(null), pickups: [], spawns: [], npcs: [],
    start: { x: 2, y: 7, a: 0 }, starts: [],
    // how far props stay in the sprite list; unset means "no limit" (small maps)
    cull: spec.cull || 0,
  };
  Assets.get('tex/ceil_light').bright = true;
  Assets.get('tex/ceil_linear').bright = true;
  Assets.get('tex/ceil_chandelier').bright = true;
  // floor casting samples cells behind walls too, so every cell needs flats
  L.floorTex.fill(L.defFloor);
  L.ceilTex.fill(L.defCeil);
  L.baseLight.fill(0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], i = y * w + x;
      if (ch === '.') continue;
      L.solid[i] = 1;
      if (ch === 'M') {
        L.wallTex[i] = Assets.get('tex/mural_' + String((x - 1) % 12).padStart(2, '0'));
      } else if (WALL_STRIPS[ch]) {
        L.wallTex[i] = Assets.get('tex/' + WALL_STRIPS[ch] + '_' + stripIndex(rows, x, y, ch));
      } else if (WALL_VARIANTS[ch]) {
        const vs = WALL_VARIANTS[ch];
        L.wallTex[i] = Assets.get('tex/' + vs[(x + Math.floor(y / 3)) % vs.length]);
      } else {
        L.wallTex[i] = Assets.get('tex/' + WALL_KEYS[ch]);
      }
      if (FACADE_H[ch]) {
        L.wallH[i] = FACADE_H[ch];
        L.wallTexIn[i] = Assets.get('tex/plaster_grey');
      }
      if (ch === 'F') L.lintel[i] = { tex: Assets.get('tex/facade_glass'), h: FACADE_H.Y };
      if (DOOR_KEYS.includes(ch)) {
        const horiz = x > 0 && x < w - 1 && rows[y][x - 1] !== '.' && rows[y][x + 1] !== '.';
        const door = { x, y, i, key: ch, orient: horiz ? 'h' : 'v', open: 0, state: 'closed', timer: 0,
          locked: ch === 'L' || ch === 'U' || ch === 'u' };
        L.doorAt[i] = door;
        L.doors.push(door);
      }
    }
  }

  // zones -> floor/ceiling/light per cell
  for (const z of spec.zones) {
    for (let y = z.y0; y <= z.y1; y++) {
      for (let x = z.x0; x <= z.x1; x++) {
        const i = y * w + x;
        L.zone[i] = z.name;
        let f = z.floor;
        // a street is sidewalk at the building end, then the curb, then road
        if (f === 'street') f = y <= z.y0 + 1 ? 'sidewalk' : (y === z.y0 + 2 ? 'curb' : 'asphalt');
        L.floorTex[i] = Assets.get('tex/' + f);
        L.sky[i] = z.sky ? 1 : 0;
        let c = z.ceil;
        if (c === 'hall') c = ['ceil_concrete', 'ceil_light', 'ceil_tray'][y % 3];
        else if (c === 'corridor') c = x % 4 === 1 ? 'ceil_light' : (y === z.y0 ? 'ceil_tray' : 'ceil_concrete');
        else if (c === 'lounge') c = y % 2 === 0 ? 'ceil_linear' : 'ceil_dark';
        else if (c === 'redcorner') c = x === 24 && (y === 27 || y === 31) ? 'ceil_chandelier' : 'ceil_ornate';
        else if (c === 'hall_ru') c = (x === 33 || x === 38) && y === 28 ? 'ceil_chandelier' : 'ceil_ornate';
        L.ceilTex[i] = Assets.get('tex/' + c);
        L.baseLight[i] = z.light;
        L.flicker[i] = z.flicker || 0;
        const t = z.tint || [1, 1, 1];
        L.tintR[i] = t[0]; L.tintG[i] = t[1]; L.tintB[i] = t[2];
      }
    }
  }
  L.light.set(L.baseLight);

  for (const [type, x, y, a] of spec.things) {
    if (type === 'start') { L.start = { x, y, a }; L.starts.push({ x, y, a }); continue; }
    if (DECOR[type]) {
      const d = DECOR[type];
      let px = x, py = y;
      if (d.solid === 'cell') { px = x + 0.5; py = y + 0.5; L.block[y * w + x] = 1; }
      if (d.cells) {
        const ox = Math.round(Math.cos(a)), oy = Math.round(Math.sin(a)), k0 = (d.cells - 1) / 2;
        for (let k = -k0; k <= k0; k++) L.block[(Math.floor(y) + k * oy) * w + Math.floor(x) + k * ox] = 1;
      }
      L.decor.push({ type, x: px, y: py, h: d.h, lift: d.lift || 0, r: d.r || 0, anim: d.anim,
        dirs: d.dirs, facing: a || 0,
        bright: d.bright, tex: Assets.get('prop/' + (d.dirs ? d.dirs[0] : (d.anim ? d.anim[0] : type))) });
      continue;
    }
    if (NPCS[type]) {
      const n = NPCS[type];
      L.npcs.push({ type, n, x, y, h: n.h, r: n.r, facing: a || 0, frame: 0, beatT: n.beats ? n.beats[0] : 0,
        talk: 0, puffT: 0, tex: Assets.get('npc/' + (n.dirs ? n.dirs[0] : n.frames[0])) });
      continue;
    }
    if (PICKUPS[type]) {
      L.pickups.push({ type, x, y, h: PICKUPS[type].h, tex: Assets.get('item/' + type), taken: false });
      continue;
    }
    if (ENEMY_TYPES[type]) { L.spawns.push({ type, x, y }); continue; }
    console.warn('unknown thing', type);
  }
  indexDecor(L);
  return L;
}

// Props you bump into, bucketed by cell. Game.free() runs several times per entity per
// frame, so it must not walk the whole prop list -- on a big map that is thousands of
// checks a frame. A prop goes in every cell its circle touches, and free() looks in
// every cell the tested circle touches: two overlapping circles always share a cell.
function indexDecor(L) {
  L.decorAt.fill(null);
  for (const d of L.decor) {
    if (!d.r) continue;
    const x0 = Math.max(0, Math.floor(d.x - d.r)), x1 = Math.min(L.w - 1, Math.floor(d.x + d.r));
    const y0 = Math.max(0, Math.floor(d.y - d.r)), y1 = Math.min(L.h - 1, Math.floor(d.y + d.r));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * L.w + cx;
        (L.decorAt[i] || (L.decorAt[i] = [])).push(d);
      }
    }
  }
}

function zoneAt(L, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return '';
  return L.zone[cy * L.w + cx];
}

// ----------------------------------------------------------------------
// Composing a big map out of blocks (see maps/block.js). A grid is an array of
// char arrays; gridRows() turns it back into the strings buildLevel() wants.
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
