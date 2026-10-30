// Play the real game with no browser.   node tools/headless.js [n] [--host h:p] [--seconds s]
//
// Loads the actual engine.js / level.js / mode.js / game.js / net.js -- not a
// stand-in -- with the handful of browser things they touch stubbed out, connects
// each one to a real server over a real socket, and plays a real match. Everything
// except drawing is exercised: the mode seam, the protocol, collision, firing,
// hit reporting, the ring, death, spectating and the scoreboard.
//
// tools/botclient.js tests the server by speaking its protocol. This tests the
// client by being one. Needs Node 22 or newer.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');

const args = process.argv.slice(2);
const N = Math.max(1, Math.min(15, Number(args.find(a => /^\d+$/.test(a))) || 4));
const hostAt = args.indexOf('--host');
const HOST = hostAt >= 0 ? args[hostAt + 1] : 'localhost:6363';
const secAt = args.indexOf('--seconds');
const SECONDS = secAt >= 0 ? Number(args[secAt + 1]) : 240;

const MODULES = ['assets.js', 'collide.js', 'weapons.js', 'engine.js', 'level.js',
  'maps/office.js', 'maps/yard.js', 'mode.js', 'game.js', 'net.js'];

const problems = [];
const seenProblem = new Set();
// the same fault every frame is one fault, not twelve thousand
const note = s => {
  problems.push(s);
  if (seenProblem.has(s)) return;
  seenProblem.add(s);
  console.log('  PROBLEM  ' + s);
};

// one shared fake texture: the renderer is never run, but Assets.get must not throw
const TEX = { w: 64, h: 64, data: new Uint32Array(64 * 64).fill(0xff808080), img: {} };

function makeClient(i) {
  const log = [];
  const sandbox = {
    console: { log: (...a) => log.push(a.join(' ')), warn: () => {}, error: (...a) => note('console.error: ' + a.join(' ')) },
    Math, Object, Array, String, Number, JSON, Date, Set, Map, Infinity, NaN,
    isNaN, parseInt, parseFloat, isFinite,
    Uint8Array, Uint32Array, Int16Array, Int32Array, Float32Array,
    WebSocket, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => Date.now() },
    module: undefined,
    // the browser things the game actually touches
    window: { EMBED: null },
    location: { search: '', hostname: '', protocol: 'http:' },
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx() }),
      getElementById: () => null,
      addEventListener: () => {},
      fonts: null,
    },
    navigator: { userAgent: 'node', getGamepads: () => [] },
    Sound: { play: () => {}, init: () => {}, ctx: null },
    Music: { setIntensity: () => {}, setVolume: () => {}, duck: () => {} },
    BossMusic: { play: () => {}, stop: () => {}, setVolume: () => {} },
    Settings: { sens: 1, musicVol: 0, musicMuted: true, playerName: '', playerSkin: 'irakli', save: () => {} },
    Hud: { drawBar: () => {}, drawView: () => {}, drawBubbles: () => {} },
    Input: {
      keys: {}, down: {}, mode: 'mouse', lastDX: 0, padBlocked: false,
      pad: { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, run: false, crouch: false },
      touch: { lx: 0, ly: 0, fire: false, run: false, crouch: false },
      pressed: () => false, takeMouse: () => [0, 0], takeWheel: () => 0, fireHeld: () => false,
    },
  };
  sandbox.window.EMBED = null;
  // The game's own objects are declared with const, which in a script is a lexical
  // binding and not a property of the global object -- so the sandbox cannot see
  // them. Pull them out after loading and let Main reach them through here.
  const refs = {};
  // a tiny Main, standing in for main.js's screens
  sandbox.Main = {
    state: 'title', joining: false, joiningBr: false, deaths: 0, matches: 0, ends: 0,
    setState(s) { this.state = s; },
    onDeath() { this.setState('dead'); },
    onBrDeath() { this.deaths++; this.setState('dead'); },
    onBrMatch() {
      this.matches++;
      refs.Game.start('br');
      this.setState(refs.BR.spectating ? 'spectate' : 'play');
    },
    onBrEnd() { this.ends++; this.setState('results'); },
    lock() {}, fullscreen() {}, onWin() {}, restart() {},
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('var Assets = { img: {}, get: () => TEX };', ctx);
  ctx.TEX = TEX;
  for (const f of MODULES) {
    if (f === 'assets.js') continue;            // replaced by the stub above
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  }
  // assets.js only exists for SKINS, which main.js's skin picker reads
  vm.runInContext("var SKINS = ['brute','tank','irakli','beard','rider','hood','specs','sandro','agamemnov'];", ctx);
  refs.Game = vm.runInContext('Game', ctx);
  refs.BR = vm.runInContext('BR', ctx);
  refs.Net = vm.runInContext('Net', ctx);
  refs.WEAPONS = vm.runInContext('WEAPONS', ctx);
  return { i, ctx, sandbox, log, seen: {}, refs };
}

function stubCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, k) => (k === 'createImageData'
      ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
      : (k === 'canvas' ? { width: 0, height: 0 } : noop)),
    set: () => true,
  });
}

// ----------------------------------------------------------------------
const clients = [];
for (let i = 0; i < N; i++) clients.push(makeClient(i));

console.log(`${N} headless clients -> ws://${HOST}/ws`);

for (const c of clients) {
  const { ctx, sandbox } = c;
  const { Net, BR, Game } = c.refs;
  c.Net = Net; c.BR = BR; c.Game = Game;
  // connect the way net.js does, but with the address we were given
  Net.serverUrl = () => `ws://${HOST}/ws`;
  Net.connect();
  // ready up as soon as we are in the lobby, and pick a name
  c.tick = 0;
  c.name = 'HL' + (c.i + 1);
}

let elapsed = 0;
const DT = 1 / 20;
const loop = setInterval(() => {
  elapsed += DT;
  for (const c of clients) {
    const { Net, BR, Game, sandbox } = c;
    c.tick++;
    try {
      // --- the title screen: pick BATTLE ROYALE as soon as the server offers it ---
      if (sandbox.Main.state === 'title' && !Net.on && !sandbox.Main.joiningBr
          && Net.lobby && Net.lobby.br) {
        sandbox.Main.joiningBr = true;
        Net.joinBr(c.name, 'irakli');
      }
      if (sandbox.Main.joiningBr && Net.br) {
        sandbox.Main.joiningBr = false;
        Game.start('br');
        sandbox.Main.setState('lobby');
        c.seen.lobby = true;
      }
      // --- the lobby: say we are ready ---
      if (sandbox.Main.state === 'lobby' && !BR.ready && c.tick % 10 === 0) {
        Net.send({ t: 'ready', v: 1 });
        BR.ready = true;
      }
      // --- playing: wander and shoot, through the real Game code ---
      if (sandbox.Main.state === 'play' && Game.player && !Game.player.dead) {
        c.seen.play = true;
        const p = Game.player;
        c.turn = (c.turn || 0) * 0.92 + (Math.random() - 0.5) * 0.4;
        // head for the middle of the ring if we are near its edge
        const g = BR.ring;
        if (g && Math.hypot(p.x - g.cx, p.y - g.cy) > g.r * 0.7) {
          let d = Math.atan2(g.cy - p.y, g.cx - p.x) - p.a;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          p.a += Math.max(-0.15, Math.min(0.15, d * 0.3));
        } else p.a += c.turn * DT;
        if (BR.freeze > 0) BR.freeze -= DT;
        else {
          const sp = 3.6 * DT;
          Game.move(p, Math.cos(p.a) * sp, Math.sin(p.a) * sp);
          p.moving = true;
        }
        // fire through the real path: Game.fire -> hitscan -> {t:'shot'}
        p.fireT -= DT; p.shotT += DT;
        const w = c.refs.WEAPONS[p.weapon];
        if (p.fireT <= 0 && BR.freeze <= 0 && p.ammo[w.ammo] >= (w.use || 1)) {
          // only bother when someone is actually in view, like a person would
          const target = Net.active().find(r => !r.dead
            && Math.hypot(r.x - p.x, r.y - p.y) < 14 && Game.sees(p.x, p.y, r.x, r.y));
          if (target) {
            p.a = Math.atan2(target.y - p.y, target.x - p.x);
            Game.fire(w);
            c.seen.fired = true;
          }
        }
        Game.update(DT);
      } else if (Game.L) {
        Game.updateWorld(DT);
      }
      if (sandbox.Main.state === 'dead') {
        c.seen.dead = true;
        // main.js moves you on to watching someone after a few seconds
        c.deadFor = (c.deadFor || 0) + DT;
        if (c.deadFor > 3) sandbox.Main.setState('spectate');
      }
      if (sandbox.Main.state === 'spectate') {
        c.seen.spectate = true;
        if (c.tick % 60 === 0) BR.nextSpec(1);
        const t = BR.specTarget();
        if (t && (!Number.isFinite(t.x) || !Number.isFinite(t.y))) {
          note(`client ${c.i} is watching someone at (${t.x}, ${t.y})`);
        }
      }
      if (sandbox.Main.state === 'results') c.seen.results = true;
      Net.update(DT);

      // --- things that must never happen ---
      const p = Game.player;
      if (p) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          note(`client ${c.i} went to (${p.x}, ${p.y})`);
          p.x = 4; p.y = 4;
        }
        if (p.hp > 100 || p.hp < 0) note(`client ${c.i} has ${p.hp} health`);
      }
    } catch (e) {
      note(`client ${c.i} threw in ${sandbox.Main.state}: ${e.message}`);
      if (problems.length < 3) console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    }
  }

  const done = clients.every(c => c.seen.results);
  if (done || elapsed > SECONDS) {
    clearInterval(loop);
    report(done);
  }
}, 1000 / 20);

function report(done) {
  const c0 = clients[0];
  console.log('');
  for (const c of clients) {
    const s = c.seen;
    console.log(`  client ${String(c.i).padStart(2)}  ${c.BR.myName || '?'}  ` +
      `lobby:${s.lobby ? 'y' : '-'} play:${s.play ? 'y' : '-'} fired:${s.fired ? 'y' : '-'} ` +
      `dead:${s.dead ? 'y' : '-'} spec:${s.spectate ? 'y' : '-'} results:${s.results ? 'y' : '-'}  ` +
      `#${c.BR.place || '-'} ${c.BR.kills} kills  feed:${c.BR.feed.length}`);
  }
  const board = c0.BR.board;
  if (board) {
    console.log(`\n  scoreboard of ${board.length}: ` +
      board.slice(0, 5).map(b => `#${b.place} ${b.name}(${b.kills})`).join('  '));
  } else note('no scoreboard arrived');
  const ring = c0.BR.ring;
  console.log(ring ? `  ring ended at (${ring.cx.toFixed(1)}, ${ring.cy.toFixed(1)}) r=${ring.r.toFixed(1)}` +
    ` phase ${ring.phase + 1}, ${ring.dps}/s outside` : '  no ring state');
  for (const want of ['lobby', 'play', 'fired']) {
    if (!clients.some(c => c.seen[want])) note(`no client ever reached "${want}"`);
  }
  if (!clients.some(c => c.seen.dead)) note('nobody ever died');
  if (!clients.some(c => c.seen.results)) note('the match never finished');
  console.log(problems.length
    ? `\n${seenProblem.size} distinct problem(s), ${problems.length} occurrence(s)`
    : '\nheadless clients played a clean match');
  for (const c of clients) try { c.Net.ws.close(); } catch (e) {}
  setTimeout(() => process.exit(problems.length ? 1 : 0), 300);
}
