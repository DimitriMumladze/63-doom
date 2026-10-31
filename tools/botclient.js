// Fill the battle royale with bots.   node tools/botclient.js [n] [--host h:p] [--quiet]
//
// You will not get fifteen colleagues to sit through a debugging session, and a
// fifteen-player match is exactly where the server either works or does not. These
// bots speak the real protocol over a real socket: they join, ready up, wander the
// real collision grid, shoot at whoever they can actually see, and die.
//
// Needs Node 22 or newer (for the built-in WebSocket) and the server running.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const collide = require(path.join(ROOT, 'game/js/collide.js'));
const { WEAPONS } = require(path.join(ROOT, 'game/js/weapons.js'));
Object.assign(global, collide);
// whichever map the server is on (MAP=yard for the small one), since the bots walk
// its collision grid for real
Object.assign(global, require(path.join(ROOT, 'game/js/maps/office.js')));
const MAPNAME = process.env.MAP === 'yard' ? 'yard' : 'block';
const SPEC = MAPNAME === 'yard'
  ? require(path.join(ROOT, 'game/js/maps/yard.js')).YARD_MAP_SPEC
  : require(path.join(ROOT, 'game/js/maps/block.js')).BLOCK_MAP_SPEC;
const C = collide.buildCollision(SPEC);

const args = process.argv.slice(2);
const N = Math.max(1, Math.min(15, Number(args.find(a => /^\d+$/.test(a))) || 15));
const hostArg = args.indexOf('--host');
const HOST = hostArg >= 0 ? args[hostArg + 1] : 'localhost:6363';
const QUIET = args.includes('--quiet');

const NAMES = ['DIMITRI', 'NIKOLOZ', 'IRAKLI', 'LASHA', 'SANDRO', 'GIORGI', 'DAVIT', 'ANA',
  'NINO', 'TAMAR', 'LEVAN', 'ZURAB', 'MARIAM', 'VAKHO', 'ELENE'];
const SKINS = ['brute', 'tank', 'irakli', 'beard', 'rider', 'hood', 'specs', 'sandro', 'agamemnov'];

const PLAYER_R = 0.24;
const HZ = 20;
const say = (...a) => { if (!QUIET) console.log(...a); };

let finished = false;
const bots = [];

class Bot {
  constructor(i) {
    this.i = i;
    this.name = NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : '');
    this.skin = SKINS[i % SKINS.length];
    this.id = 0;
    this.alive = false;
    this.x = 2; this.y = 2; this.a = Math.random() * 6.28;
    this.hp = 100; this.kills = 0; this.place = 0;
    this.others = new Map();          // id -> {x, y, hp, dead}
    this.q = 0;
    this.shotAt = 0;
    this.fixes = 0;
    this.turn = (Math.random() - 0.5) * 2;
    this.aboard = false; this.falling = false; this.z = 0; this.planeT = 0;
    this.aimX = 0; this.aimY = 0; this.landed = false;
    this.ws = new WebSocket(`ws://${HOST}/ws`);
    this.ws.onopen = () => this.send({ t: 'hello', mode: 'br', name: this.name, skin: this.skin });
    this.ws.onmessage = ev => this.recv(JSON.parse(ev.data));
    this.ws.onerror = () => {};
    this.ws.onclose = () => { this.closed = true; };
  }

  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  recv(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.slot = m.slot;
        say(`  ${this.name} is in as P${m.slot} (${m.skin})`);
        this.send({ t: 'ready', v: 1 });
        break;
      case 'full': console.log(`  ${this.name} was turned away: full`); break;
      case 'nobr': console.log('  server has no battle royale (missing shared rules)'); break;
      case 'blobby':
        if (m.state !== this.lastState) {
          this.lastState = m.state;
          if (this.i === 0) say(`[lobby] ${m.state}, ${m.roster.length} in, ${m.roster.filter(r => r.ready).length} ready`);
        }
        break;
      case 'match':
        if (m.spectate) { say(`  ${this.name} arrived late, watching`); break; }
        this.x = m.spawn.x; this.y = m.spawn.y; this.a = m.spawn.a;
        this.alive = true; this.hp = 100; this.frozen = 0;
        this.weapon = m.kit.weapon;
        this.plane = m.plane || null;
        this.fall = m.fall || { speed: 9, chuteAt: 8, chuteSpeed: 3 };
        this.aboard = !!m.plane;
        this.z = m.plane ? m.plane.alt : 0;
        // each bot picks its own moment, so fifteen of them land spread out
        this.jumpAt = 0.4 + Math.random() * 7.5;
        this.planeT = m.plane ? m.plane.t : 0;
        if (this.i === 0) say(`[match] out over "${m.map}", seed ${m.seed}`);
        break;
      case 'jumped':
        this.x = m.x; this.y = m.y; this.z = m.z;
        this.aboard = false; this.falling = true; this.fallT = 0;
        break;
      case 'you':
        this.hp = m.hp; this.alive = m.alive; this.place = m.place; this.kills = m.kills;
        break;
      case 'fix': this.x = m.x; this.y = m.y; this.fixes++; break;
      case 'S': this.snap(m); break;
      case 'end': this.end(m); break;
    }
  }

  snap(m) {
    this.serverState = m.st;
    this.aliveCount = m.alive;
    if (m.r) { this.ring = { cx: m.r[0], cy: m.r[1], r: m.r[2], dps: m.r[9] }; }
    if (m.pl) this.planeT = m.pl[0];
    for (const [id, x, y, a, hp, flags] of m.p) {
      if (id === this.id) continue;
      this.others.set(id, { x, y, hp, dead: !!(flags & 1), frozen: !!(flags & 8) });
    }
    for (const e of m.e) {
      if (e[0] === 'k' && this.i === 0) {
        say(`  [kill] ${e[1] || 'the office'} -> ${e[2]} with ${e[3] || 'nothing'} (#${e[4]})`);
        this.kills2 = (this.kills2 || 0) + 1;
      } else if (e[0] === 'm' && this.i === 0) say(`  [say] ${e[1]}`);
    }
  }

  end(m) {
    if (this.i !== 0 || finished) return;
    finished = true;
    const win = m.board.find(b => b.id === m.winner);
    console.log('\n--- match over ---');
    for (const b of m.board) console.log(`  #${String(b.place).padStart(2)}  ${b.name.padEnd(10)} ${b.kills} kills`);
    console.log(win ? `  winner: ${win.name}` : '  nobody left standing');
  }

  // where the plane is now
  planeAt(t) {
    const g = this.plane;
    const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
    const dx = (g.x1 - g.x0) / len, dy = (g.y1 - g.y0) / len;
    const d = Math.max(0, t) * g.speed;
    return { x: g.x0 + dx * d, y: g.y0 + dy * d };
  }

  fallHeight(secs) {
    const f = this.fall, alt = this.plane ? this.plane.alt : 24;
    const toChute = (alt - f.chuteAt) / f.speed;
    if (secs <= toChute) return alt - secs * f.speed;
    return Math.max(0, f.chuteAt - (secs - toChute) * f.chuteSpeed);
  }

  // riding out and coming down
  stepDrop(dt) {
    this.planeT += dt;
    if (this.aboard) {
      const at = this.planeAt(this.planeT);
      this.x = at.x; this.y = at.y;
      if (this.planeT > this.jumpAt) this.send({ t: 'jump' });
      this.send({ t: 'i', q: this.q, x: r2(this.x), y: r2(this.y), a: r2(this.a),
        z: r2(this.z), c: 0, m: 0, w: this.weapon || 'shotgun' });
      return;
    }
    this.fallT += dt;
    this.z = this.fallHeight(this.fallT);
    // steer towards somewhere on the map, no walls to worry about up here
    if (!this.aimX) {
      this.aimX = 8 + Math.random() * (C.w - 16);
      this.aimY = 8 + Math.random() * (C.h - 16);
    }
    const sp = (this.z > this.fall.chuteAt ? 7 : 4.5) * dt;
    const dx = this.aimX - this.x, dy = this.aimY - this.y, d = Math.hypot(dx, dy);
    if (d > 0.1) { this.x += dx / d * Math.min(sp, d); this.y += dy / d * Math.min(sp, d); }
    this.send({ t: 'i', q: this.q, x: r2(this.x), y: r2(this.y), a: r2(this.a),
      z: r2(this.z), c: 0, m: 1, w: this.weapon || 'shotgun' });
    if (this.z <= 0) { this.falling = false; this.landed = true; }
  }

  // move, and shoot at anyone in sight
  step(dt) {
    if (this.closed) return;
    this.q++;
    if (this.alive && (this.aboard || this.falling)) { this.stepDrop(dt); return; }
    if (this.alive) {
      if (this.frozen > 0) this.frozen -= dt;
      else {
        // wander: drift the heading, back off and turn when a wall is in the way
        this.turn += (Math.random() - 0.5) * 0.6;
        this.turn = Math.max(-2, Math.min(2, this.turn * 0.92));
        this.a += this.turn * dt;
        // unless the gas is coming, in which case make for the middle of the ring
        const g = this.ring;
        if (g) {
          const d = Math.hypot(this.x - g.cx, this.y - g.cy);
          if (d > g.r * 0.75) {
            const want = Math.atan2(g.cy - this.y, g.cx - this.x);
            let turn = want - this.a;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            this.a += Math.max(-3 * dt, Math.min(3 * dt, turn * 4 * dt));
            this.turn *= 0.5;
          }
        }
        const speed = 3.6;
        const nx = this.x + Math.cos(this.a) * speed * dt;
        const ny = this.y + Math.sin(this.a) * speed * dt;
        if (collide.freeCircle(C, nx, this.y, PLAYER_R)) this.x = nx; else this.turn += 1.6;
        if (collide.freeCircle(C, this.x, ny, PLAYER_R)) this.y = ny; else this.turn += 1.6;
      }
      this.send({ t: 'i', q: this.q, x: r2(this.x), y: r2(this.y), a: r2(this.a), z: 0, c: 0,
        m: 1, w: this.weapon || 'shotgun' });
      this.tryShoot();
    } else if (this.q % 40 === 0) {
      this.send({ t: 'i', q: this.q, x: r2(this.x), y: r2(this.y), a: r2(this.a), z: 0, c: 0, m: 0 });
    }
  }

  tryShoot() {
    if (this.frozen > 0) return;
    const w = WEAPONS[this.weapon || 'shotgun'];
    const now = Date.now();
    if (now - this.shotAt < w.cool * 1000 * 1.15) return;      // a little slower than allowed
    // the nearest living player we can see, within the gun's reach
    let best = null, bestD = 16;
    for (const [id, o] of this.others) {
      if (o.dead || o.frozen) continue;
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d >= bestD) continue;
      if (!collide.canSee(C, this.x, this.y, o.x, o.y)) continue;
      best = id; bestD = d;
    }
    this.shotAt = now;
    const gun = this.weapon || 'shotgun';
    if (!best) { this.send({ t: 'shot', w: gun, v: [] }); return; }
    const o = this.others.get(best);
    this.a = Math.atan2(o.y - this.y, o.x - this.x);
    // bots are poor shots: a couple of pellets, not the whole barrel
    const n = 1 + Math.floor(Math.random() * Math.min(3, w.pellets || 1));
    this.send({ t: 'shot', w: gun, v: [[best, n]] });
  }
}

const r2 = v => Math.round(v * 100) / 100;

console.log(`${N} bots -> ws://${HOST}/ws  (map "${MAPNAME}", ${C.w}x${C.h})`);
for (let i = 0; i < N; i++) setTimeout(() => bots.push(new Bot(i)), i * 60);

const started = Date.now();
const loop = setInterval(() => {
  for (const b of bots) b.step(1 / HZ);
  if (finished || Date.now() - started > 6 * 60 * 1000) {
    clearInterval(loop);
    const fixes = bots.reduce((n, b) => n + b.fixes, 0);
    console.log(`\n  ${bots.length} bots, ${fixes} position corrections from the server`);
    for (const b of bots) try { b.ws.close(); } catch (e) {}
    setTimeout(() => process.exit(finished ? 0 : 1), 300);
  }
}, 1000 / HZ);
