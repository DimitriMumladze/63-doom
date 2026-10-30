// The yard behind Burdzgla St. 65: the battle royale test map.
//
// Deliberately small and plain. It exists so fifteen people can be shooting each
// other while the server, the ring and the lobby are still being got right; the
// real 96x96 block (maps/block.js) comes after that and uses the same format.
//
// Composed rather than typed out: see the grid helpers in collide.js.
'use strict';

const YARD_W = 48, YARD_H = 48;

const YARD_MAP = (() => {
  const G = mapGrid(YARD_W, YARD_H, '.');

  // --- the depot in the middle: four ways in, so nobody can hold all of it ---
  rect(G, 17, 19, 30, 28, 'G');
  for (const [x, y] of [[23, 19], [24, 19], [23, 28], [24, 28]]) G[y][x] = '.';   // north + south
  for (const y of [23, 24]) { G[y][17] = '.'; G[y][30] = '.'; }                   // west + east
  // a partition inside, so a firefight in there has corners
  for (let y = 21; y <= 26; y++) G[y][26] = 'V';
  G[23][26] = '.'; G[24][26] = '.';

  // --- four sheds, one per corner, each open on the side facing the middle ---
  const sheds = [[5, 5, 1, 1], [36, 5, -1, 1], [5, 36, 1, -1], [36, 36, -1, -1]];
  for (const [sx, sy, dx, dy] of sheds) {
    rect(G, sx, sy, sx + 6, sy + 6, 'K');
    // the doorway goes on the inward face
    const mx = sx + 3, my = sy + 3;
    if (dx > 0) { G[my][sx + 6] = '.'; G[my + 1][sx + 6] = '.'; }
    else { G[my][sx] = '.'; G[my + 1][sx] = '.'; }
    if (dy > 0) { G[sy + 6][mx] = '.'; } else { G[sy][mx] = '.'; }
  }

  // --- low walls out in the open: cover you can shoot over but not through ---
  for (const [x0, y0, x1, y1] of [
    [13, 11, 20, 11], [27, 11, 34, 11], [13, 36, 20, 36], [27, 36, 34, 36],
    [11, 14, 11, 20], [36, 14, 36, 20], [11, 27, 11, 33], [36, 27, 36, 33],
    [21, 6, 26, 6], [21, 41, 26, 41], [6, 22, 6, 25], [41, 22, 41, 25],
  ]) fillRect(G, x0, y0, x1, y1, 'O');

  border(G, 'Z');
  return gridRows(G);
})();

const YARD_ZONES = [
  { name: 'The yard', x0: 0, y0: 0, x1: YARD_W - 1, y1: YARD_H - 1,
    floor: 'asphalt', ceil: 'ceil_concrete', light: 1.0, tint: [1.08, 0.97, 0.92], sky: true },
  { name: 'Loading bay', x0: 17, y0: 19, x1: 30, y1: 28,
    floor: 'floor_gloss', ceil: 'ceil_tray', light: 0.8, tint: [0.98, 1.0, 1.05] },
  ...[[5, 5], [36, 5], [5, 36], [36, 36]].map(([x, y]) => ({
    name: 'Shed', x0: x, y0: y, x1: x + 6, y1: y + 6,
    floor: 'floor_server', ceil: 'ceil_dark', light: 0.6, tint: [1.0, 0.98, 0.95] })),
];

// Sixteen places to come in, spread round the edge and the middle, so the server
// has room to put fifteen people far apart. Angle faces roughly inward.
const YARD_SPAWNS = (() => {
  const mid = YARD_W / 2;
  const pts = [];
  for (const [x, y] of [
    [4, 15], [4, 32], [43, 15], [43, 32],
    [15, 4], [32, 4], [15, 43], [32, 43],
    [9, 23], [38, 23], [23, 9], [23, 38],
    [14, 14], [33, 14], [14, 33], [33, 33],
  ]) pts.push(['brspawn', x + 0.5, y + 0.5, Math.atan2(mid - y, mid - x)]);
  return pts;
})();

// Loot: tier 0 out in the open, 1 in the sheds, 2 in the depot -- the middle is
// worth fighting over. The server rolls what each one actually holds.
const YARD_LOOT = [
  ...[[21, 22], [27, 22], [21, 26], [27, 26], [23, 21], [24, 26], [28, 23], [19, 24]]
    .map(([x, y]) => ['loot', x + 0.5, y + 0.5, 2]),
  ...[[7, 7], [9, 7], [39, 7], [41, 7], [7, 39], [9, 39], [39, 39], [41, 39],
      [7, 9], [40, 9], [7, 41], [40, 41]].map(([x, y]) => ['loot', x + 0.5, y + 0.5, 1]),
  ...[[16, 13], [31, 13], [16, 34], [31, 34], [13, 17], [34, 17], [13, 30], [34, 30],
      [23, 4], [23, 43], [4, 23], [43, 23], [19, 16], [28, 16], [19, 31], [28, 31],
      [10, 10], [37, 10], [10, 37], [37, 37], [23, 15], [23, 32], [15, 20], [32, 20]]
    .map(([x, y]) => ['loot', x + 0.5, y + 0.5, 0]),
];

const YARD_THINGS = [
  ...YARD_SPAWNS,
  ...YARD_LOOT,
  // a couple of cars for cover, and some clutter so the place is not totally bare
  ['lexus', 14.5, 23.5, 0], ['bmw', 33.5, 23.5, Math.PI],
  ['streetlamp', 23.5, 14.5], ['lamp_glow', 23.5, 14.5],
  ['streetlamp', 23.5, 33.5], ['lamp_glow', 23.5, 33.5],
  ...[[8, 20], [39, 20], [20, 8], [27, 39]].map(([x, y]) => ['shrub', x + 0.4, y + 0.4]),
  ...[[18, 18], [29, 18], [18, 29], [29, 29]].map(([x, y]) => ['bin', x + 0.4, y + 0.4]),
  ['ac_unit', 20.6, 29.35], ['ac_unit', 27.6, 18.35],
];

const YARD_MAP_SPEC = {
  name: 'yard',
  rows: YARD_MAP,
  zones: YARD_ZONES,
  things: YARD_THINGS,
  cull: 34,                      // props past this are not worth putting in the sprite list
  defaults: { wall: 'concrete', floor: 'asphalt', ceil: 'ceil_concrete', sky: 'sky_dusk' },
  // you have to be able to see across a yard this size, and tell forty cells from
  // seventy; the campaign's falloff bottoms out at fifteen. Same curve as the block
  // (see the note there) so the two look like the same evening.
  lighting: { lightRange: 130, lightFloor: 0.12, fogNear: 10, fogFar: 160, fogMax: 0.8 },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { YARD_MAP_SPEC };
