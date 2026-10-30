// Server for 63: Office Hell. No dependencies: `node server.js` (Node 16 or newer).
// The game page connects to it on port 6363 of the computer it was loaded from (see Net in the game):
// on the computer that serves the page on the internet, or on a LAN, where this also serves the page
// itself at http://<this computer's IP>:6363/.
//
// It runs two kinds of game, and a page says which when it joins:
//
//   co-op ({t:'join'})          -- unchanged. The first player in is the host and runs the world in
//                                  their browser; this only passes messages on.
//   battle royale ({t:'hello'}) -- this process runs the match: who is alive, who shot whom, where
//                                  the ring is, who won. The players' browsers draw it and report
//                                  where they are, and nothing else is taken on trust.
//
// The battle royale needs to know the shape of the map, so it loads the same collide.js, weapons.js
// and map the game does -- one copy of "is that solid" and "how fast does a shotgun fire", so the
// server and the players can never disagree. Those files have to sit next to this one (deploy.sh
// puts them there); without them battle royale is simply not offered and co-op works as before.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 6363;
const ROOT = __dirname;
const GAME = path.join(ROOT, '63_ Office Hell.html');
const COOP_MAX = 8;
const MAX_MESSAGE = 1 << 20;       // a snapshot is a few KB; anything this big is not from the game

// ----------------------------------------------------------------------
// the shared game rules, if they were deployed alongside
// ----------------------------------------------------------------------
let Rules = null;
try {
  const collide = require('./game/js/collide.js');
  const weapons = require('./game/js/weapons.js');
  // A map file is data written for the browser, where every script shares one scope
  // and collide.js's grid helpers are simply there. Put them where it expects them
  // rather than making the map files carry Node plumbing around.
  Object.assign(global, collide);
  const map = require('./game/js/maps/yard.js');
  Rules = { ...collide, ...weapons, spec: map.YARD_MAP_SPEC };
  Rules.C = Rules.buildCollision(Rules.spec);
  Rules.wnames = Object.keys(Rules.WEAPONS);
} catch (e) {
  console.log('battle royale off: ' + e.message);
  console.log('  (it needs game/js/collide.js, game/js/weapons.js and game/js/maps/yard.js next to this file)');
}

// ----------------------------------------------------------------------
// http: the game page, and the assets the page does not carry itself
// ----------------------------------------------------------------------
const TYPES = { '.mp3': 'audio/mpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.js': 'text/javascript',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/index.html') {
    // next to the game file this serves it too (LAN play); on a web server the page comes from there
    if (!fs.existsSync(GAME)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`63: Office Hell server. ${clients.size} in co-op, ${BR.players.size} in the battle royale.\n`);
      return;
    }
    log(`game page sent to ${addrOf(req.socket)}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(GAME).pipe(res);
    return;
  }
  // the boss music, and anything else the build links rather than embeds
  if (url.startsWith('/assets/') && !url.includes('..')) {
    const file = path.join(ROOT, url.slice(1));
    const type = TYPES[path.extname(file)];
    if (type && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end('not found');
});

// ----------------------------------------------------------------------
// conns: every open page. clients: the ones in co-op, id -> conn (the oldest is the host).
// BR.players: the ones in the battle royale.
// ----------------------------------------------------------------------
const conns = new Set();
const clients = new Map();
let nextId = 1, hostId = 0;

const addrOf = sock => String(sock.remoteAddress).replace(/^::ffff:/, '');

function freeSlot(used) {
  for (let s = 1; ; s++) if (!used.has(s)) return s;
}

function accept(sock) {
  const c = { id: 0, slot: 0, sock, seen: Date.now(), addr: addrOf(sock), room: '' };
  conns.add(c);
  send(c, lobby());

  let buf = Buffer.alloc(0), parts = [], size = 0;
  sock.on('data', chunk => {
    c.seen = Date.now();
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const f = parse(buf);
      if (!f) break;
      if (f.size > MAX_MESSAGE) { sock.destroy(); return; }
      if (f.data === null) break;
      buf = buf.subarray(f.size);
      if (f.op === 8) { sock.end(frame(Buffer.alloc(0), 8)); return; }
      if (f.op === 9) { sock.write(frame(f.data, 10)); continue; }
      if (f.op === 10) continue;
      parts.push(f.data);
      size += f.data.length;
      if (size > MAX_MESSAGE) { sock.destroy(); return; }
      if (!f.fin) continue;
      const text = Buffer.concat(parts).toString('utf8');
      parts = []; size = 0;
      receive(c, text);
    }
  });
  sock.on('close', () => leave(c));
  sock.on('error', () => leave(c));
}

function receive(c, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (!c.room) {
    if (m.t === 'join') joinCoop(c);
    else if (m.t === 'hello' && m.mode === 'br') BR.join(c, m);
    return;
  }
  if (c.room === 'br') BR.recv(c, m);
  else relay(c, m);
}

function leave(c) {
  if (!conns.delete(c)) return;
  if (c.room === 'br') { BR.leave(c); return; }
  if (!c.id) return;
  clients.delete(c.id);
  broadcast({ t: 'leave', id: c.id });
  if (hostId === c.id) {
    const next = clients.values().next().value;
    hostId = next ? next.id : 0;
    if (next) broadcast({ t: 'host', id: hostId });
  }
  log(`P${c.slot} left co-op, ${clients.size} playing`);
  updateLobby();
}

// ----------------------------------------------------------------------
// co-op: a relay, exactly as before
// ----------------------------------------------------------------------
function joinCoop(c) {
  if (clients.size >= COOP_MAX) { send(c, { t: 'full' }); return; }
  c.room = 'coop';
  c.id = nextId++;
  c.slot = freeSlot(new Set([...clients.values()].map(o => o.slot)));
  const others = [...clients.values()];
  clients.set(c.id, c);
  if (!hostId) hostId = c.id;
  send(c, { t: 'welcome', id: c.id, slot: c.slot, host: hostId, players: others.map(o => ({ id: o.id, slot: o.slot })) });
  broadcast({ t: 'join', id: c.id, slot: c.slot }, c.id);
  log(`P${c.slot} joined co-op from ${c.addr}${c.id === hostId ? ' (host)' : ''}, ${clients.size} playing`);
  updateLobby();
}

// `to` = one player, otherwise all the others; the server stamps who sent it
function relay(c, m) {
  m.from = c.id;
  const to = m.to;
  delete m.to;
  if (to) { const d = clients.get(to); if (d) send(d, m); } else broadcast(m, c.id);
}

function broadcast(m, except) {
  const data = frame(Buffer.from(JSON.stringify(m)), 1);
  for (const c of clients.values()) if (c.id !== except && !c.sock.destroyed) c.sock.write(data);
}

// what the title screen shows before joining either game
function lobby() {
  return { t: 'lobby', players: clients.size, max: COOP_MAX,
    br: Rules ? { players: BR.players.size, max: BR.MAX, state: BR.state } : null };
}
function updateLobby() { const m = lobby(); for (const c of conns) if (!c.room) send(c, m); }

function send(c, m) { if (!c.sock.destroyed) c.sock.write(frame(Buffer.from(JSON.stringify(m)), 1)); }

// ----------------------------------------------------------------------
// battle royale: this process is the referee
// ----------------------------------------------------------------------
const HZ = 20;
const PLAYER_R = 0.24;
const RUN_SPEED = 5.2;             // see Game.updatePlayer; the fastest anyone can legitimately go
const DROP_FREEZE = 2.5;           // seconds of "the lift doors open": can't move, can't be shot
const COUNTDOWN = 20;
const OVER_HOLD = 20;              // the results screen, before everyone goes back to the lobby
const LOBBY_WAIT = 90;             // start anyway after this long with enough people

// how far each gun can hurt anyone, and where its damage starts dropping off
const RANGE = { pistol: [40, 40], shotgun: [16, 6], dbshotgun: [14, 5], chaingun: [40, 40],
  rifle: [40, 40], rocketl: [60, 60], plasmagun: [40, 40] };

// The ring: the building's fire-suppression system, venting the yard a section at a
// time. Radii are fractions of half the map's smaller side, so the same schedule
// works on the 48x48 test yard and on the full block. `wait` is how long it sits
// still before the next squeeze, `shrink` how long that squeeze takes, `dps` what
// being outside it costs per second once it has moved.
const RING_PHASES = [
  { wait: 30, shrink: 0, r: 1.00, dps: 0 },
  { wait: 25, shrink: 20, r: 0.62, dps: 1 },
  { wait: 20, shrink: 18, r: 0.42, dps: 2 },
  { wait: 18, shrink: 16, r: 0.27, dps: 4 },
  { wait: 15, shrink: 14, r: 0.16, dps: 7 },
  { wait: 12, shrink: 12, r: 0.09, dps: 11 },
  { wait: 0, shrink: 20, r: 0.00, dps: 18 },
];
const RING_TICK = 0.5;             // damage is applied in half-second bites, not per frame

// What everyone starts with until loot lands. The ring comes first; see the plan.
const START_KIT = { weapon: 'shotgun', has: ['pistol', 'shotgun'],
  ammo: { bullets: 60, shells: 24, rockets: 0, cells: 0 } };

const BR = {
  MAX: 15, MIN: 2,
  state: 'lobby', t: 0, tick: 0, match: 0, seed: 1, started: 0,
  sent: 0, tickMs: 0, tickPeak: 0, reportT: 0,
  players: new Map(),              // id -> player record (its .conn is the socket)
  ring: null,                      // see startRing()
  ringT: 0,
  feed: [],                        // events to put in the next snapshot
  dead: [],                        // finishing order, worst first

  // ---------------- joining and leaving ----------------
  join(c, m) {
    if (!Rules) { send(c, { t: 'nobr' }); return; }
    if (this.players.size >= this.MAX) { send(c, { t: 'full' }); return; }
    c.room = 'br';
    c.id = nextId++;
    c.slot = freeSlot(new Set([...this.players.values()].map(p => p.slot)));
    const p = {
      id: c.id, slot: c.slot, conn: c, name: cleanName(m.name, c.slot),
      skin: this.freeSkin(cleanSkin(m.skin)),
      ready: false,
      x: 0, y: 0, a: 0, z: 0, crouch: 0, moving: false, weapon: START_KIT.weapon, shots: 0,
      hp: 100, armor: 0, alive: false, kills: 0, place: 0, frozen: 0,
      hist: [], lastShot: {}, at: Date.now(), rtt: 0, qAt: 0, spec: 0, late: false,
    };
    this.players.set(p.id, p);
    send(c, { t: 'welcome', id: p.id, slot: p.slot, mode: 'br', max: this.MAX, name: p.name, skin: p.skin });
    // mid-match arrivals watch until the next one
    if (this.state === 'live' || this.state === 'over') {
      p.late = true;
      send(c, this.matchMsg(p));
    }
    log(`${p.name} (P${p.slot}) joined the battle royale from ${c.addr}, ${this.players.size} in`);
    this.say(`${p.name} clocked in.`);
    this.pushLobby();
    updateLobby();
  },

  leave(c) {
    const p = this.players.get(c.id);
    if (!p) return;
    this.players.delete(c.id);
    // walking out mid-match is a death, so the placings still add up
    if (this.state === 'live' && p.alive) this.kill(p, null, '');
    log(`${p.name} left the battle royale, ${this.players.size} in`);
    this.say(`${p.name} went home.`);
    this.pushLobby();
    updateLobby();
    if (this.state !== 'lobby' && this.living().length === 0) this.finish();
  },

  // the skin they asked for if nobody has it, otherwise the first spare. Fifteen
  // players and nine skins means doubling up eventually; until the other six
  // colleagues are drawn, their slot colour is what tells them apart.
  freeSkin(want) {
    const taken = new Set([...this.players.values()].map(p => p.skin));
    if (!taken.has(want)) return want;
    return SKINS.find(s => !taken.has(s)) || want;
  },

  living() { return [...this.players.values()].filter(p => p.alive); },
  waiting() { return [...this.players.values()].filter(p => !p.late); },

  // ---------------- messages in ----------------
  recv(c, m) {
    const p = this.players.get(c.id);
    if (!p) return;
    switch (m.t) {
      case 'ready': p.ready = !!m.v; this.pushLobby(); break;
      case 'skin': {
        if (this.state !== 'lobby') break;
        const id = cleanSkin(m.id);
        if ([...this.players.values()].some(o => o !== p && o.skin === id)) break;   // taken
        p.skin = id;
        this.pushLobby();
        break;
      }
      case 'name': p.name = cleanName(m.name, p.slot); this.pushLobby(); break;
      case 'i': this.input(p, m); break;
      case 'hit': this.shot(p, m, true); break;
      case 'miss': this.shot(p, m, false); break;
      case 'spec': if (!p.alive && this.players.has(m.id)) p.spec = m.id; break;
    }
  },

  // Where a player says they are. Taken on trust, within reason: you cannot have got
  // there faster than running, and you cannot be standing inside a wall. Anything
  // else and they get snapped back. No prediction, no rollback -- this is fifteen
  // colleagues on one server, and the cure is worse than the disease.
  input(p, m) {
    const now = Date.now();
    if (m.q !== undefined) { p.rtt = Math.max(0, Math.min(500, now - (p.qAt || now))); p.qAt = now; }
    if (!p.alive) return;
    const nx = +m.x, ny = +m.y;
    p.a = Number.isFinite(+m.a) ? +m.a : p.a;
    p.z = Math.max(0, Math.min(2, +m.z || 0));
    p.crouch = Math.max(0, Math.min(1, +m.c || 0));
    p.moving = !!m.m;
    if (Rules.WEAPONS[m.w]) p.weapon = m.w;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    if (p.frozen > 0) return;        // still coming in: they cannot move yet, so do not correct them

    const dt = Math.max(0.05, Math.min(2.5, (now - p.at) / 1000));
    p.at = now;
    const reach = RUN_SPEED * dt * 1.8 + 0.5;                // generous: bad wifi is not cheating
    const moved = Math.hypot(nx - p.x, ny - p.y);
    if (moved > reach || !Rules.freeCircle(Rules.C, nx, ny, PLAYER_R)) { this.correct(p); return; }
    p.x = nx; p.y = ny;
    p.hist.push([now, nx, ny]);
    while (p.hist.length > 2 && now - p.hist[0][0] > 600) p.hist.shift();
  },

  correct(p) { send(p.conn, { t: 'fix', x: r2(p.x), y: r2(p.y) }); },

  // Where a player was a moment ago, so that someone shooting at where they saw them
  // hits. `back` is how far to rewind, in milliseconds.
  rewind(p, back) {
    const want = Date.now() - back;
    const h = p.hist;
    if (!h.length) return [p.x, p.y];
    if (want >= h[h.length - 1][0]) return [p.x, p.y];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1][0] <= want) {
        const [t0, x0, y0] = h[i - 1], [t1, x1, y1] = h[i];
        const k = t1 === t0 ? 0 : (want - t0) / (t1 - t0);
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
      }
    }
    return [h[0][1], h[0][2]];
  },

  // A shot. The shooter's browser did the raycast and says who it hit -- it has the
  // geometry and the pellet spread, and re-rolling all that here would only
  // disagree with what they saw. What the server will not take on trust is the
  // damage, the rate of fire, the range, or whether there was a wall in the way.
  shot(p, m, claimsHit) {
    if (this.state !== 'live' || !p.alive) return;
    const name = m.w;
    const w = Rules.WEAPONS[name];
    if (!w) return;
    const now = Date.now();
    const last = p.lastShot[name] || 0;
    if (now - last < w.cool * 1000 * 0.75) return;        // firing faster than the gun can
    p.lastShot[name] = now;
    p.shots++;
    if (!claimsHit) return;

    const victim = this.players.get(m.id);
    if (!victim || victim === p || !victim.alive) return;
    if (victim.frozen > 0 || p.frozen > 0) return;             // nobody shoots during the drop

    const [vx, vy] = this.rewind(victim, Math.min(400, p.rtt / 2 + 1000 / HZ));
    const d = Math.hypot(vx - p.x, vy - p.y);
    const [far, full] = RANGE[name] || [40, 40];
    if (d > far) return;
    if (!Rules.canSee(Rules.C, p.x, p.y, vx, vy)) return;

    const pellets = Math.max(1, Math.min(w.pellets || 1, Math.round(+m.n || 1)));
    let dmg = 0;
    for (let i = 0; i < pellets; i++) dmg += randi(w.dmg[0], w.dmg[1]);
    if (d > full) dmg *= Math.max(0.25, 1 - (d - full) / (far - full));   // shotguns at distance
    this.hurt(victim, Math.round(dmg), p, name);
  },

  // the same arithmetic as Game.hurtPlayer, so the number on your screen is the number here
  hurt(victim, dmg, by, weapon) {
    if (!victim.alive || dmg <= 0) return;
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, Math.floor(dmg / 3));
      victim.armor -= absorbed;
      dmg -= absorbed;
    }
    victim.hp -= dmg;
    if (victim.hp <= 0) { victim.hp = 0; this.kill(victim, by, weapon); }
    this.pushYou(victim);
  },

  kill(victim, by, weapon) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.place = this.living().length + 1;      // +1: they are already out of living()
    this.dead.push(victim);
    if (by && by !== victim) by.kills++;
    victim.spec = by && by.alive ? by.id : (this.living()[0] || { id: 0 }).id;
    this.feed.push(['k', by ? by.id : 0, victim.id, weapon || '', victim.place]);
    log(`  ${by ? by.name : 'the office'} ${weapon ? 'shot' : 'saw off'} ${victim.name}` +
      ` -- #${victim.place} of ${this.started}`);
    this.pushYou(victim);
    if (by) this.pushYou(by);
  },

  // ---------------- the match ----------------
  startMatch() {
    this.match++;
    this.seed = (Date.now() ^ (this.match * 2654435761)) >>> 0;
    const rnd = mulberry32(this.seed);
    this.state = 'live';
    this.t = 0;
    this.feed = [];
    this.dead = [];
    this.started = this.players.size;
    this.startRing(rnd);
    this.sent = 0; this.tickMs = 0; this.tickPeak = 0; this.reportT = 0;

    // spread everyone out: shuffle the spawns, then keep picking the one furthest
    // from everybody already placed
    const spots = Rules.C.spawns.slice();
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const taken = [];
    for (const p of this.players.values()) {
      let best = spots[0], bestD = -1;
      for (const s of spots) {
        if (taken.includes(s)) continue;
        let near = Infinity;
        for (const u of taken) near = Math.min(near, Math.hypot(s.x - u.x, s.y - u.y));
        if (near > bestD) { bestD = near; best = s; }
      }
      taken.push(best);
      p.late = false;
      p.x = best.x; p.y = best.y; p.a = best.a;
      p.z = 0; p.crouch = 0; p.moving = false;
      p.hp = 100; p.armor = 0; p.alive = true; p.kills = 0; p.place = 0;
      p.weapon = START_KIT.weapon;
      p.ammo = Object.assign({}, START_KIT.ammo);
      p.frozen = DROP_FREEZE;
      p.hist = [[Date.now(), p.x, p.y]];
      p.lastShot = {};
      p.at = Date.now();
      p.spec = 0;
      send(p.conn, this.matchMsg(p));
    }
    log(`match ${this.match} started: ${this.players.size} players, seed ${this.seed}`);
    updateLobby();
  },

  // ---------------- the ring ----------------
  startRing(rnd) {
    const C = Rules.C;
    const full = Math.min(C.w, C.h) / 2;
    this.ring = {
      cx: C.w / 2, cy: C.h / 2, r: full * RING_PHASES[0].r,
      fx: C.w / 2, fy: C.h / 2, fr: full * RING_PHASES[0].r,
      tx: C.w / 2, ty: C.h / 2, tr: full * RING_PHASES[0].r,
      phase: 0, mode: 'wait', left: RING_PHASES[0].wait, span: RING_PHASES[0].wait,
      dps: 0, full, rnd,
    };
    this.ringT = 0;
  },

  // Where the next circle goes: inside the current one, so you can always get there,
  // but off-centre enough that nobody can camp the middle all match.
  nextRing() {
    const g = this.ring, C = Rules.C;
    const next = RING_PHASES[g.phase + 1];
    const tr = g.full * next.r;
    const room = Math.max(0, g.r - tr);
    for (let tries = 0; tries < 40; tries++) {
      const ang = g.rnd() * Math.PI * 2;
      const far = room * (tries < 30 ? g.rnd() * 0.8 : 0);     // give up on off-centre, stay put
      const tx = g.cx + Math.cos(ang) * far, ty = g.cy + Math.sin(ang) * far;
      if (tx < 1 || ty < 1 || tx > C.w - 1 || ty > C.h - 1) continue;
      // the middle of the last circle has to be somewhere you can stand, or the
      // final few seconds are spent inside a wall
      if (tr > 1.5 || Rules.freeCircle(C, tx, ty, 0.4)) return { tx, ty, tr, next };
    }
    return { tx: g.cx, ty: g.cy, tr, next };
  },

  stepRing(dt) {
    const g = this.ring;
    if (!g) return;
    g.left -= dt;
    if (g.mode === 'shrink') {
      const k = g.span <= 0 ? 1 : Math.max(0, Math.min(1, 1 - g.left / g.span));
      g.cx = g.fx + (g.tx - g.fx) * k;
      g.cy = g.fy + (g.ty - g.fy) * k;
      g.r = g.fr + (g.tr - g.fr) * k;
      if (g.left <= 0) {
        g.cx = g.tx; g.cy = g.ty; g.r = g.tr;
        g.phase++;
        const ph = RING_PHASES[g.phase];
        g.dps = ph.dps;
        g.mode = 'wait';
        g.left = g.span = ph.wait;
        if (g.phase >= RING_PHASES.length - 1) { g.mode = 'done'; g.left = g.span = 0; }
      }
    } else if (g.mode === 'wait') {
      if (g.left <= 0) {
        if (g.phase + 1 >= RING_PHASES.length) { g.mode = 'done'; return; }
        const { tx, ty, tr, next } = this.nextRing();
        g.fx = g.cx; g.fy = g.cy; g.fr = g.r;
        g.tx = tx; g.ty = ty; g.tr = tr;
        g.mode = 'shrink';
        g.left = g.span = next.shrink;
        this.say(g.phase === 0 ? 'The vents are closing.' : 'The vents are closing further.');
      }
    }

    // outside it, you cook. Armour is no help against gas.
    this.ringT += dt;
    if (this.ringT < RING_TICK) return;
    this.ringT -= RING_TICK;
    const bite = g.dps * RING_TICK;
    if (bite <= 0) return;
    for (const p of this.players.values()) {
      if (!p.alive || p.frozen > 0) continue;
      if (Math.hypot(p.x - g.cx, p.y - g.cy) <= g.r) continue;
      p.hp -= bite;
      if (p.hp <= 0) { p.hp = 0; this.kill(p, null, 'ring'); } else this.pushYou(p);
    }
  },

  matchMsg(p) {
    return { t: 'match', seed: this.seed, map: Rules.spec.name, at: this.t,
      spawn: p.late ? null : { x: r2(p.x), y: r2(p.y), a: r2(p.a) },
      freeze: p.late ? 0 : DROP_FREEZE, spectate: !!p.late,
      kit: { weapon: START_KIT.weapon, has: START_KIT.has, ammo: START_KIT.ammo },
      ring: this.ring ? { cx: r2(this.ring.cx), cy: r2(this.ring.cy), r: r2(this.ring.r) } : null,
      phases: RING_PHASES.length };
  },

  finish() {
    if (this.state === 'over') return;
    this.state = 'over';
    this.t = 0;
    const winner = this.living()[0] || null;
    if (winner) { winner.place = 1; this.dead.push(winner); }
    const board = this.dead.slice().sort((a, b) => a.place - b.place)
      .map(p => ({ id: p.id, slot: p.slot, name: p.name, skin: p.skin, kills: p.kills, place: p.place }));
    for (const p of this.players.values()) {
      send(p.conn, { t: 'end', board, winner: winner ? winner.id : 0 });
    }
    log(`match ${this.match} over` + (winner ? `: ${winner.name} won with ${winner.kills} kills` : ''));
    updateLobby();
  },

  toLobby() {
    this.state = 'lobby';
    this.t = 0;
    this.dead = [];
    for (const p of this.players.values()) {
      p.alive = false; p.ready = false; p.late = false; p.place = 0; p.kills = 0;
      p.hp = 100; p.armor = 0;
    }
    this.pushLobby();
    updateLobby();
  },

  // ---------------- the clock ----------------
  step(dt) {
    if (!Rules) return;
    const t0 = process.hrtime.bigint();
    this.tock(dt);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    this.tickMs += ms;
    if (ms > this.tickPeak) this.tickPeak = ms;
    if (this.state === 'live' && this.t - this.reportT >= 15) {
      const secs = this.t - this.reportT || 1;
      log(`  ${this.living().length}/${this.started} alive  |  ` +
        `${(this.sent / secs / 1024).toFixed(1)} KB/s out, ` +
        `${(this.tickMs / (secs * HZ)).toFixed(2)} ms/tick avg, ${this.tickPeak.toFixed(1)} peak`);
      this.reportT = this.t; this.sent = 0; this.tickMs = 0; this.tickPeak = 0;
    }
  },

  tock(dt) {
    this.t += dt;
    this.tick++;
    const n = this.waiting().length;

    if (this.state === 'lobby') {
      const ready = this.waiting().filter(p => p.ready).length;
      if (n >= this.MIN && (ready === n || this.t > LOBBY_WAIT)) {
        this.state = 'countdown';
        this.t = 0;
        this.say('Everyone to the yard.');
      }
    } else if (this.state === 'countdown') {
      if (n < this.MIN) { this.state = 'lobby'; this.t = 0; this.say('Not enough people. Waiting.'); }
      else if (this.t >= COUNTDOWN) this.startMatch();
    } else if (this.state === 'live') {
      for (const p of this.players.values()) if (p.frozen > 0) p.frozen -= dt;
      this.stepRing(dt);
      const live = this.living();
      if (live.length <= 1 && this.players.size > 1) this.finish();
      else if (live.length === 0) this.finish();
    } else if (this.state === 'over') {
      if (this.t >= OVER_HOLD) this.toLobby();
    }

    if (this.state === 'lobby' || this.state === 'countdown') {
      if (this.tick % HZ === 0) this.pushLobby();          // once a second is plenty
      return;
    }
    this.snapshot();
  },

  // One string, written to every socket: fifteen players at 20 Hz is a few hundred
  // bytes a tick, and stringifying it once per player instead of once per tick would
  // be fifteen times the work for nothing.
  snapshot() {
    const p = [];
    for (const q of this.players.values()) {
      if (q.late) continue;
      let flags = 0;
      if (!q.alive) flags |= 1;
      if (q.moving) flags |= 2;
      if (q.crouch > 0.5) flags |= 4;
      if (q.frozen > 0) flags |= 8;
      p.push([q.id, r2(q.x), r2(q.y), r2(q.a), Math.ceil(q.hp), flags, q.shots,
        Rules.wnames.indexOf(q.weapon), q.z ? r2(q.z) : 0]);
    }
    const g = this.ring;
    const m = { t: 'S', q: this.tick, st: this.state, ct: r2(this.t),
      alive: this.living().length, p, e: this.feed,
      // where the gas line is now, where it is going, and what it costs to be outside
      r: g ? [r2(g.cx), r2(g.cy), r2(g.r), r2(g.tx), r2(g.ty), r2(g.tr),
        g.phase, g.mode === 'shrink' ? 1 : 0, r2(Math.max(0, g.left)), g.dps] : null };
    this.feed = [];
    const data = frame(Buffer.from(JSON.stringify(m)), 1);
    let n = 0;
    for (const q of this.players.values()) {
      if (q.conn.sock.destroyed) continue;
      q.conn.sock.write(data);
      n++;
    }
    this.sent += data.length * n;
  },

  // a player's own numbers, which are nobody else's business and only change in jumps
  pushYou(p) {
    send(p.conn, { t: 'you', hp: Math.ceil(p.hp), ar: p.armor, alive: p.alive,
      place: p.place, kills: p.kills, spec: p.spec });
  },

  pushLobby() {
    if (!Rules) return;
    const roster = [...this.players.values()].map(p => ({
      id: p.id, slot: p.slot, name: p.name, skin: p.skin, ready: p.ready, late: p.late }));
    const m = { t: 'blobby', state: this.state, t: r2(this.t), roster,
      min: this.MIN, max: this.MAX, countdown: COUNTDOWN, wait: LOBBY_WAIT };
    for (const p of this.players.values()) send(p.conn, m);
  },

  say(text) { this.feed.push(['m', text]); log('  ' + text); },
};

if (Rules) setInterval(() => BR.step(1 / HZ), 1000 / HZ);

// ----------------------------------------------------------------------
// odds and ends
// ----------------------------------------------------------------------
const r2 = v => Math.round(v * 100) / 100;
const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// a small seeded generator, so a match's spawns and loot can be replayed from its seed
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cleanName(s, slot) {
  // printable characters only, trimmed: this goes on everyone's screen
  const t = String(s == null ? '' : s).split('')
    .filter(ch => { const c = ch.charCodeAt(0); return c > 31 && c !== 127; })
    .join('').trim().slice(0, 14);
  return t || 'P' + slot;
}

const SKINS = ['brute', 'tank', 'irakli', 'beard', 'rider', 'hood', 'specs', 'sandro', 'agamemnov'];
function cleanSkin(s) { return SKINS.includes(s) ? s : SKINS[0]; }

// over the internet idle connections get cut: ping everyone, and drop the ones that stopped answering
setInterval(() => {
  const now = Date.now(), ping = frame(Buffer.alloc(0), 9);
  for (const c of conns) {
    if (now - c.seen > 75000) c.sock.destroy();
    else if (!c.sock.destroyed) c.sock.write(ping);
  }
}, 25000);

// ----------------------------------------------------------------------
// just enough WebSocket (RFC 6455) for this
// ----------------------------------------------------------------------
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key) { sock.destroy(); return; }
  const accept64 = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept64 + '\r\n\r\n');
  sock.setNoDelay(true);
  accept(sock);
});

// one frame from the front of buf, or null if its header hasn't all arrived yet
// (data null: the header has, the payload not yet; size tells how big it will be)
function parse(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, at = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); at = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); at = 10; }
  const mask = masked ? buf.subarray(at, at + 4) : null;
  if (masked) at += 4;
  if (buf.length < at + len) return { size: at + len, data: null };
  const data = Buffer.from(buf.subarray(at, at + len));
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
  return { fin, op, data, size: at + len };
}

function frame(data, op) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}

function log(s) { console.log(new Date().toTimeString().slice(0, 8) + '  ' + s); }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`63: Office Hell server on port ${PORT}.`);
  if (Rules) {
    const C = Rules.C;
    console.log(`Battle royale on "${Rules.spec.name}" (${C.w}x${C.h}), up to ${BR.MAX} players,` +
      ` ${C.spawns.length} spawns.`);
  }
  console.log(`Co-op for up to ${COOP_MAX}.`);
  if (fs.existsSync(GAME)) {
    console.log('Players on this network can open:');
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}/`);
    }
    console.log(`  http://localhost:${PORT}/   (this computer)`);
  }
  console.log('Keep this running while people play (Ctrl+C stops it).');
});
