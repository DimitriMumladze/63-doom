// The 63 office, gone wrong. Grid map + lighting zones + placed things.
'use strict';

// Walls: K concrete, P plaster, R radiator, W window, C cabinet, M mural,
// S server rack, T tiles, B whiteboard, lower-case = blood-stained variant,
// G grey plaster, H grey plaster with breaker box, V glass partition,
// N dino mural, A stairs, Q 63 BITS sign (multi-cell pictures),
// X/Y/J building front (pillar / shop glass / wood slats), Z street-end fence, O wall across the street,
// r Soviet wallpaper, v propaganda posters, I Sandro's portrait, y Kremlin brick, f Russian flag banner,
// D door, E entrance door, F front door, L locked door (boss room), U sealed door (Red Corner),
// u sealed door (Agamemnov's Hall). '.' = open floor.
const MAP = [
  'KMMMMMMMMMMMMKSSSSSSSSSSSSSSSKKKKKKKKKKKKK', // 0
  'W............K...............SKKKKKKKKKKKK', // 1
  'W............K...............SKKKKKKKKKKKK', // 2
  'W............K..SSSS...SSSS..SKKKKKKKKKKKK', // 3
  'W............K...............SKKKKKKKKKKKK', // 4
  'W............K..ssss...SSSS..SKKKKKKKKKKKK', // 5
  'W............K...............SKKKKKKKKKKKK', // 6
  'W............K...............SKKKKKKKKKKKK', // 7
  'KCCCCCDCCCCCCKPPPPPPPDPPPPPPPKKKKKKKKKKKKK', // 8
  'P............................PKKKKKKKKKKKK', // 9
  'R............................RKKKKKKKKKKKK', // 10
  'KTTTDTTTTKPPPDPPPPKpppppLppppKKKKKKKKKKKKK', // 11
  'T........KB.......Kp.........pKKKKKKKKKKKK', // 12  (x19 is wall-coloured below; see fix)
  'T........K........K..........pKKKKKKKKKKKK', // 13
  'T........K........K..........pKKKKKKKKKKKK', // 14
  'T........K........K...k..k...pKKKKKKKKKKKK', // 15
  'T........K........K..........pKKKKKKKKKKKK', // 16
  't........K........K..........pKKKKKKKKKKKK', // 17
  'KTTTDTTTTKBBBBBBBBK..........pKKKKKKKKKKKK', // 18  kitchen door down to the lounge
  'GGGG.GGGNNNNGGGGGGK...k..k...pKKKKKKKKKKKK', // 19  lounge: "No internet" dino wall
  'G.................K..........pKKKKKKKKKKKK', // 20
  'G.................K..........pKKKKKKKKKKKK', // 21
  'G.................KpppppUppppKKKKKKKKKKKKK', // 22  sealed door from the boss office to the Red Corner
  'G.................KKrrrr.rrrrKyyyfyyyyfyyy', // 23  Agamemnov's Hall (x30-41) behind the Red Corner
  'G.................Kr.........ry..........y', // 24  Red Corner: COMMUNIST SANDRO's room
  'G.................Kr.........rf..........f', // 25
  'KGGGGGGGGDGGGGGGGGKv.........vy..........y', // 26
  'KKKKV.........QKKKKr.........ry..........y', // 27  reception: glass walls, 63 BITS sign
  'KKKKV.........QKKKKr.........u...........f', // 28  sealed door from the Red Corner to Agamemnov's Hall
  'KKKKV.........VKKKKv.........vy..........y', // 29
  'KAAAAGGGGEGGGGHGGKKr.........ry..........y', // 30  stairs + entrance door
  'G................GKr.........rf..........f', // 31  stairwell
  'G................GKv.........vy..........y', // 32
  'G................GKr.........ry..........y', // 33
  'G................GKrrrrrIIrrrKyyyfyyyyfyyy', // 34  Sandro's portrait
  'XYYXYYXYYXYYXFXYYXYYXYYXYYXJJXKKKKKKKKKKKK', // 35  the building front on Burdzgla St., front door at x13
  'Z............................ZKKKKKKKKKKKK', // 36  sidewalk
  'Z............................ZKKKKKKKKKKKK', // 37
  'Z............................ZKKKKKKKKKKKK', // 38  curb
  'Z............................ZKKKKKKKKKKKK', // 39  road, the two cars are parked here
  'Z............................ZKKKKKKKKKKKK', // 40
  'Z............................ZKKKKKKKKKKKK', // 41
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOKKKKKKKKKKKK', // 42  low wall across the street
];
// row 12 has two decorative stains on the meeting/boss walls; the cells right
// behind the boss door must stay open, so patch them here.
MAP[12] = 'T........KB.......K..........pKKKKKKKKKKKK';

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

function stripIndex(x, y, ch) {
  let n = 0;
  const horiz = MAP[y][x - 1] === ch || MAP[y][x + 1] === ch;
  const dx = STRIPS_FROM_EAST[ch] ? 1 : -1;
  if (horiz) while (MAP[y][x + dx * (1 + n)] === ch) n++;
  else while (y - 1 - n >= 0 && MAP[y - 1 - n][x] === ch) n++;
  return n;
}

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
  { name: 'Lounge', x0: 0, y0: 19, x1: 17, y1: 26, floor: 'floor_oak', ceil: 'lounge', light: 0.9,
    tint: [1.05, 1.0, 0.95] },
  { name: 'Reception', x0: 4, y0: 27, x1: 14, y1: 29, floor: 'floor_oak', ceil: 'ceil_tray', light: 0.95,
    tint: [1.1, 1.0, 0.9] },
  { name: 'Stairwell', x0: 0, y0: 30, x1: 17, y1: 35, floor: 'floor_gloss', ceil: 'ceil_concrete', light: 0.7,
    tint: [0.95, 1.0, 1.08], flicker: 0.1 },
  { name: 'Burdzgla St.', x0: 0, y0: 36, x1: 29, y1: 42, floor: 'street', ceil: 'ceil_concrete', light: 1.0,
    tint: [1.08, 0.97, 0.92], sky: true },
  { name: 'Red Corner', x0: 20, y0: 23, x1: 28, y1: 33, floor: 'carpet_red', ceil: 'redcorner', light: 0.8,
    tint: [1.15, 0.9, 0.85] },
  { name: "Agamemnov's Hall", x0: 30, y0: 23, x1: 41, y1: 34, floor: 'carpet_red', ceil: 'hall_ru', light: 0.75,
    tint: [0.92, 0.95, 1.15] },
];

// [type, x, y]  (cell coords; desks snap to cell centres and block the cell)
const THINGS = [
  ['start', 17.0, 41.2, -2.5],

  // --- Burdzgla St. 65 at dusk: the building front and our two cars ---
  ['lexus', 5.5, 39.5, 0], ['bmw', 21.5, 39.5, Math.PI],
  ['streetlamp', 9.5, 38.25], ['lamp_glow', 9.5, 38.25], ['streetlamp', 24.5, 38.25], ['lamp_glow', 24.5, 38.25],
  ['shrub', 3.5, 36.4], ['shrub', 8.5, 36.4], ['shrub', 18.5, 36.4], ['shrub', 26.5, 36.4],
  ['ac_unit', 15.6, 36.35], ['ac_unit', 1.6, 36.35], ['plate65', 12.5, 36.03],
  // the BMW broke down again (bonnet up, steam); the Lexus owner smokes by his car; a guy scoots past
  ['npc_bmw', 19.3, 38.8], ['npc_lexus', 5.6, 38.45], ['npc_rider', 3.0, 37.25, 0],

  // --- Red Corner: COMMUNIST SANDRO under his own portrait ---
  ['desk_soviet', 24, 32], ['soviet_flag', 20.5, 33.4], ['soviet_flag', 28.5, 33.4],
  ['bust', 22.4, 33.3], ['samovar', 27.5, 26.6], ['tv_rubin', 20.6, 28.6], ['matryoshka', 27.6, 29.6],
  ['coat_stand', 20.5, 25.6], ['star_lamp', 20.12, 30.5], ['star_lamp', 28.88, 30.5],
  ['star_lamp', 20.12, 26.5], ['star_lamp', 28.88, 26.5],
  ['medkit', 21.6, 24.5], ['armor', 27.4, 24.5],
  ['sandro', 24.5, 30.6],

  // --- Agamemnov's Hall: THE AGAMEMNOV before his throne, under Russian flags ---
  ['throne', 39.6, 28.5], ['russian_flag', 31.5, 24.4], ['russian_flag', 31.5, 32.6], ['russian_flag', 35.5, 24.3],
  ['russian_flag', 35.5, 32.7], ['russian_flag', 40.5, 24.4], ['russian_flag', 40.5, 32.6],
  ['russian_flag', 40.4, 26.9], ['russian_flag', 40.4, 30.1],
  ['medkit', 31.6, 26.5], ['armor', 31.6, 30.5], ['rockets', 32.5, 25.0], ['cells', 32.5, 32.0],
  ['agamemnov', 37.8, 28.5],

  // --- stairwell: you come up the stairs and the office door is ahead ---
  ['doormat', 9.5, 31.3], ['doormat', 13.5, 34.6], ['plant', 16.4, 31.5], ['bin', 16.5, 34.5],
  ['clip', 5.5, 34.4], ['coffee', 15.5, 34.4],
  ['irakli', 2.5, 32.2],

  // --- reception: glass partitions and the 63 BITS sign ---
  ['plant', 5.5, 27.5], ['chair_black', 6.2, 29.3],
  ['clip', 12.5, 29.4], ['armor', 12.4, 27.6],
  ['tank', 11.5, 28.5], ['brute', 7.5, 27.8],

  // --- lounge: the long sofa under the dino wall ---
  ['sofa', 9, 20], ['sofa', 10, 20], ['coffee_table', 10.0, 21.8],
  ['pendant', 9.4, 21.6], ['pendant', 10.6, 21.6],
  ['scooter', 7.4, 20.4], ['hanging_chair', 13.3, 20.6],
  ['plant', 1.4, 25.4], ['bin', 17.4, 20.4],
  ['coffee', 9.6, 22.5], ['coffee', 10.4, 22.5], ['medkit', 16.5, 25.4], ['shells', 1.5, 20.5],
  ['rider', 14.5, 23.5], ['irakli', 3.5, 23.0], ['brute', 15.5, 21.0],

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
    wallTexIn: new Array(N).fill(null), wallH: new Float32Array(N).fill(WALL_H), lintel: new Array(N).fill(null),
    sky: new Uint8Array(N), skyTex: Assets.get('tex/sky_dusk'),
    floorTex: new Array(N), ceilTex: new Array(N),
    light: new Float32Array(N), baseLight: new Float32Array(N), flicker: new Float32Array(N),
    tintR: new Float32Array(N).fill(1), tintG: new Float32Array(N).fill(1), tintB: new Float32Array(N).fill(1),
    zone: new Array(N).fill(''),
    defWall: Assets.get('tex/concrete'), defFloor: Assets.get('tex/floor_oak'), defCeil: Assets.get('tex/ceil_concrete'),
    decor: [], pickups: [], spawns: [], npcs: [], start: { x: 2, y: 7, a: 0 },
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
      const ch = MAP[y][x], i = y * w + x;
      if (ch === '.') continue;
      L.solid[i] = 1;
      if (ch === 'M') {
        L.wallTex[i] = Assets.get('tex/mural_' + String((x - 1) % 12).padStart(2, '0'));
      } else if (WALL_STRIPS[ch]) {
        L.wallTex[i] = Assets.get('tex/' + WALL_STRIPS[ch] + '_' + stripIndex(x, y, ch));
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
      if (ch === 'D' || ch === 'E' || ch === 'F' || ch === 'L' || ch === 'U' || ch === 'u') {
        const horiz = x > 0 && x < w - 1 && MAP[y][x - 1] !== '.' && MAP[y][x + 1] !== '.';
        const door = { x, y, i, key: ch, orient: horiz ? 'h' : 'v', open: 0, state: 'closed', timer: 0,
          locked: ch === 'L' || ch === 'U' || ch === 'u' };
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
        let f = z.floor;
        if (f === 'street') f = y <= 37 ? 'sidewalk' : (y === 38 ? 'curb' : 'asphalt');
        L.floorTex[i] = Assets.get('tex/' + f);
        L.sky[i] = z.sky ? 1 : 0;
        let c = z.ceil;
        if (c === 'hall') c = ['ceil_concrete', 'ceil_light', 'ceil_tray'][y % 3];
        else if (c === 'corridor') c = x % 4 === 1 ? 'ceil_light' : (y === 9 ? 'ceil_tray' : 'ceil_concrete');
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

  for (const [type, x, y, a] of THINGS) {
    if (type === 'start') { L.start = { x, y, a }; continue; }
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
  return L;
}

function zoneAt(L, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return '';
  return L.zone[cy * L.w + cx];
}
