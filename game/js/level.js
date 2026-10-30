// The 63 office, gone wrong. Grid map + lighting zones + placed things.
'use strict';

// Walls: K concrete, P plaster, R radiator, W window, C cabinet, M mural,
// S server rack, T tiles, B whiteboard, lower-case = blood-stained variant,
// D door, L locked door (boss room). '.' = open floor.
const MAP = [
  'KMMMMMMMMMMMMKSSSSSSSSSSSSSSSK', // 0
  'W............K...............S', // 1
  'W............K...............S', // 2
  'W............K..SSSS...SSSS..S', // 3
  'W............K...............S', // 4
  'W............K..ssss...SSSS..S', // 5
  'W............K...............S', // 6
  'W............K...............S', // 7
  'KCCCCCDCCCCCCKPPPPPPPDPPPPPPPK', // 8
  'P............................P', // 9
  'R............................R', // 10
  'KTTTDTTTTKPPPDPPPPKpppppLppppK', // 11
  'T........KB.......Kp.........p', // 12  (x19 is wall-coloured below; see fix)
  'T........K........K..........p', // 13
  'T........K........K..........p', // 14
  'T........K........K...k..k...p', // 15
  'T........K........K..........p', // 16
  't........K........K..........p', // 17
  'KTTTTTTTTKBBBBBBBBK..........p', // 18
  'KKKKKKKKKKKKKKKKKKK...k..k...p', // 19
  'KKKKKKKKKKKKKKKKKKK..........p', // 20
  'KKKKKKKKKKKKKKKKKKK..........p', // 21
  'KKKKKKKKKKKKKKKKKKKppppppppppK', // 22
];
// row 12 has two decorative stains on the meeting/boss walls; the cells right
// behind the boss door must stay open, so patch them here.
MAP[12] = 'T........KB.......K..........p';

const WALL_KEYS = {
  K: 'concrete', P: 'plaster', R: 'radiator', W: 'window', C: 'cabinet', S: 'server',
  T: 'tiles', B: 'whiteboard', p: 'plaster_hell', k: 'concrete_hell', s: 'server_hell',
  t: 'tiles_hell', D: 'door', L: 'door',
};

// later zones override earlier ones
const ZONES = [
  { name: 'Open space', x0: 0, y0: 0, x1: 13, y1: 8, floor: 'floor_oak', ceil: 'hall', light: 1.0 },
  { name: 'Server room', x0: 14, y0: 0, x1: 29, y1: 8, floor: 'floor_server', ceil: 'ceil_concrete', light: 0.62,
    tint: [0.8, 0.95, 1.2], flicker: 0.15 },
  { name: 'Corridor', x0: 0, y0: 9, x1: 29, y1: 10, floor: 'floor_oak', ceil: 'corridor', light: 0.85 },
  { name: 'Kitchen', x0: 0, y0: 11, x1: 9, y1: 18, floor: 'floor_server', ceil: 'hall', light: 0.95 },
  { name: 'Meeting room', x0: 9, y0: 11, x1: 18, y1: 18, floor: 'floor_oak', ceil: 'hall', light: 0.85,
    tint: [1.05, 1.0, 0.95] },
  { name: 'Boss office', x0: 18, y0: 11, x1: 29, y1: 22, floor: 'floor_oak_hell', ceil: 'ceil_concrete', light: 0.6,
    tint: [1.3, 0.72, 0.66], flicker: 0.3 },
];

// [type, x, y]  (cell coords; desks snap to cell centres and block the cell)
const THINGS = [
  ['start', 1.7, 6.6, -0.45],
  // --- open space: two rows of desk pairs, like the real office ---
  ...[2, 3, 4, 5, 7, 8, 9, 10].flatMap(x => [['desk', x, 3], [x === 9 ? 'desk_lego' : 'desk', x, 5]]),
  ...[2, 4, 7, 9].flatMap(x => [['chair_black', x + 0.5, 4.2], ['chair_black', x + 0.6, 6.2]]),
  ['chair_grey', 5.5, 4.2],
  ...[3.5, 8.5].flatMap(x => [['lamp', x, 3.5], ['lamp', x, 5.5], ['lamp', x, 1.6]]),
  ['plant', 1.4, 1.4], ['plant', 12.6, 1.4], ['bin', 12.6, 7.4], ['bin', 6.5, 2.4],
  ['blood_pool', 6.5, 6.6],
  ['clip', 11.5, 6.5], ['coffee', 1.5, 4.5], ['clip', 6.5, 1.5], ['rifle', 12.3, 3.6],
  ['irakli', 4.5, 1.6], ['brute', 10.5, 2.0], ['irakli', 11.6, 4.5], ['brute', 8.5, 7.0],

  // --- corridor ---
  ['plant', 0.6, 9.5], ['bin', 28.4, 10.4], ['lamp', 6.5, 9.5], ['lamp', 15.5, 9.5], ['lamp', 24.5, 9.5],
  ['medkit', 12.5, 9.5], ['shells', 3.5, 10.5], ['plasmagun', 27.8, 9.4], ['cells', 20.5, 10.5],
  ['rockets', 22.5, 10.5],
  ['rider', 17.5, 9.6], ['irakli', 26.5, 10.2],

  // --- kitchen ---
  ['desk_lego', 4, 14], ['desk', 5, 14], ['chair_grey', 4.5, 15.2], ['chair_grey', 5.6, 15.2],
  ['plant', 1.4, 17.4], ['bin', 8.4, 12.5], ['blood_pool', 3.0, 16.4],
  ['coffee', 1.5, 12.5], ['coffee', 2.5, 12.5], ['shotgun', 7.4, 16.8], ['shells', 7.4, 13],
  ['tank', 5.5, 16.8], ['brute', 2.5, 13.5],

  // --- meeting room: one long table ---
  ['desk_broken', 12, 14], ['desk', 13, 14], ['desk', 14, 14], ['desk_broken', 15, 14],
  ...[12, 14].flatMap(x => [['chair_grey', x + 0.5, 13.2], ['chair_black', x + 0.5, 15.2]]),
  ['spark', 12.5, 14.5], ['spark', 15.5, 14.5], ['lamp', 13.5, 14.5],
  ['shells', 10.6, 12.6], ['medkit', 17.4, 17.4], ['clip', 10.6, 17.4], ['dbshotgun', 17.3, 15.2],
  ['shells', 16.4, 17.4],
  ['irakli', 16.6, 12.8], ['irakli', 10.8, 16.6], ['brute', 13.5, 16.8],

  // --- server room ---
  ['spark', 18.0, 4.5], ['blood_pool', 20.5, 6.5], ['blood_pool', 15.5, 2.0],
  ['armor', 14.6, 1.5], ['clip', 27.5, 4.5], ['clip', 21.5, 1.5], ['chaingun', 27.6, 7.2], ['medkit', 21.5, 7.4],
  ['rocketl', 24.5, 1.5], ['rockets', 14.6, 4.4], ['cells', 28.4, 2.5],
  ['rider', 15.5, 6.6], ['rider', 27.5, 1.6], ['tank', 21.5, 4.5], ['brute', 26.0, 6.4],

  // --- boss office ---
  ['desk_broken', 21, 13], ['desk_broken', 26, 13], ['spark', 21.5, 13.5], ['spark', 26.5, 13.5],
  ['blood_pool', 23.5, 16.5], ['blood_pool', 20.5, 20.5], ['blood_pool', 27.5, 18.5],
  ['lamp', 23.5, 14.5], ['lamp', 23.5, 18.5],
  ['medkit', 19.6, 21.4], ['medkit', 28.4, 21.4], ['shells', 19.6, 12.4], ['clip', 28.4, 12.4],
  ['rockets', 19.6, 15.5], ['cells', 28.4, 15.5],
  ['beard', 24.0, 20.0], ['tank', 20.5, 17.0], ['brute', 27.5, 16.0],
];

const DECOR = {
  desk: { h: 0.62, solid: 'cell' }, desk_lego: { h: 0.62, solid: 'cell' }, desk_broken: { h: 0.62, solid: 'cell' },
  chair_black: { h: 0.6, r: 0.22 }, chair_grey: { h: 0.6, r: 0.22 },
  bin: { h: 0.36, r: 0.16 }, plant: { h: 0.62, r: 0.2 },
  lamp: { h: 0.3, lift: WALL_H - 0.5 },
  blood_pool: { h: 0.12 },
  spark: { h: 0.32, lift: 0.5, anim: ['spark_0', 'spark_1'], bright: true },
};

const PICKUPS = {
  medkit: { h: 0.24 }, coffee: { h: 0.22 }, clip: { h: 0.15 }, shells: { h: 0.16 },
  armor: { h: 0.3 }, shotgun: { h: 0.18 }, chaingun: { h: 0.22 },
  rifle: { h: 0.2 }, dbshotgun: { h: 0.2 }, rocketl: { h: 0.22 }, plasmagun: { h: 0.22 },
  rockets: { h: 0.2 }, cells: { h: 0.2 },
};

function buildLevel() {
  const h = MAP.length, w = MAP[0].length;
  for (let y = 0; y < h; y++) {
    if (MAP[y].length !== w) console.error('map row', y, 'has length', MAP[y].length);
  }
  const N = w * h;
  const L = {
    w, h,
    solid: new Uint8Array(N), block: new Uint8Array(N),
    wallTex: new Array(N).fill(null), doorAt: new Array(N).fill(null), doors: [],
    floorTex: new Array(N), ceilTex: new Array(N),
    light: new Float32Array(N), baseLight: new Float32Array(N), flicker: new Float32Array(N),
    tintR: new Float32Array(N).fill(1), tintG: new Float32Array(N).fill(1), tintB: new Float32Array(N).fill(1),
    zone: new Array(N).fill(''),
    defWall: Assets.get('tex/concrete'), defFloor: Assets.get('tex/floor_oak'), defCeil: Assets.get('tex/ceil_concrete'),
    decor: [], pickups: [], spawns: [], start: { x: 2, y: 7, a: 0 },
  };
  Assets.get('tex/ceil_light').bright = true;
  // floor casting samples cells behind walls too, so every cell needs flats
  L.floorTex.fill(L.defFloor);
  L.ceilTex.fill(L.defCeil);
  L.baseLight.fill(0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = MAP[y][x], i = y * w + x;
      if (ch === '.') continue;
      L.solid[i] = 1;
      if (ch === 'M') {
        L.wallTex[i] = Assets.get('tex/mural_' + String((x - 1) % 12).padStart(2, '0'));
      } else {
        L.wallTex[i] = Assets.get('tex/' + WALL_KEYS[ch]);
      }
      if (ch === 'D' || ch === 'L') {
        const horiz = x > 0 && x < w - 1 && MAP[y][x - 1] !== '.' && MAP[y][x + 1] !== '.';
        const door = { x, y, i, orient: horiz ? 'h' : 'v', open: 0, state: 'closed', timer: 0, locked: ch === 'L' };
        L.doorAt[i] = door;
        L.doors.push(door);
      }
    }
  }

  // zones -> floor/ceiling/light per cell
  for (const z of ZONES) {
    for (let y = z.y0; y <= z.y1; y++) {
      for (let x = z.x0; x <= z.x1; x++) {
        const i = y * w + x;
        L.zone[i] = z.name;
        L.floorTex[i] = Assets.get('tex/' + z.floor);
        let c = z.ceil;
        if (c === 'hall') c = ['ceil_concrete', 'ceil_light', 'ceil_tray'][y % 3];
        else if (c === 'corridor') c = x % 4 === 1 ? 'ceil_light' : (y === 9 ? 'ceil_tray' : 'ceil_concrete');
        L.ceilTex[i] = Assets.get('tex/' + c);
        L.baseLight[i] = z.light;
        L.flicker[i] = z.flicker || 0;
        const t = z.tint || [1, 1, 1];
        L.tintR[i] = t[0]; L.tintG[i] = t[1]; L.tintB[i] = t[2];
      }
    }
  }
  L.light.set(L.baseLight);

  for (const [type, x, y, a] of THINGS) {
    if (type === 'start') { L.start = { x, y, a }; continue; }
    if (DECOR[type]) {
      const d = DECOR[type];
      let px = x, py = y;
      if (d.solid === 'cell') { px = x + 0.5; py = y + 0.5; L.block[y * w + x] = 1; }
      L.decor.push({ type, x: px, y: py, h: d.h, lift: d.lift || 0, r: d.r || 0, anim: d.anim,
        bright: d.bright, tex: Assets.get('prop/' + (d.anim ? d.anim[0] : type)) });
      continue;
    }
    if (PICKUPS[type]) {
      L.pickups.push({ type, x, y, h: PICKUPS[type].h, tex: Assets.get('item/' + type), taken: false });
      continue;
    }
    if (ENEMY_TYPES[type]) { L.spawns.push({ type, x, y }); continue; }
    console.warn('unknown thing', type);
  }
  return L;
}

function zoneAt(L, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return '';
  return L.zone[cy * L.w + cx];
}
