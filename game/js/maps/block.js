// Burdzgla St. 65 and the block around it: the battle royale map.
//
// 96 x 96, which is four times the office in each direction and about fives times
// its walkable area. Eight places worth going, strung along one street that runs the
// width of the map, with the 63 office itself as one of them -- those are the
// campaign's own rows stamped straight in (see OFFICE_PART below), so the building
// you fight through is the building you work in.
//
// One thing the engine cannot do: there is a single floor plane, and no sectors or
// portals. So the roof and the underpass are not above and below anything -- they are
// flat places dressed to read as a roof and an underpass, open sky and a parapet for
// one, a low dark tiled ceiling for the other. They play as separate places. They are
// just not stacked, and making them so would be a new renderer.
//
// Composed rather than typed out: the grid helpers are in collide.js, and
// `node tools/checkmap.js block --ascii` draws the result and checks it over.
'use strict';

const BLOCK_W = 96, BLOCK_H = 96;

// Where the office goes, and how much of it to take. Its eastern twelve columns are
// solid concrete filler and Agamemnov's Hall; the useful building is the first thirty.
const OFF_X = 33, OFF_Y = 18, OFF_W = 30;

// Doors are the one piece of geometry the server would have to arbitrate every frame,
// and a battle royale has no use for them, so the office's become open doorways.
const OPEN_DOORS = { D: '.', E: '.', F: '.', L: '.', U: '.', u: '.' };

const OFFICE_PART = OFFICE_ROWS.map(row => row.slice(0, OFF_W)
  .replace(/[DEFLUu]/g, ch => OPEN_DOORS[ch]));

const BLOCK_ROWS = (() => {
  const G = mapGrid(BLOCK_W, BLOCK_H, '.');

  // ---- the office, and the street it stands on ----
  stamp(G, OFF_X, OFF_Y, OFFICE_PART);
  // its street is a dead end as the campaign has it: open both ends and the far kerb
  // so the road carries on across the block
  for (let y = OFF_Y + 36; y <= OFF_Y + 41; y++) {
    G[y][OFF_X] = '.';
    G[y][OFF_X + OFF_W - 1] = '.';
  }
  for (let x = OFF_X; x < OFF_X + OFF_W; x++) G[OFF_Y + 42][x] = '.';

  // the road runs the width of the map at the office's kerb
  const ROAD_Y0 = OFF_Y + 36, ROAD_Y1 = OFF_Y + 42;      // 54 .. 60

  // ---- the car park, west of the office ----
  // low walls round three sides, open to the road, bays marked by stub walls
  rect(G, 4, 20, 28, 48, 'O');
  for (let y = 44; y <= 48; y++) G[y][20] = '.';           // way through to the road
  fillRect(G, 4, 48, 28, 48, '.');
  for (let x = 7; x <= 25; x += 6) {
    fillRect(G, x, 24, x, 27, 'O');
    fillRect(G, x, 33, x, 36, 'O');
  }
  // an attendant's hut in the corner
  rect(G, 5, 41, 11, 46, 'P');
  G[46][8] = '.'; G[46][9] = '.';

  // ---- the warehouse, north east ----
  // Its west wall is at 66, not 63: the office's east wall is column 62, and butting
  // the two together would leave two walls back to back with no way between them.
  // The gap is the alley, and it is how you get from the top of the map to the road
  // without going through either building.
  rect(G, 66, 6, 91, 34, 'K');
  for (const y of [18, 19, 20]) { G[y][66] = '.'; G[y][91] = '.'; }   // roller doors
  for (const x of [77, 78, 79]) { G[6][x] = '.'; G[34][x] = '.'; }
  // racking down the middle, with aisles
  for (let x = 70; x <= 82; x += 6) {
    fillRect(G, x, 10, x, 16, 'S');
    fillRect(G, x, 23, x, 30, 'S');
  }
  // a mezzanine office in the corner, glass to the floor
  rect(G, 84, 7, 90, 13, 'V');
  G[13][87] = '.';

  // ---- the roof, north west: open sky behind a low parapet ----
  rect(G, 4, 4, 28, 16, 'O');
  for (const x of [15, 16]) G[16][x] = '.';                // the stair head down
  fillRect(G, 8, 8, 10, 8, 'O');                           // plant housings to hide behind
  fillRect(G, 20, 11, 24, 11, 'O');
  fillRect(G, 12, 13, 12, 15, 'O');

  // ---- the underpass, south: dark, low, tiled ----
  rect(G, 10, 70, 54, 82, 'T');
  for (const x of [20, 21, 44, 45]) { G[70][x] = '.'; G[82][x] = '.'; }
  fillRect(G, 26, 74, 38, 74, 'T');                        // a spine wall, two ways round
  fillRect(G, 26, 78, 38, 78, 'T');

  // ---- the kiosks, along the south side of the road ----
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 18;
    rect(G, x, 63, x + 8, 67, 'J');
    G[63][x + 4] = '.';                                    // serving hatch to the road
  }

  // ---- the loading yard, south east ----
  rect(G, 62, 70, 91, 90, 'Z');
  for (const y of [78, 79]) G[y][62] = '.';
  for (const x of [74, 75]) G[70][x] = '.';
  fillRect(G, 68, 74, 72, 74, 'O');
  fillRect(G, 80, 80, 86, 80, 'O');
  rect(G, 84, 84, 90, 89, 'K');
  G[84][87] = '.';

  // ---- getting between them ----
  // Nothing may cut through a building: the office occupies x 33..62, y 18..60, and
  // a road through it would open its walls in places nobody intended.
  fillRect(G, 29, 17, 32, 60, '.');                        // the alley west of the office
  fillRect(G, 63, 17, 65, 60, '.');                        // and the one east of it
  fillRect(G, 29, 4, 65, 17, '.');                         // along the top, above the office
  fillRect(G, 4, 17, 28, 19, '.');                         // the roof stair down to the car park
  fillRect(G, 4, 61, 91, 62, '.');                         // the far pavement, full width
  fillRect(G, 4, ROAD_Y0, 91, ROAD_Y1, '.');               // and the road itself
  fillRect(G, 8, 63, 10, 69, '.');                         // down to the underpass
  fillRect(G, 55, 63, 58, 69, '.');
  fillRect(G, 66, 35, 91, 38, '.');                        // warehouse out to the road
  fillRect(G, 86, 39, 91, 69, '.');                        // the east edge, down to the yard
  fillRect(G, 55, 83, 61, 90, '.');                        // underpass out to the loading yard

  border(G, 'K');
  return gridRows(G);
})();

// Lighting zones. One over the whole map so no cell is left without flats, then the
// places on top of it. Later ones win, so the order here matters.
const BLOCK_ZONES = [
  { name: 'Burdzgla St.', x0: 0, y0: 0, x1: BLOCK_W - 1, y1: BLOCK_H - 1,
    floor: 'asphalt', ceil: 'ceil_concrete', light: 1.0, tint: [1.08, 0.97, 0.92], sky: true },
  { name: 'The alleys', x0: 29, y0: 4, x1: 65, y1: 60,
    floor: 'asphalt', ceil: 'ceil_concrete', light: 0.88, tint: [1.0, 0.98, 1.0], sky: true },
  { name: 'The pavement', x0: 0, y0: 61, x1: BLOCK_W - 1, y1: 62,
    floor: 'sidewalk', ceil: 'ceil_concrete', light: 1.0, tint: [1.08, 0.97, 0.92], sky: true },
  { name: 'Car park', x0: 4, y0: 20, x1: 28, y1: 48,
    floor: 'asphalt', ceil: 'ceil_concrete', light: 0.92, tint: [1.0, 1.0, 1.04], sky: true },
  { name: "Attendant's hut", x0: 5, y0: 41, x1: 11, y1: 46,
    floor: 'floor_server', ceil: 'ceil_light', light: 0.8, tint: [1.05, 1.0, 0.92] },
  { name: 'The roof', x0: 4, y0: 4, x1: 28, y1: 16,
    floor: 'floor_gloss', ceil: 'ceil_concrete', light: 1.0, tint: [1.12, 1.0, 0.9], sky: true },
  { name: 'Warehouse', x0: 66, y0: 6, x1: 91, y1: 34,
    floor: 'floor_server', ceil: 'ceil_concrete', light: 0.62, tint: [0.92, 0.98, 1.1], flicker: 0.1,
    roof: 'fence_metal' },
  { name: 'Mezzanine', x0: 84, y0: 7, x1: 90, y1: 13,
    floor: 'floor_oak', ceil: 'ceil_tray', light: 0.85, tint: [1.05, 1.0, 0.95] },
  { name: 'Underpass', x0: 10, y0: 70, x1: 54, y1: 82,
    floor: 'tiles', ceil: 'ceil_dark', light: 0.42, tint: [0.86, 0.92, 1.05], flicker: 0.18,
    roof: 'asphalt' },
  { name: 'Kiosks', x0: 16, y0: 63, x1: 78, y1: 67,
    floor: 'sidewalk', ceil: 'ceil_concrete', light: 0.95, tint: [1.1, 1.0, 0.9], sky: true,
    roof: 'facade_slats' },
  { name: 'Loading yard', x0: 62, y0: 70, x1: 91, y1: 90,
    floor: 'asphalt', ceil: 'ceil_concrete', light: 0.9, tint: [1.0, 0.98, 0.98], sky: true },
  { name: 'The lock-up', x0: 84, y0: 84, x1: 90, y1: 89,
    floor: 'floor_server', ceil: 'ceil_dark', light: 0.5, tint: [1.0, 0.96, 0.92] },
  // the office's own zones, shifted to where it was stamped and clipped to the part
  // of it this map took
  ...OFFICE_ZONES
    .filter(z => z.x0 < OFF_W)
    .map(z => Object.assign({}, z, { x0: z.x0 + OFF_X, y0: z.y0 + OFF_Y,
      x1: Math.min(z.x1, OFF_W - 1) + OFF_X, y1: z.y1 + OFF_Y })),
];

// Where people come in. Spread wide, two or three per place, so fifteen of them can
// start far apart; the server picks which, furthest-first.
const BLOCK_SPAWNS = [
  // the roof
  [7, 7], [25, 7], [15, 14],
  // car park
  [10, 23], [23, 23], [10, 45], [24, 40],
  // the office: open space, lounge, reception, stairwell
  [38, 22], [60, 22], [40, 45], [57, 49], [49, 33],
  // the warehouse
  [69, 10], [88, 10], [69, 31], [88, 31], [78, 20],
  // the road and the kiosks
  [8, 57], [50, 57], [88, 57], [30, 65], [66, 65],
  // the underpass
  [14, 73], [50, 73], [32, 80],
  // the loading yard
  [66, 74], [88, 74], [75, 87],
].map(([x, y]) => {
  const a = Math.atan2(BLOCK_H / 2 - y, BLOCK_W / 2 - x);
  return ['brspawn', x + 0.5, y + 0.5, a];
});

// Loot. Tier 2 is worth crossing the map for and sits where you can be cornered:
// the warehouse mezzanine, the boss office, the lock-up, the middle of the underpass.
const BLOCK_LOOT = [
  ...[[87, 10], [88, 12], [52, 38], [56, 38], [87, 86], [88, 88], [31, 76], [33, 80],
      [80, 20], [15, 10]].map(([x, y]) => ['loot', x + 0.5, y + 0.5, 2]),
  ...[[6, 6], [26, 6], [11, 14], [22, 14], [8, 22], [25, 22], [8, 44], [25, 44],
      [7, 43], [10, 43], [68, 8], [89, 8], [68, 32], [89, 32], [73, 20], [86, 20],
      [36, 20], [60, 20], [38, 50], [58, 48], [44, 56], [14, 72], [48, 72], [30, 72],
      [30, 81], [64, 72], [89, 72], [72, 88], [36, 30], [48, 30]]
    .map(([x, y]) => ['loot', x + 0.5, y + 0.5, 1]),
  ...[[6, 12], [16, 6], [20, 8], [12, 21], [18, 26], [24, 32], [10, 36], [16, 40],
      [22, 46], [6, 45], [30, 24], [30, 40], [30, 56], [31, 60],
      [36, 24], [42, 20], [48, 24], [54, 20], [40, 30], [50, 34], [36, 40], [44, 40],
      [53, 44], [38, 58], [46, 58], [54, 58],
      [64, 10], [64, 24], [64, 40], [64, 56], [68, 16], [74, 12], [81, 16], [85, 28],
      [70, 36], [80, 36], [88, 44], [88, 52], [30, 44], [30, 56],
      [8, 56], [16, 56], [24, 56], [32, 56], [62, 56], [70, 56], [78, 56], [86, 56],
      [20, 64], [38, 64], [56, 64], [74, 64],
      [12, 76], [20, 80], [26, 72], [40, 80], [46, 76], [52, 80],
      [56, 86], [60, 88], [66, 80], [74, 72], [82, 76], [88, 83], [68, 88], [78, 84]]
    .map(([x, y]) => ['loot', x + 0.5, y + 0.5, 0]),
];

// What not to carry over from the office. A map file is data: it reads other map
// files and the grid helpers, and nothing from the gameplay tables -- so the coworkers
// and the hand-placed pickups are named here rather than looked up in ENEMY_TYPES and
// PICKUPS. checkmap.js would catch a name that stopped existing on either side.
const DROP_FROM_OFFICE = new Set([
  'start',
  // the people out on the campaign's street: friendly, and the rider's beat is a pair
  // of absolute x positions, so moving the street out from under him sends him
  // scooting through the car park
  'npc_bmw', 'npc_lexus', 'npc_rider',
  // coworkers: the battle royale has no AI in it
  'irakli', 'brute', 'tank', 'rider', 'sandro', 'beard', 'agamemnov',
  // pickups: the server seeds its own from the loot spots above
  'medkit', 'coffee', 'clip', 'shells', 'armor', 'shotgun', 'chaingun',
  'rifle', 'dbshotgun', 'rocketl', 'plasmagun', 'rockets', 'cells',
]);

const BLOCK_THINGS = [
  ...BLOCK_SPAWNS,
  ...BLOCK_LOOT,

  // the office's own furniture and the people on its street, shifted into place.
  // Its coworkers and its hand-placed pickups are dropped: the match has neither.
  ...offsetThings(OFFICE_THINGS.filter(([type, x]) => x < OFF_W - 1 && !DROP_FROM_OFFICE.has(type)),
    OFF_X, OFF_Y),

  // the car park, with something in most of the bays
  ...[[9, 25], [15, 25], [21, 25], [9, 34], [21, 34]]
    .map(([x, y], i) => [i % 2 ? 'lexus' : 'bmw', x + 0.5, y + 0.5, Math.PI / 2]),
  ...[[6, 21], [27, 21], [6, 47], [27, 47]].map(([x, y]) => ['streetlamp', x + 0.5, y + 0.5]),
  ...[[6, 21], [27, 21], [6, 47], [27, 47]].map(([x, y]) => ['lamp_glow', x + 0.5, y + 0.5]),
  ['bin', 12.4, 44.4], ['bin', 19.4, 29.4], ['shrub', 5.4, 30.4], ['shrub', 26.4, 38.4],

  // the roof: plant, vents and a way down
  ...[[9, 9], [10, 9], [21, 12], [23, 12], [12, 14]].map(([x, y]) => ['ac_unit', x + 0.6, y + 0.35]),
  ['bin', 26.4, 5.4], ['bin', 5.4, 15.4],
  ['streetlamp', 16.5, 9.5], ['lamp_glow', 16.5, 9.5],

  // the warehouse: crates, a forklift's worth of clutter, lights on the racking
  ...[[69, 8], [74, 18], [82, 18], [88, 17], [69, 33], [88, 33]]
    .map(([x, y]) => ['desk_broken', x, y]),
  ...[[71, 20], [77, 20], [83, 20], [89, 20]].map(([x, y]) => ['lamp', x + 0.5, y + 0.5]),
  ...[[67, 11], [67, 29], [90, 11], [90, 29]].map(([x, y]) => ['bin', x + 0.4, y + 0.4]),
  ['desk', 86, 10], ['chair_black', 86.5, 11.2], ['plant', 89.4, 8.4],
  ['spark', 75.5, 24.5], ['spark', 81.5, 14.5], ['blood_pool', 79.5, 20.5],

  // the underpass: strip lights and litter
  ...[[16, 76], [28, 76], [40, 76], [52, 76]].map(([x, y]) => ['lamp', x + 0.5, y + 0.5]),
  ...[[13, 72], [51, 72], [13, 80], [51, 80]].map(([x, y]) => ['bin', x + 0.4, y + 0.4]),
  ['blood_pool', 32.5, 76.5], ['spark', 44.5, 80.5], ['scooter', 24.4, 72.4],

  // the kiosks and the road
  ...[[20, 68], [38, 68], [56, 68], [74, 68]].map(([x, y]) => ['shrub', x + 0.4, y + 0.4]),
  ...[[12, 62], [34, 62], [56, 62], [78, 62]].map(([x, y]) => ['streetlamp', x + 0.5, y + 0.4]),
  ...[[12, 62], [34, 62], [56, 62], [78, 62]].map(([x, y]) => ['lamp_glow', x + 0.5, y + 0.4]),
  ['lexus', 24.5, 58.5, 0], ['bmw', 70.5, 58.5, Math.PI],

  // the loading yard
  ...[[66, 72], [88, 72], [66, 88], [88, 88]].map(([x, y]) => ['bin', x + 0.4, y + 0.4]),
  ['desk_broken', 70, 78], ['desk_broken', 84, 86], ['coffee_table', 76.5, 82.5],
  ['streetlamp', 76.5, 76.5], ['lamp_glow', 76.5, 76.5],
  ['shrub', 64.4, 85.4], ['shrub', 89.4, 79.4],
];

const BLOCK_MAP_SPEC = {
  name: 'block',
  rows: BLOCK_ROWS,
  zones: BLOCK_ZONES,
  things: BLOCK_THINGS,
  cull: 40,
  defaults: { wall: 'concrete', floor: 'asphalt', ceil: 'ceil_concrete', sky: 'sky_dusk' },
  // The diagonal here is 136 cells and the campaign's falloff gives up at fifteen.
  // These are chosen so a surface gets steadily darker all the way out, never
  // brighter: a curve that dips and rises makes two different distances look
  // identical, which is worse than no cue. A mid-grey wall runs 128 at one cell to
  // 39 at a hundred and thirty-six, changing the whole way.
  lighting: { lightRange: 130, lightFloor: 0.12, fogNear: 10, fogFar: 160, fogMax: 0.8 },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { BLOCK_MAP_SPEC };
