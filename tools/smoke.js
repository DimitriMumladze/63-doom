// Play the campaign with no browser.   node tools/smoke.js
//
// Loads the real engine.js / level.js / mode.js / game.js with the browser bits
// stubbed, then walks a player around the office for a simulated minute, firing,
// opening every door and waking the coworkers up. It checks nothing drifts to a
// non-finite position, nobody ends up inside a wall, and every sprite handed to the
// renderer is something it could actually draw.
//
// The point of it is the battle royale work: this is what says the campaign still
// plays. tools/headless.js is the same idea for the battle royale.
'use strict';

const fs = require('fs'), vm = require('vm');
const REPO = require('path').resolve(__dirname, '..');

const texCache = new Map();
const tex = key => {
  if (!texCache.has(key)) {
    // 64x64 of mid grey: enough for castDist and the sprite transforms
    texCache.set(key, { key, w: 64, h: 64, data: new Uint32Array(64 * 64).fill(0xff808080) });
  }
  return texCache.get(key);
};

const played = [];
const said = [];
const ctx = vm.createContext({
  console, Math, Object, Array, String, Number, JSON, Date, isNaN, parseInt, parseFloat,
  Uint8Array, Uint32Array, Int16Array, Float32Array, Set, Map, Infinity, NaN,
  Assets: { img: {}, get: tex },
  Sound: { play: (n, v) => played.push(n), init() {}, ctx: null },
  Music: { setIntensity() {}, setVolume() {} },
  BossMusic: { play() {}, stop() {}, setVolume() {} },
  Settings: { sens: 1, musicVol: 0.6, musicMuted: false },
  Input: {
    keys: {}, down: {}, pad: { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, run: false, crouch: false },
    touch: { lx: 0, ly: 0, fire: false, run: false, crouch: false },
    lastDX: 0, mouseDX: 0, mouseDY: 0,
    pressed() { return false; }, takeMouse() { return [0, 0]; }, takeWheel() { return 0; },
    fireHeld() { return this.wantFire; }, wantFire: false,
  },
  Main: { state: 'play', onDeath() { this.state = 'dead'; }, onWin() { this.won = true; }, won: false },
  Net: {
    on: false, coop: false, host: true, guest: false, slot: 1, remotes: {}, out: { fx: [], snd: [], msgs: [] },
    active() { return []; }, send() {}, toHost() {}, update() {},
    get br() { return false; },
  },
});

for (const f of ['game/js/collide.js', 'game/js/weapons.js', 'game/js/engine.js',
  'game/js/level.js', 'game/js/maps/office.js', 'game/js/maps/yard.js', 'game/js/mode.js',
  'game/js/game.js']) {
  vm.runInContext(fs.readFileSync(REPO + '/' + f, 'utf8'), ctx, { filename: f });
}

const G = vm.runInContext('Game', ctx);
const say = vm.runInContext('Game.say', ctx);
G.say = t => { said.push(t); };

G.start('campaign');
const L = G.L;
console.log(`level: ${L.w}x${L.h}, ${G.enemies.length} coworkers, ${L.pickups.length} pickups, ${L.doors.length} doors`);
console.log(`player at (${G.player.x}, ${G.player.y}) hp ${G.player.hp}`);

// Walk the player around on a wander, firing, for 60 simulated seconds at 60 fps.
// Every door gets opened so the enemies can actually path to us.
const Engine = vm.runInContext('Engine', ctx);
const dt = 1 / 60;
let frames = 0, maxSprites = 0, fired = 0, hurt = 0;
const startHp = G.player.hp;
let a = G.player.a;

for (let i = 0; i < 3600; i++) {
  // steer: turn steadily and push forward, so we sweep the whole office
  a += 0.013;
  G.player.a = a;
  const ca = Math.cos(a), sa = Math.sin(a);
  G.move(G.player, ca * 3.6 * dt, sa * 3.6 * dt);
  G.player.moving = true;
  G.player.fireT -= dt;
  G.player.shotT += dt;
  if (i % 7 === 0 && G.player.ammo.bullets > 0) {
    G.fire(vm.runInContext('WEAPONS.pistol', ctx));
    fired++;
  }
  if (i % 240 === 0) for (const d of L.doors) { d.locked = false; G.openDoor(d, G.player); }
  if (i % 600 === 0) { G.player.hp = 100; G.player.ammo.bullets = 200; }   // stay alive to keep ticking
  G.updateWorld(dt);
  const sp = G.sprites();
  maxSprites = Math.max(maxSprites, sp.length);
  // every sprite must be something the renderer can actually draw
  for (const s of sp) {
    if (!s.tex || !s.tex.data || !(s.h > 0)) throw new Error('bad sprite: ' + JSON.stringify(
      { x: s.x, y: s.y, h: s.h, tex: s.tex && s.tex.key }));
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) throw new Error('sprite at ' + s.x + ',' + s.y);
  }
  if (!Number.isFinite(G.player.x) || !Number.isFinite(G.player.y)) throw new Error('player went non-finite');
  if (G.blocked(Math.floor(G.player.x), Math.floor(G.player.y))) throw new Error(
    `player ended up inside a wall at (${G.player.x.toFixed(2)}, ${G.player.y.toFixed(2)})`);
  frames++;
}

const states = {};
for (const e of G.enemies) states[e.state] = (states[e.state] || 0) + 1;
console.log(`\n${frames} frames ticked clean (${(frames * dt).toFixed(0)}s simulated)`);
console.log(`  shots fired:     ${fired}`);
console.log(`  kills:           ${G.kills}/${G.totalEnemies}`);
console.log(`  coworker states: ${JSON.stringify(states)}`);
console.log(`  peak sprites:    ${maxSprites}`);
console.log(`  sounds played:   ${played.length} (${[...new Set(played)].join(', ')})`);
console.log(`  doors open:      ${L.doors.filter(d => d.open > 0.5).length}/${L.doors.length}`);
console.log(`  pickups taken:   ${L.pickups.filter(p => p.taken).length}/${L.pickups.length}`);
console.log('\nSMOKE TEST PASSED');
