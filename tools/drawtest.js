// Draw every screen once, with no browser.   node tools/drawtest.js
//
// The headless tests play the game but never draw it, and the HUD is the half that
// only a browser normally runs: the status bar, the minimap, the lobby, the
// scoreboard, the title screen. This loads hud.js for real against a canvas context
// that records calls instead of painting, puts the game into each state in turn, and
// draws it. It catches the things that would otherwise be found by a black screen:
// a name that does not exist, an asset key nothing loaded, a function that throws on
// an empty roster.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');

const problems = [];
const note = s => { problems.push(s); console.log('  PROBLEM  ' + s); };

// A 2D context that remembers what it was asked to do. Anything the HUD calls that
// is not here shows up as a problem rather than a silent no-op.
function recorder() {
  const calls = [];
  const KNOWN = new Set(['fillRect', 'strokeRect', 'fillText', 'drawImage', 'beginPath', 'moveTo',
    'lineTo', 'closePath', 'fill', 'stroke', 'arc', 'rect', 'clip', 'save', 'restore',
    'setLineDash', 'createLinearGradient', 'measureText', 'putImageData', 'createImageData',
    'getImageData', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform', 'clearRect']);
  const target = {
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', globalAlpha: 1, lineWidth: 1,
    imageSmoothingEnabled: false, filter: '', globalCompositeOperation: '',
    canvas: { width: 480, height: 270 },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      if (!KNOWN.has(k)) note(`the HUD called ctx.${k}, which this stub does not know about`);
      return (...a) => {
        calls.push(k);
        if (k === 'createLinearGradient') return { addColorStop() {} };
        if (k === 'measureText') return { width: (a[0] || '').length * 5 };
        if (k === 'createImageData' || k === 'getImageData') {
          return { data: new Uint8ClampedArray((a[2] || a[0] || 1) * (a[3] || a[1] || 1) * 4) };
        }
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
    has: () => true,
  });
}

const TEX = { w: 64, h: 64, data: new Uint32Array(64 * 64).fill(0xff808080), img: { width: 64, height: 64 } };

const sandbox = {
  console: { log() {}, warn() {}, error: (...a) => note('console.error: ' + a.join(' ')) },
  Math, Object, Array, String, Number, JSON, Date, Set, Map, Infinity, NaN,
  isNaN, parseInt, parseFloat, isFinite,
  Uint8Array, Uint8ClampedArray, Uint32Array, Int16Array, Int32Array, Float32Array,
  WebSocket, setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  module: undefined,
  window: { EMBED: null, isSecureContext: true, matchMedia: () => ({ matches: false }) },
  location: { search: '', hostname: '', protocol: 'http:', hash: '' },
  document: {
    createElement: () => ({ width: 0, height: 0, getContext: () => recorder() }),
    getElementById: () => null,
    addEventListener() {}, fonts: null,
  },
  navigator: { userAgent: 'node', getGamepads: () => [] },
  Sound: { play() {}, init() {}, ctx: null },
  Music: { setIntensity() {}, setVolume() {}, duck() {} },
  BossMusic: { play() {}, stop() {}, setVolume() {} },
  Input: {
    keys: {}, down: {}, mode: 'mouse', lastDX: 0, padBlocked: false, locked: false,
    pad: { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, run: false, crouch: false },
    touch: { lx: 0, ly: 0, fire: false, run: false, crouch: false },
    pressed: () => false, takeMouse: () => [0, 0], takeWheel: () => 0, fireHeld: () => false,
    gp: null,
  },
};
sandbox.Main = { state: 'play', menu: 0, joining: false, joiningBr: false, showFps: false,
  stateT: 1, winStats: { kills: 3, total: 26, time: '2:04' },
  setState(s) { this.state = s; }, onDeath() {}, onBrDeath() {}, onBrMatch() {}, onBrEnd() {},
  lock() {}, fullscreen() {}, restart() {}, onWin() {},
  soundBlocked: () => false };

const ctx = vm.createContext(sandbox);
vm.runInContext('var Assets = { img: {}, get: () => TEX };', ctx);
ctx.TEX = TEX;
for (const f of ['collide.js', 'weapons.js', 'engine.js', 'level.js', 'maps/office.js',
  'maps/yard.js', 'maps/block.js', 'mode.js', 'settings.js', 'game.js', 'net.js', 'hud.js']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  } catch (e) {
    note(`${f} would not even load: ${e.message}`);
    process.exit(1);
  }
}
vm.runInContext("var SKINS = ['brute','tank','irakli','beard','rider','hood','specs','sandro','agamemnov'];", ctx);

const Game = vm.runInContext('Game', ctx);
const Hud = vm.runInContext('Hud', ctx);
const Net = vm.runInContext('Net', ctx);
const BR = vm.runInContext('BR', ctx);
const Engine = vm.runInContext('Engine', ctx);

// the renderer needs its buffers, but never a real canvas
Engine.ctx = recorder();
Engine.image = { data: new Uint8ClampedArray(480 * 230 * 4) };
Engine.buf = new Uint32Array(Engine.image.data.buffer);

function draw(label, fn) {
  const g = recorder();
  try {
    fn(g);
    console.log(`  ok  ${label}`);
  } catch (e) {
    note(`${label} threw: ${e.message}`);
    if (e.stack) console.log('      ' + e.stack.split('\n')[1].trim());
  }
}

// ---------------- the campaign ----------------
console.log('campaign:');
Game.start('campaign');
Game.target = Game.enemies[0];
Game.targetT = 1;
Game.msgs = [{ text: 'Picked up a clip.', t: 3 }];
draw('title screen (no server)', g => Hud.drawTitle(g, 1.2));
draw('status bar', g => Hud.drawBar(g));
draw('crosshair, messages, tags', g => Hud.drawView(g));
draw('speech bubbles', g => Hud.drawBubbles(g));
draw('paused', g => Hud.drawPaused(g));
draw('dead', g => Hud.drawDead(g, 1.5));
draw('win', g => Hud.drawWin(g, 1.5, { kills: 26, total: 26, time: '7:12' }));
draw('loading', g => Hud.drawLoading(g, 120, 296));

// a lit frame of the office, so the renderer itself is exercised too
draw('render the office', () => {
  Engine.render({ x: Game.player.x, y: Game.player.y, a: Game.player.a }, Game.L, Game.sprites());
});

// ---------------- the title screen with a server ----------------
console.log('\ntitle screen with a server:');
Net.lobby = { players: 3, max: 8, full: false, br: null };
draw('two buttons (co-op only)', g => Hud.drawTitle(g, 1.2));
Net.lobby.br = { players: 7, max: 15, state: 'lobby' };
draw('three buttons', g => Hud.drawTitle(g, 1.2));
Net.lobby.br.state = 'live';
sandbox.Main.menu = 2;
draw('three buttons, match running, third picked', g => Hud.drawTitle(g, 1.2));
Net.lobby.br.players = 15;
draw('three buttons, match full', g => Hud.drawTitle(g, 1.2));

// ---------------- the battle royale ----------------
console.log('\nbattle royale:');
Net.lobby = null;
Net.on = true; Net.mode = 'br'; Net.id = 3; Net.slot = 3;
BR.myName = 'IRAKLI'; BR.mySkin = 'irakli'; BR.ready = false;
const SK = ['brute', 'tank', 'irakli', 'beard', 'rider', 'hood', 'specs', 'sandro', 'agamemnov'];
BR.roster = [];
for (let i = 0; i < 12; i++) {
  BR.roster.push({ id: i + 1, slot: i + 1, name: 'COLLEAGUE' + (i + 1), skin: SK[i % SK.length],
    ready: i % 3 !== 0, late: i === 11 });
}
BR.state = 'lobby'; BR.stateT = 4; BR.min = 2; BR.max = 15; BR.countdown = 20; BR.wait = 90;

draw('lobby, 12 waiting', g => Hud.drawBrLobby(g, 2.5));
BR.state = 'countdown'; BR.stateT = 12;
draw('lobby, counting down', g => Hud.drawBrLobby(g, 2.5));
BR.roster = [{ id: 3, slot: 3, name: 'IRAKLI', skin: 'irakli', ready: true, late: false }];
draw('lobby, alone', g => Hud.drawBrLobby(g, 2.5));
BR.ready = true;
draw('lobby, ready', g => Hud.drawBrLobby(g, 2.5));
BR.roster = [
  { id: 3, slot: 3, name: 'IRAKLI', skin: 'irakli', ready: true, late: false },
  { id: 4, slot: 4, name: 'NIKOLOZ', skin: 'tank', ready: false, late: false },
  { id: 5, slot: 5, name: 'LASHA', skin: 'rider', ready: false, late: false },
];
draw('lobby, waiting on two of them', g => Hud.drawBrLobby(g, 2.5));

// a match in progress
Game.start('br');
BR.state = 'live'; BR.alive = 9; BR.kills = 2; BR.place = 0;
BR.ring = { cx: 24, cy: 24, r: 15, tx: 20, ty: 26, tr: 9, phase: 2, shrinking: false, left: 18, dps: 2 };
for (let i = 1; i <= 8; i++) {
  if (i === 3) continue;
  const r = Net.addRemote(i, i, { skin: SK[i % SK.length], name: 'COLLEAGUE' + i });
  r.x = 20 + i; r.y = 22 + (i % 5); r.tx = r.x; r.ty = r.y; r.on = true;
  r.dead = i % 4 === 0;
}
BR.onKill(1, 2, 'shotgun', 9);
BR.onKill(3, 4, 'rifle', 8);
BR.onKill(0, 5, 'ring', 7);
BR.onKill(6, 3, 'dbshotgun', 6);
draw('status bar in a match', g => Hud.drawBar(g));
draw('minimap, feed, ring HUD', g => Hud.drawBrView(g));
draw('minimap on the office map too', g => { const was = Game.L; Hud.mapFor = ''; Hud.drawMinimap(g); Hud.mapFor = ''; Game.L = was; });
BR.ring.shrinking = true; BR.ring.left = 7;
draw('status bar while the vents close', g => Hud.drawBar(g));
Game.player.x = 2; Game.player.y = 2;      // well outside
BR.update(0.05);
draw('outside the vents', g => Hud.drawBrView(g));
draw('render the yard with the ring', () => {
  Engine.render({ x: Game.player.x, y: Game.player.y, a: 0.7, ring: BR.ring, ringTime: 3 },
    Game.L, Game.sprites());
});

// the drop: aboard, free-falling, under the chute
console.log('');
console.log('the drop:');
BR.plane = { x0: 4, y0: 10, x1: 92, y1: 86, alt: 24, speed: 13, t: 2.5, lead: 1.5 };
BR.fall = { speed: 9, chuteAt: 8, chuteSpeed: 3 };
BR.planeT = 2.5; BR.aboard = true; BR.aboardN = 9; BR.falling = false; BR.z = 24;
Game.player.x = 30; Game.player.y = 26;
draw('aboard, doors open', g => Hud.drawDrop(g, 1.2));
BR.planeT = 0;
draw('aboard, doors still shut', g => Hud.drawDrop(g, 1.2));
BR.planeT = 2.5; BR.aboard = false; BR.falling = true; BR.z = 18; BR.fallT = 0.7; BR.aboardN = 4;
draw('free fall', g => Hud.drawDrop(g, 1.2));
BR.z = 5; BR.fallT = 2.6;
draw('under the chute', g => Hud.drawDrop(g, 1.2));
BR.plane = null;
draw('drop screen with no flight (should not throw)', g => Hud.drawDrop(g, 1.2));
// and the aerial view itself, through the real renderer
BR.plane = { x0: 4, y0: 10, x1: 92, y1: 86, alt: 24, speed: 13, t: 2.5, lead: 1.5 };
for (const [label, z, hz] of [['from the plane', 24, -150], ['mid fall', 12, -90], ['about to land', 2.4, -20]]) {
  draw('render ' + label, () => {
    Engine.render({ x: 48.5, y: 38.5, a: 0.6, eyeZ: z, horizon: hz }, Game.L, Game.sprites());
  });
}
BR.aboard = false; BR.falling = false; BR.z = 0;

// dead, watching, and the scoreboard
Game.player.dead = true;
BR.place = 4; BR.specId = 1;
draw('spectating', g => Hud.drawSpectate(g));
BR.specId = 0;
draw('spectating with nobody chosen', g => Hud.drawSpectate(g));
BR.board = BR.roster.concat([]).map((e, i) => ({ id: e.id, slot: e.slot, name: e.name,
  skin: e.skin, kills: (i * 3) % 5, place: i + 1 }));
for (let i = 2; i <= 12; i++) {
  BR.board.push({ id: 100 + i, slot: i, name: 'COLLEAGUE' + i, skin: SK[i % SK.length],
    kills: i % 4, place: i });
}
BR.winner = BR.board[0].id;
draw('scoreboard', g => Hud.drawBrResults(g, 2));
BR.winner = 0;
draw('scoreboard, nobody left standing', g => Hud.drawBrResults(g, 2));
BR.board = [];
draw('scoreboard, empty', g => Hud.drawBrResults(g, 2));

// ---------------- an empty battle royale, which is where things throw ----------------
console.log('\nedge cases:');
BR.ring = null; BR.board = null; BR.feed = []; BR.roster = [];
Net.remotes = {};
draw('match HUD with no ring and nobody else', g => { Hud.drawBar(g); Hud.drawBrView(g); });
Game.player.dead = false;
draw('spectating with nobody alive', g => Hud.drawSpectate(g));

console.log(problems.length ? `\n${problems.length} problem(s)` : '\nevery screen drew without complaint');
process.exit(problems.length ? 1 : 0);
