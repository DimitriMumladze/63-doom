// The two games this engine runs, and the battle royale's own state.
//
// Everything that is simulation -- moving, bumping into things, firing, bullets,
// sprites -- stays in game.js and is shared. What differs between the campaign and
// the battle royale is the *rules*, and those live here, behind Game.mode:
//
//   campaign       the office gone wrong. Your browser (or the host's) runs the
//                  coworkers, the doors and the pickups. Unchanged.
//   battle royale  fifteen people in the yard. server.js runs the match and this
//                  draws it; see net.js for what goes over the wire.
'use strict';

const BR_MIN_PLAYERS = 2;

// Which map the battle royale is played on. The server says so in its welcome and
// both sides have to agree, because everything about a match is sent as positions
// in it. maps/yard.js is the small one the netcode was built against, kept because a
// test match on it takes a minute rather than five.
const BR_MAPS = { block: () => BLOCK_MAP_SPEC, yard: () => YARD_MAP_SPEC };
let BR_MAP_NAME = 'block';
const brMapSpec = () => (BR_MAPS[BR_MAP_NAME] || BR_MAPS.block)();

// Each player's colour, used for their name tag, the kill feed and the minimap --
// not for tinting them. With real colleagues' faces on the sprites, recognising who
// you are shooting at is the joke, and a coloured multiply over it ruins that. Only
// the slots that had to double up on a skin get tinted (see skinTint).
const SLOT_COLORS = [
  '#44da9d', '#6f9dff', '#f0c040', '#ff7ad0', '#5fd37a', '#ff8a5c', '#9d8cff', '#4fd6d6',
  '#e8e05c', '#ff6b7a', '#7ed957', '#c08cff', '#ffb347', '#59c4ff', '#d4a05a',
];
const slotColor = slot => SLOT_COLORS[(slot - 1) % SLOT_COLORS.length];

const Modes = {
  campaign: {
    id: 'campaign',
    spec: () => OFFICE_MAP,
    enemies: true, npcs: true, doors: true, respawn: true,

    onStart() {
      Game.say('Burdzgla St. 65. The lights are still on at 63 BITS...');
    },

    newPlayer(L) {
      return {
        x: L.start.x, y: L.start.y, a: L.start.a, r: 0.24, isPlayer: true,
        hp: 100, armor: 0, ammo: { bullets: 50, shells: 0, rockets: 0, cells: 0 },
        has: { pistol: true, shotgun: false, dbshotgun: false, chaingun: false, rifle: false,
          rocketl: false, plasmagun: false },
        weapon: 'pistol', fireT: 0, shotT: 9, bob: 0, moving: false, dead: false, shots: 0,
        z: 0, vz: 0, crouch: 0, pitch: 0, land: 0, kick: 0, flip: false,
      };
    },

    // the coworkers, the flow field they walk down, the boss songs, and what the
    // crosshair is pointing at: all of it only means anything in the campaign
    update(dt) {
      const G = Game, p = G.player;
      const fighting = G.enemies.filter(e => (e.state === 'chase' || e.state === 'attack')
        && Math.hypot(e.x - p.x, e.y - p.y) < 14).length;
      Music.setIntensity(Math.min(1, fighting / 3));
      const sb = G.songBoss && G.songBoss.hp > 0 ? G.songBoss
        : G.enemies.find(e => e.t.song && e.hp > 0 && e.state !== 'idle');
      if (sb && !p.dead) BossMusic.play(sb.t.song);
      // what is the crosshair on? (the HUD shows that coworker's face)
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      const wall = Engine.castDist(G.L, p.x, p.y, dx, dy, 30);
      let best = null, bestT = wall;
      for (const e of G.enemies) {
        if (e.hp <= 0) continue;
        const ex = e.x - p.x, ey = e.y - p.y, t = ex * dx + ey * dy;
        if (t > 0 && t < bestT && Math.abs(ex * dy - ey * dx) < e.hitR) { best = e; bestT = t; }
      }
      if (best) { G.target = best; G.targetT = 1.5; }
    },

    sprites(out) {
      for (const e of Game.enemies) {
        // death frames are 2x wider but the same pixel scale
        out.push({ x: e.x, y: e.y, tex: Assets.get(e.type + '/' + e.frame), h: e.h, lift: 0 });
      }
    },

    onDeath() { Main.onDeath(); },
  },

  br: {
    id: 'br',
    spec: brMapSpec,
    enemies: false, npcs: true, doors: false, respawn: false,

    onStart() { BR.onMatchStart(); },

    // You come in with what the server said, and it owns your health from then on.
    newPlayer(L) {
      const kit = BR.kit || { weapon: 'shotgun', has: ['pistol', 'shotgun'],
        ammo: { bullets: 60, shells: 24, rockets: 0, cells: 0 } };
      const spawn = BR.spawn || L.start;
      const has = {};
      for (const name in WEAPONS) has[name] = kit.has.includes(name);
      return {
        x: spawn.x, y: spawn.y, a: spawn.a, r: 0.24, isPlayer: true,
        hp: 100, armor: 0, ammo: Object.assign({ bullets: 0, shells: 0, rockets: 0, cells: 0 }, kit.ammo),
        has, weapon: kit.weapon, fireT: 0, shotT: 9, bob: 0, moving: false, dead: false, shots: 0,
        z: 0, vz: 0, crouch: 0, pitch: 0, land: 0, kick: 0, flip: false,
        skin: BR.mySkin, name: BR.myName, slot: Net.slot,
      };
    },

    update(dt) {
      BR.update(dt);
      Music.setIntensity(BR.ring && BR.outside ? 1 : Math.min(1, BR.nearbyFire / 2));
    },

    // aboard and falling you are not on the ground, so none of the walking rules apply
    airborne() { return BR.aboard || BR.falling; },

    // the other fifteen, each as their own colleague
    sprites(out) { BR.sprites(out); },

    // in a battle royale you do not come back; the server decides when you are out
    onDeath() { /* the server's 'you' message sets this; see BR.onYou */ },
  },
};

// ----------------------------------------------------------------------
// The battle royale as the player's browser sees it: the lobby, the ring, the
// kill feed, the scoreboard, and who is still standing. net.js fills this in.
// ----------------------------------------------------------------------
const BR = {
  // lobby
  state: 'lobby',        // lobby | countdown | live | over -- as the server last said
  stateT: 0,
  roster: [], min: BR_MIN_PLAYERS, max: 15, countdown: 20, wait: 90,
  ready: false, myName: '', mySkin: 'irakli', pick: 0,

  // the match
  spawn: null, kit: null, seed: 0, spectating: false,

  // The drop. `plane` is the flight the server sent; `planeT` runs it forward between
  // snapshots so the ride is smooth, and the server's `pl` corrects it 20 times a
  // second. Aboard until you jump, then falling until z reaches nothing.
  plane: null, planeT: 0, aboard: false, aboardN: 0,
  falling: false, fallT: 0, z: 0, fall: null,
  alive: 0, started: 0, place: 0, kills: 0,
  ring: null,            // { cx, cy, r, tx, ty, tr, phase, shrinking, left, dps }
  outside: false, warnT: 0, nearbyFire: 0,
  feed: [],              // kill feed: { text, colour, t }
  board: null, winner: 0,
  specId: 0,             // whose eyes you are watching through once you are out

  reset() {
    this.ring = null; this.board = null; this.winner = 0;
    this.feed = []; this.outside = false; this.warnT = 0; this.nearbyFire = 0;
    this.place = 0; this.kills = 0; this.specId = 0; this.spectating = false;
    this.aboard = false; this.falling = false; this.fallT = 0; this.z = 0;
    this.plane = null; this.planeT = 0; this.aboardN = 0;
  },

  onMatchStart() {
    const spectating = this.spectating;
    const plane = this.plane, fall = this.fall, planeT = this.planeT;
    this.reset();
    this.spectating = spectating;
    this.plane = plane; this.fall = fall; this.planeT = planeT;
    if (!spectating && plane) {
      this.aboard = true;
      this.z = plane.alt;
      Game.say('Out over Burdzgla St. Jump when you like.');
    } else {
      Game.say(spectating ? 'Match in progress. Watching until the next one.'
        : 'The lift doors open.');
    }
  },

  // ---------------- the drop ----------------
  // where the plane is, this far into its run
  planeAt(t) {
    const g = this.plane;
    const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
    const dx = (g.x1 - g.x0) / len, dy = (g.y1 - g.y0) / len;
    // never past the end of the run, the same clamp the server applies
    const d = Math.max(0, Math.min(len, Math.max(0, t) * g.speed));
    return { x: g.x0 + dx * d, y: g.y0 + dy * d, dx, dy, len };
  },

  // the doors are shut for the first moment, so nobody jumps before the map
  canJump() { return this.aboard && this.plane && this.planeT > 0; },

  jump() {
    if (!this.canJump()) return;
    const at = this.planeAt(this.planeT);
    this.aboard = false;
    this.falling = true;
    this.fallT = 0;
    this.z = this.plane.alt;
    const p = Game.player;
    p.x = at.x; p.y = at.y;
    p.a = Math.atan2(at.dy, at.dx);
    Net.send({ t: 'jump' });
    Sound.play('jump');
    Game.say('Out. Steer.');
  },

  // the height the server will expect, so the two never drift apart
  fallHeight(secs) {
    const f = this.fall || { speed: 9, chuteAt: 8, chuteSpeed: 3 };
    const alt = this.plane ? this.plane.alt : 24;
    const toChute = (alt - f.chuteAt) / f.speed;
    if (secs <= toChute) return alt - secs * f.speed;
    return Math.max(0, f.chuteAt - (secs - toChute) * f.chuteSpeed);
  },

  chuteOpen() { return this.falling && this.z <= (this.fall ? this.fall.chuteAt : 8); },

  // Riding and falling, run on the client so both are smooth; the server's snapshot
  // pulls the plane back into line and owns the moment of landing.
  updateDrop(dt) {
    if (this.plane) this.planeT += dt;
    const p = Game.player;
    if (this.aboard) {
      const at = this.planeAt(this.planeT);
      p.x = at.x; p.y = at.y;
      this.z = this.plane.alt;
      return;
    }
    if (!this.falling) return;
    this.fallT += dt;
    this.z = this.fallHeight(this.fallT);
    // steer: the same keys as walking, faster in free fall than under the chute
    const sp = (this.chuteOpen() ? 4.5 : 7) * dt;
    const k = Input.keys, pad = Input.pad, tc = Input.touch;
    const fwd = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0) - pad.ly - tc.ly;
    const str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + pad.lx + tc.lx;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    let mx = ca * fwd - sa * str, my = sa * fwd + ca * str;
    const ml = Math.hypot(mx, my);
    if (ml > 0) {
      // no walls up here, only the edge of the world
      p.x = Math.max(0.6, Math.min(Game.L.w - 0.6, p.x + mx / ml * sp));
      p.y = Math.max(0.6, Math.min(Game.L.h - 0.6, p.y + my / ml * sp));
    }
    if (this.z <= 0) {
      this.falling = false;
      this.z = 0;
      Sound.play('land');
      Game.say('Down. Find a gun.');
      Main.onLanded();
    }
  },

  // ---------------- the server's word on your own numbers ----------------
  onYou(m) {
    const p = Game.player;
    if (!p) return;
    const wasDead = p.dead;
    p.hp = m.hp;
    p.armor = m.ar;
    this.place = m.place || 0;
    this.kills = m.kills || 0;
    if (m.spec) this.specId = m.spec;
    if (!m.alive && !wasDead) {
      p.dead = true;
      p.hp = 0;
      Sound.play('playerdie');
      Main.onBrDeath();
    } else if (m.alive && wasDead) {
      p.dead = false;
    }
  },

  // ---------------- the ring ----------------
  onRing(r) {
    if (!r) { this.ring = null; return; }
    const [cx, cy, rad, tx, ty, tr, phase, shrinking, left, dps] = r;
    this.ring = { cx, cy, r: rad, tx, ty, tr, phase, shrinking: !!shrinking, left, dps };
  },

  // how far outside the ring you are, in cells (negative inside)
  outsideBy() {
    const g = this.ring, p = Game.player;
    if (!g || !p) return -1;
    return Math.hypot(p.x - g.cx, p.y - g.cy) - g.r;
  },

  update(dt) {
    this.stateT += dt;
    this.nearbyFire = Math.max(0, this.nearbyFire - dt);
    for (const f of this.feed) f.t -= dt;
    while (this.feed.length && this.feed[0].t <= 0) this.feed.shift();

    const out = this.outsideBy() > 0 && !Game.player.dead && this.state === 'live';
    if (out && !this.outside) {
      Game.say('Outside the vents. Get back inside.');
      Sound.play('locked');
    }
    this.outside = out;
    if (out) {
      this.warnT += dt;
      // the server is doing the damage; this is just the feeling of it
      Game.washR = Math.min(0.4, Game.washR + dt * 0.5);
    } else this.warnT = 0;
  },

  // ---------------- what you see ----------------
  sprites(out) {
    const p = Game.player;
    for (const r of Net.active()) {
      if (r.dead && r.deadT > 6) continue;         // bodies stop being drawn eventually
      if (r.aboard) continue;                      // still on the plane, nowhere to draw them
      const frame = r.dead ? 'death4' : r.shotT < 0.15 ? 'attack2'
        : r.moving ? ['walk1', 'walk2', 'walk3', 'walk2'][Math.floor(r.animT / 0.17) % 4] : 'idle';
      const tint = skinTint(r);
      out.push({ x: r.x, y: r.y, tex: Assets.get((r.skin || 'irakli') + '/' + frame),
        h: 1.25 - (r.dead ? 0 : 0.3 * r.crouch), lift: r.z,
        tintR: tint[0], tintG: tint[1], tintB: tint[2] });
    }
  },

  // ---------------- the kill feed ----------------
  onKill(killerId, victimId, weapon, place) {
    const me = Net.id;
    const k = this.who(killerId), v = this.who(victimId);
    const gun = weapon === 'ring' ? null : (WEAPONS[weapon] ? WEAPONS[weapon].label : null);
    let text;
    if (!killerId) text = `${v} was gassed`;
    else text = `${k} ${gun ? gun.toLowerCase() + 'ed' : 'got'} ${v}`;
    const mine = killerId === me || victimId === me;
    this.feed.push({ text: text + (place ? `   #${place}` : ''), t: 6, mine,
      colour: killerId === me ? slotColor(Net.slot) : (victimId === me ? '#ff6b7a' : '#ddd') });
    if (this.feed.length > 5) this.feed.shift();
    if (victimId === me) Game.say(killerId ? `${k} got you. #${place}.` : `Gassed. #${place}.`);
    else if (killerId === me) Sound.play('pickup');
  },

  who(id) {
    if (!id) return 'the office';
    if (id === Net.id) return this.myName || 'you';
    const r = Net.remotes[id];
    if (r && r.name) return r.name;
    const e = this.roster.find(x => x.id === id);
    return e ? e.name : 'someone';
  },

  // the player you are watching, once you are out
  specTarget() {
    const live = Net.active().filter(r => !r.dead);
    if (!live.length) return null;
    const want = live.find(r => r.id === this.specId);
    return want || live[0];
  },

  nextSpec(dir) {
    const live = Net.active().filter(r => !r.dead);
    if (!live.length) return;
    const i = live.findIndex(r => r.id === this.specId);
    const next = live[((i < 0 ? 0 : i + dir) + live.length) % live.length];
    this.specId = next.id;
    Net.send({ t: 'spec', id: next.id });
  },
};

// Only the slots that had to share a skin get tinted, so the colleague is still
// recognisable on the ones that did not. The server hands out spare skins first.
function skinTint(r) {
  if (!r.dup) return [1, 1, 1];
  const c = slotColor(r.slot);
  const n = parseInt(c.slice(1), 16);
  const k = 0.45;      // how far towards their colour
  return [1 + k * (((n >> 16) & 255) / 255 - 0.5), 1 + k * (((n >> 8) & 255) / 255 - 0.5),
    1 + k * ((n & 255) / 255 - 0.5)];
}

if (typeof module !== 'undefined' && module.exports) module.exports = { SLOT_COLORS };
