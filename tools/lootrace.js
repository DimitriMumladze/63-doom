// Can two people pick up the same thing?   node tools/lootrace.js
//
// The one invariant loot has: an item goes to exactly one player, however many ask for
// it and however close together. The bots contest loot by accident; this does it on
// purpose -- every client in the match piles onto the same item and asks for it in the
// same tick, and the test fails unless precisely one is told it got it.
//
// Needs the server running. Node 22 or newer.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const collide = require(path.join(ROOT, 'game/js/collide.js'));
Object.assign(global, collide);
Object.assign(global, require(path.join(ROOT, 'game/js/maps/office.js')));
const SPEC = require(path.join(ROOT, 'game/js/maps/block.js')).BLOCK_MAP_SPEC;
const C = collide.buildCollision(SPEC);

const args = process.argv.slice(2);
const hostAt = args.indexOf('--host');
const HOST = hostAt >= 0 ? args[hostAt + 1] : 'localhost:6363';
const N = Math.max(2, Math.min(15, Number(args.find(a => /^\d+$/.test(a))) || 6));

const problems = [];
const note = s => { problems.push(s); console.log('  PROBLEM  ' + s); };

class Racer {
  constructor(i) {
    this.i = i;
    this.name = 'RACE' + (i + 1);
    this.id = 0;
    this.loot = null;
    this.alive = false;
    this.aboard = false;
    this.z = 0;
    this.x = 2; this.y = 2;
    this.won = [];            // items the feed says we got
    this.refused = [];        // items the server said were already gone
    this.q = 0;
    this.ws = new WebSocket(`ws://${HOST}/ws`);
    this.ws.onopen = () => this.send({ t: 'hello', mode: 'br', name: this.name, skin: 'irakli' });
    this.ws.onmessage = ev => this.recv(JSON.parse(ev.data));
    this.ws.onerror = () => {};
    this.ws.onclose = () => { this.closed = true; };
  }

  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  recv(m) {
    switch (m.t) {
      case 'welcome': this.id = m.id; break;       // readied once they are all here
      case 'nobr': note('the server has no battle royale'); break;
      case 'match':
        if (m.spectate) break;
        this.loot = (m.loot || []).map(([i, type, x, y]) => ({ i, type, x, y }));
        this.alive = true;
        this.aboard = !!m.plane;
        this.z = m.plane ? m.plane.alt : 0;
        this.plane = m.plane;
        this.fall = m.fall || { speed: 9, chuteAt: 8, chuteSpeed: 3 };
        break;
      case 'jumped': this.x = m.x; this.y = m.y; this.z = m.z; this.aboard = false; this.falling = true; break;
      case 'you': this.alive = m.alive; break;
      case 'took': if (!m.by) this.refused.push(m.i); break;
      case 'fix': this.x = m.x; this.y = m.y; break;
      case 'S':
        this.state = m.st;
        for (const e of m.e) if (e[0] === 't' && e[2] === this.id) this.won.push(e[1]);
        break;
    }
  }
}

const racers = [];
for (let i = 0; i < N; i++) setTimeout(() => racers.push(new Racer(i)), i * 60);
// all of them, or the match starts with whoever is ready and the rest only watch
setTimeout(() => {
  for (const r of racers) r.send({ t: 'ready', v: 1 });
  console.log(`  all ${racers.length} connected and ready`);
}, N * 60 + 600);

// everyone jumps at once, falls to the same spot, and grabs the same thing
let phase = 'wait', target = null, t = 0, asked = 0, round = 0;
const targets = [];
const results = [];

const loop = setInterval(() => {
  t += 0.05;
  const ready = racers.filter(r => r.loot && !r.closed);
  if (!ready.length) return;

  for (const r of ready) {
    r.q++;
    if (r.aboard) { r.send({ t: 'jump' }); continue; }
    if (r.falling) {
      // straight down onto the chosen item, as fast as the curve allows
      const f = r.fall, alt = r.plane.alt;
      r.fallT = (r.fallT || 0) + 0.05;
      const toChute = (alt - f.chuteAt) / f.speed;
      r.z = r.fallT <= toChute ? alt - r.fallT * f.speed
        : Math.max(0, f.chuteAt - (r.fallT - toChute) * f.chuteSpeed);
      if (target) {
        // 7 or 4.5 cells a second, the steering the server allows
        const sp = (r.z > f.chuteAt ? 7 : 4.5) * 0.05;
        const dx = target.x - r.x, dy = target.y - r.y, d = Math.hypot(dx, dy);
        if (d > 0.01) { r.x += dx / d * Math.min(sp, d); r.y += dy / d * Math.min(sp, d); }
      }
      if (r.z <= 0) { r.falling = false; r.z = 0; }
    } else if (target) {
      // on foot, straight at it, one axis at a time so walls slide the way the
      // game's own movement does
      const sp = 3.6 * 0.05;
      const dx = target.x - r.x, dy = target.y - r.y, d = Math.hypot(dx, dy);
      if (d > 0.05) {
        const nx = r.x + dx / d * Math.min(sp, d), ny = r.y + dy / d * Math.min(sp, d);
        if (collide.freeCircle(C, nx, r.y, 0.24)) r.x = nx;
        if (collide.freeCircle(C, r.x, ny, 0.24)) r.y = ny;
      }
    }
    r.send({ t: 'i', q: r.q, x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      a: 0, z: Math.round(r.z * 100) / 100, c: 0, m: 1, w: 'pistol' });
  }

  // Once they are down, the nearest thing to where they landed -- chosen then, not
  // before, because the plane puts them wherever its path runs and the fall only buys
  // about twenty-four cells of steering.
  if (!target && ready.length && ready.every(r => !r.aboard && !r.falling && r.x !== undefined)) {
    const L = ready[0].loot;
    const cx = ready.reduce((n, r) => n + r.x, 0) / ready.length;
    const cy = ready.reduce((n, r) => n + r.y, 0) / ready.length;
    let best = null, bd = Infinity;
    for (const it of L) {
      if (targets.includes(it.i)) continue;
      const d = (it.x - cx) ** 2 + (it.y - cy) ** 2;
      if (d >= bd) continue;
      if (!collide.freeCircle(C, it.x, it.y, 0.24)) continue;
      // these racers walk straight at it with no path-finding, so it has to be in
      // plain sight or they get stuck on a corner and the race never happens
      if (!collide.canSee(C, cx, cy, it.x, it.y)) continue;
      bd = d; best = it;
    }
    if (best) {
      target = best;
      targets.push(target.i);
      console.log(`  round ${round + 1}: ${ready.length} racers onto item ${target.i} ` +
        `(${target.type}) at (${target.x.toFixed(1)}, ${target.y.toFixed(1)}), ` +
        `${Math.sqrt(bd).toFixed(0)} cells away`);
    }
  }

  // once everyone is down and standing on it, all ask at once
  if (target && ready.every(r => !r.aboard && !r.falling)) {
    const onIt = ready.filter(r => Math.hypot(r.x - target.x, r.y - target.y) < 0.5);
    if (onIt.length >= 2 && !asked) {
      for (const r of onIt) r.send({ t: 'take', i: target.i });
      asked = onIt.length;
      console.log(`  ${asked} of them asked for it in the same tick`);
      setTimeout(() => {
        const winners = ready.filter(r => r.won.includes(target.i));
        const refused = ready.filter(r => r.refused.includes(target.i));
        console.log(`  -> ${winners.length} got it (${winners.map(r => r.name).join(', ') || 'nobody'}),` +
          ` ${refused.length} told it was gone`);
        if (winners.length !== 1) {
          note(`${winners.length} players got item ${target.i}; it must be exactly 1`);
        }
        results.push(winners.length);
        finish();
      }, 1200);
    }
  }
  if (t > 60) finish();
}, 50);

function finish() {
  clearInterval(loop);
  console.log('');
  if (!results.length) note('no race ever happened -- nobody reached the item together');
  console.log(problems.length ? `\n${problems.length} problem(s)`
    : '\nan item goes to exactly one player');
  for (const r of racers) try { r.ws.close(); } catch (e) {}
  setTimeout(() => process.exit(problems.length ? 1 : 0), 300);
}

console.log(`${N} racers -> ws://${HOST}/ws`);
