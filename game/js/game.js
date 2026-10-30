// Gameplay: player, weapons, the 63 crew AI, projectiles, doors, pickups.
'use strict';

const ENEMY_TYPES = {
  irakli: { name: 'IRAKLI', hp: 50, speed: 1.3, kind: 'hitscan', dmg: [2, 6], pellets: 3, spread: 0.12,
    cool: [1.5, 2.5], range: 10, pain: 0.55, sound: 'shotgun' },
  brute: { name: 'DIMITRI', hp: 70, speed: 1.2, kind: 'proj', proj: 'fireball', dmg: [8, 16], cool: [1.6, 2.8],
    range: 16, pain: 0.45, sound: 'fireball' },
  tank: { name: 'NIKOLOZ', hp: 130, speed: 2.6, kind: 'melee', dmg: [8, 18], cool: [0.8, 1.1], range: 1.15,
    pain: 0.3, sound: 'punch' },
  rider: { name: 'LASHA', hp: 70, speed: 3.0, kind: 'proj', proj: 'plasma', dmg: [5, 10], burst: 2,
    cool: [1.3, 2.1], range: 15, pain: 0.5, sound: 'plasma', seated: true },
  // bosses: `opens` = the sealed door his death unseals (`sealed` is said at it before that), `door` = the door
  // into his own room, whose opening starts his `song`; the `final` one wins the game
  sandro: { name: 'COMMUNIST SANDRO', hp: 900, speed: 1.15, kind: 'proj', throws: ['hammer', 'sickle'], dmg: [18, 32],
    cool: [0.9, 1.6], range: 20, pain: 0.1, sound: 'throw', scale: 1.15, boss: true,
    door: 'U', song: 'music/sandro.mp3', opens: 'u', sealed: 'Sealed with a double-headed eagle.',
    opensMsg: '...and a gilded door in the Red Corner swings open. Something stirs behind it.' },
  beard: { name: 'BIG DIMITRI', hp: 650, speed: 1.05, kind: 'proj', proj: 'rocket', dmg: [25, 45], splash: 1.5,
    cool: [1.3, 2.3], range: 22, pain: 0.12, sound: 'rocket', scale: 1.15, boss: true,
    opens: 'U', sealed: 'Sealed by the Party.', opensMsg: '...and the Red Corner door opens. COMMUNIST SANDRO awaits.' },
  // the last and hardest: faster spears, a fan of three every third throw, enraged below half health
  agamemnov: { name: 'THE AGAMEMNOV', hp: 1500, speed: 1.5, kind: 'proj', proj: 'spear', volley: 3, enrage: true,
    dmg: [20, 34], cool: [0.8, 1.3], range: 22, pain: 0.05, sound: 'throw', scale: 1.2, boss: true, final: true,
    door: 'u', song: 'music/agamemnov.mp3', greet: 'THE AGAMEMNOV awaits!' },
};

const PROJ_TYPES = {
  fireball: { speed: 7, frames: ['fx/fireball_0', 'fx/fireball_1'], h: 0.36, hit: 'explode' },
  plasma: { speed: 11, frames: ['fx/plasma_0', 'fx/plasma_1'], h: 0.3, hit: 'zap' },
  rocket: { speed: 8.5, frames: ['fx/rocket_0', 'fx/rocket_1'], h: 0.34, hit: 'explode' },
  prock: { speed: 14, frames: ['fx/rocket_0', 'fx/rocket_1'], h: 0.3, hit: 'explode' },
  pplasma: { speed: 20, frames: ['fx/plasma_0', 'fx/plasma_1'], h: 0.24, hit: 'zap' },
  hammer: { speed: 9, frames: ['fx/hammer_0', 'fx/hammer_1', 'fx/hammer_2', 'fx/hammer_3'], h: 0.4, hit: 'puff',
    hitSound: 'clang' },
  sickle: { speed: 9, frames: ['fx/sickle_0', 'fx/sickle_1', 'fx/sickle_2', 'fx/sickle_3'], h: 0.4, hit: 'puff',
    hitSound: 'clang' },
  spear: { speed: 13, frames: ['fx/spear_0', 'fx/spear_1', 'fx/spear_2', 'fx/spear_3'], h: 0.36, hit: 'puff',
    hitSound: 'clang' },
};

// seq: [from, to, frame] by time since the shot; auto weapons alternate frames 1/2
const WEAPONS = {
  pistol: { slot: 1, label: 'PISTOL', ammo: 'bullets', cool: 0.38, dmg: [8, 15], pellets: 1, spread: 0.012,
    frames: 2, seq: [[0, 0.12, 1]], sound: 'pistol', kick: 6 },
  shotgun: { slot: 2, label: 'SHOTGUN', ammo: 'shells', cool: 0.95, dmg: [6, 14], pellets: 7, spread: 0.1,
    frames: 3, seq: [[0, 0.12, 1], [0.3, 0.75, 2]], sound: 'shotgun', kick: 12 },
  dbshotgun: { slot: 3, label: 'SUPER SG', ammo: 'shells', use: 2, cool: 1.45, dmg: [6, 14], pellets: 18, spread: 0.2,
    frames: 3, seq: [[0, 0.15, 1], [0.4, 1.25, 2]], sound: 'dbshotgun', kick: 18 },
  chaingun: { slot: 4, label: 'CHAINGUN', ammo: 'bullets', cool: 0.1, dmg: [7, 13], pellets: 1, spread: 0.045,
    auto: true, frames: 3, sound: 'chaingun', kick: 3 },
  rifle: { slot: 5, label: 'RIFLE', ammo: 'bullets', cool: 0.09, dmg: [9, 15], pellets: 1, spread: 0.02,
    auto: true, frames: 3, sound: 'rifle', kick: 3 },
  rocketl: { slot: 6, label: 'ROCKETS', ammo: 'rockets', cool: 0.9, dmg: [60, 100], proj: 'prock', splash: 1.6,
    frames: 3, seq: [[0, 0.15, 1], [0.3, 0.75, 2]], sound: 'rocket', kick: 14 },
  plasmagun: { slot: 7, label: 'PLASMA', ammo: 'cells', cool: 0.08, dmg: [10, 18], proj: 'pplasma',
    auto: true, frames: 3, sound: 'plasma', kick: 2 },
};
const AMMO_MAX = { bullets: 200, shells: 50, rockets: 30, cells: 200 };

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));

const Game = {
  L: null, player: null, enemies: [], projs: [], fx: [], msgs: [],
  time: 0, kills: 0, totalEnemies: 0, flowT: 0, flow: null, noise: 0, washR: 0, washG: 0,
  target: null, targetT: 0,

  start() {
    const L = this.L = buildLevel();
    this.enemies = L.spawns.map(s => this.makeEnemy(s.type, s.x, s.y));
    this.totalEnemies = this.enemies.length;
    this.kills = 0;
    this.projs = []; this.fx = []; this.msgs = []; this.vapor = [];
    this.time = 0;
    this.player = this.newPlayer();
    this.flow = new Int16Array(L.w * L.h);
    this.computeFlow();
    this.songBoss = null;
    BossMusic.stop();
    this.say('Burdzgla St. 65. The lights are still on at 63 BITS...');
  },

  newPlayer() {
    const L = this.L;
    return {
      x: L.start.x, y: L.start.y, a: L.start.a, r: 0.24, isPlayer: true,
      hp: 100, armor: 0, ammo: { bullets: 50, shells: 0, rockets: 0, cells: 0 },
      has: { pistol: true, shotgun: false, dbshotgun: false, chaingun: false, rifle: false, rocketl: false, plasmagun: false },
      weapon: 'pistol', fireT: 0, shotT: 9, bob: 0, moving: false, dead: false, shots: 0,
      z: 0, vz: 0, crouch: 0, pitch: 0, land: 0, kick: 0, flip: false,
    };
  },

  // co-op: back at the front door with a pistol, the office stays as it is
  respawn() {
    this.player = this.newPlayer();
    this.lastHitBy = null;
    this.washR = 0;
    for (const it of this.L.pickups) it.mine = false;
    this.say('Back at the front door. Your coworkers are still in there.');
  },

  // you, and in online co-op the others who are in the game
  players() { return [this.player, ...Net.active()]; },
  livePlayers() { return this.players().filter(p => !p.dead); },

  // the living player closest to e: in co-op the coworkers go for whoever is nearest
  nearest(e, live) {
    let best = this.player, bd = Infinity;
    for (const p of live) {
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  },

  // src: the coworker who did it, or another player (friendly fire), or null
  hurtAny(p, dmg, src) {
    const by = src && src.isPlayer ? (src === this.player ? Net.slot : src.slot) : 0;
    if (p === this.player) this.hurtPlayer(dmg, by ? { friendly: true, slot: by } : src);
    else if (p.remote && !p.dead) {
      Net.send({ t: 'hurt', to: p.id, dmg, src: src && !by ? this.enemies.indexOf(src) : -1, by });
    }
  },

  // world sounds and messages: the host passes them on to the others with the next snapshot
  sound(name, vol = 1) {
    Sound.play(name, vol);
    if (Net.coop && Net.host) Net.out.snd.push([name, Math.round(vol * 100) / 100]);
  },

  announce(text) {
    this.say(text);
    if (Net.coop && Net.host) Net.out.msgs.push(text);
  },

  // a message for one player: whoever pressed the door
  tell(p, text, snd) {
    if (p === this.player || !p.remote) { this.say(text); if (snd) Sound.play(snd); }
    else Net.send({ t: 'msg', to: p.id, text, snd });
  },

  makeEnemy(type, x, y) {
    const t = ENEMY_TYPES[type];
    return { type, t, x, y, hp: t.hp, state: 'idle', st: 0, cool: rand(0.5, 1.5), animT: rand(0, 1),
      frame: 'idle', fired: 0, r: 0.3 * (t.scale || 1), hitR: 0.34 * (t.scale || 1), h: 1.25 * (t.scale || 1),
      strafe: rand(-1, 1), strafeT: 0 };
  },

  say(text) {
    this.msgs.push({ text, t: 4 });
    if (this.msgs.length > 3) this.msgs.shift();
  },

  // ------------------------------------------------------------------
  // map queries
  // ------------------------------------------------------------------
  blocked(cx, cy) {
    const L = this.L;
    if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return true;
    const i = cy * L.w + cx;
    if (L.block[i]) return true;
    if (!L.solid[i]) return false;
    const d = L.doorAt[i];
    return !d || d.open < 0.85;
  },

  // circle vs blocked cells; extra = list of {x,y,r} circles (props)
  free(x, y, r, self) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.blocked(cx, cy)) continue;
        const nx = Math.max(cx, Math.min(x, cx + 1)), ny = Math.max(cy, Math.min(y, cy + 1));
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return false;
      }
    }
    for (const d of this.L.decor) {
      if (!d.r) continue;
      if ((d.x - x) ** 2 + (d.y - y) ** 2 < (d.r + r) ** 2) return false;
    }
    for (const n of this.L.npcs) {
      if (n === self) continue;
      if ((n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + r) ** 2) return false;
    }
    return true;
  },

  move(ent, dx, dy) {
    if (this.free(ent.x + dx, ent.y, ent.r)) ent.x += dx;
    if (this.free(ent.x, ent.y + dy, ent.r)) ent.y += dy;
  },

  sees(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 0.01) return true;
    return Engine.castDist(this.L, ax, ay, dx / d, dy / d, d + 1) >= d - 0.05;
  },

  // BFS distance field from the player's cell; enemies walk downhill
  // (co-op: from every living player's cell at once)
  computeFlow() {
    const L = this.L, f = this.flow;
    f.fill(-1);
    const q = [];
    const live = this.livePlayers();
    for (const p of live.length ? live : [this.player]) {
      const i = Math.floor(p.y) * L.w + Math.floor(p.x);
      if (i >= 0 && i < f.length && f[i] < 0) { f[i] = 0; q.push(i); }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % L.w, y = (i / L.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const ni = ny * L.w + nx;
        if (f[ni] >= 0 || !this.walkable(nx, ny)) continue;
        f[ni] = f[i] + 1;
        q.push(ni);
      }
    }
  },

  walkable(cx, cy) {
    const L = this.L, i = cy * L.w + cx;
    if (L.block[i]) return false;
    if (!L.solid[i]) return true;
    const d = L.doorAt[i];
    return !!d && !d.locked;
  },

  // ------------------------------------------------------------------
  // doors
  // ------------------------------------------------------------------
  openDoor(door, byPlayer) {
    // a door that a boss's death unseals (see ENEMY_TYPES `opens`)
    const keeper = Object.values(ENEMY_TYPES).find(t => t.opens === door.key);
    if (door.locked && keeper) {
      if (byPlayer) this.tell(byPlayer, `${keeper.sealed} Defeat ${keeper.name} first.`, 'locked');
      return;
    }
    if (door.locked) {
      if (byPlayer) {
        const left = this.totalEnemies - this.kills - this.bossRoomCount();
        if (left > 0) {
          this.tell(byPlayer, `Locked. Clear the office first: ${left} coworker${left > 1 ? 's' : ''} left.`, 'locked');
          return;
        }
        door.locked = false;
        this.announce(`The boss office is open. ${ENEMY_TYPES.beard.name} is waiting.`);
      } else return;
    }
    if (door.state === 'closed' || door.state === 'closing') {
      door.state = 'opening';
      this.sound('door');
      // the boss behind this door: his song starts the moment it opens
      const boss = this.enemies.find(e => e.t.door === door.key && e.hp > 0);
      if (boss && this.songBoss !== boss) {
        this.songBoss = boss;
        if (boss.t.greet) this.announce(boss.t.greet);
      }
    }
    door.timer = 4;
  },

  // coworkers behind the boss doors don't count towards "clear the office first"
  bossRoomCount() {
    return this.enemies.filter(e => e.hp > 0
      && ['Boss office', 'Red Corner', "Agamemnov's Hall"].includes(zoneAt(this.L, e.x, e.y))).length;
  },

  // a boss (not the last one) down: full heal, his song stops and the next sealed door opens
  bossDown(e) {
    const p = this.player;
    if (!p.dead) p.hp = 100;
    this.washG = 0.5;
    Sound.play('pickup');
    if (e.t.song) BossMusic.stop();
    Net.send({ t: 'heal' });      // everyone in co-op
    this.announce(`${e.t.name} is down! You are fully healed...`);
    if (e.t.opensMsg) this.announce(e.t.opensMsg);
    const rd = this.L.doors.find(d => d.key === e.t.opens);
    if (rd) rd.locked = false;
    this.computeFlow();
  },

  updateDoors(dt) {
    for (const d of this.L.doors) {
      if (d.state === 'opening') {
        d.open = Math.min(1, d.open + dt * 1.8);
        if (d.open >= 1) { d.state = 'open'; d.timer = 4; }
      } else if (d.state === 'open') {
        d.timer -= dt;
        if (d.timer <= 0) {
          const occupied = [...this.players(), ...this.enemies.filter(e => e.hp > 0)]
            .some(e => Math.floor(e.x) === d.x && Math.floor(e.y) === d.y);
          if (!occupied) { d.state = 'closing'; this.sound('door'); } else d.timer = 1;
        }
      } else if (d.state === 'closing') {
        const occupied = [...this.players(), ...this.enemies.filter(e => e.hp > 0)]
          .some(e => Math.abs(e.x - (d.x + 0.5)) < 0.5 + e.r && Math.abs(e.y - (d.y + 0.5)) < 0.5 + e.r);
        if (occupied) { d.state = 'opening'; continue; }
        d.open = Math.max(0, d.open - dt * 1.8);
        if (d.open <= 0) d.state = 'closed';
      }
    }
  },

  // ------------------------------------------------------------------
  // player
  // ------------------------------------------------------------------
  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) return;
    const k = Input.keys, pad = Input.pad, tc = Input.touch;
    const turn = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    const [mdx, mdy] = Input.takeMouse();
    p.a += turn * 2.4 * dt + mdx * 0.0011 * Settings.sens + pad.rx * 3.2 * dt * Settings.sens;
    p.pitch = Math.max(-100, Math.min(100, p.pitch - mdy * 0.5 * Settings.sens - pad.ry * 160 * dt * Settings.sens));
    // jump (Space) and crouch (hold C)
    if (Input.pressed('Space') && p.z <= 0 && p.crouch < 0.5) { p.vz = 3.4; Sound.play('jump'); }
    if (p.z > 0 || p.vz > 0) {
      p.vz -= 13 * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        if (p.vz < -2) { p.land = 1; Sound.play('land'); }
        p.z = 0; p.vz = 0;
      }
    }
    const crouchTarget = k.KeyC || pad.crouch || tc.crouch ? 1 : 0;
    p.crouch += (crouchTarget - p.crouch) * Math.min(1, dt * 12);
    p.land = Math.max(0, p.land - dt * 5);
    p.kick = Math.max(0, p.kick - dt * 60);
    // the left stick (and the touch thumb stick) is analog: a half-pushed stick walks at half speed
    const fwd = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0) - pad.ly - tc.ly;
    const str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + pad.lx + tc.lx;
    const speed = (k.ShiftLeft || k.ShiftRight || pad.run || tc.run ? 5.2 : 3.6) * (1 - 0.5 * p.crouch) * dt;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    let mx = (ca * fwd - sa * str), my = (sa * fwd + ca * str);
    const ml = Math.hypot(mx, my);
    p.moving = ml > 0;
    if (ml > 0) {
      const s = Math.min(1, ml);
      mx = mx / ml * s * speed; my = my / ml * s * speed;
      this.move(p, mx, my);
      p.bob += dt * 9 * s;
    }
    // push out of enemies (and the other players in co-op)
    for (const e of [...this.enemies, ...Net.active()]) {
      if (e.hp <= 0 || e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), m = p.r + e.r;
      if (d < m && d > 0.001) this.move(p, dx / d * (m - d), dy / d * (m - d));
    }
    // use doors
    if (Input.pressed('KeyE')) {
      for (const reach of [0.8, 1.3]) {
        const cx = Math.floor(p.x + ca * reach), cy = Math.floor(p.y + sa * reach);
        const d = this.L.doorAt[cy * this.L.w + cx];
        if (d && Net.guest) { Net.toHost({ t: 'use', i: this.L.doors.indexOf(d) }); break; }
        if (d) { this.openDoor(d, p); break; }
      }
    }
    // weapon switching
    for (const [name, w] of Object.entries(WEAPONS)) {
      if (Input.pressed('Digit' + w.slot) && p.has[name]) this.switchWeapon(name);
    }
    const wheel = Input.takeWheel();
    if (wheel) {
      const owned = Object.keys(WEAPONS).filter(n => p.has[n]);
      const i = owned.indexOf(p.weapon);
      this.switchWeapon(owned[(i + (wheel > 0 ? 1 : owned.length - 1)) % owned.length]);
    }
    // firing
    p.fireT -= dt;
    p.shotT += dt;
    const w = WEAPONS[p.weapon];
    if (Input.fireHeld() && p.fireT <= 0) {
      if (p.ammo[w.ammo] >= (w.use || 1)) this.fire(w);
      else if (p.fireT < -0.3) {
        Sound.play('click');
        p.fireT = 0.4;
        const alt = Object.keys(WEAPONS).reverse()
          .find(n => p.has[n] && p.ammo[WEAPONS[n].ammo] >= (WEAPONS[n].use || 1));
        if (alt) this.switchWeapon(alt);
      }
    }
    // pickups
    for (const it of this.L.pickups) {
      if (it.taken || it.mine || (it.x - p.x) ** 2 + (it.y - p.y) ** 2 > 0.36) continue;
      if (!this.pickup(it.type)) continue;
      Sound.play('pickup');
      this.washG = 0.25;
      // in co-op every player gets each gun once: it stays there for the others
      if (Net.coop && WEAPONS[it.type]) { it.mine = true; continue; }
      it.taken = true;
      if (Net.guest) {
        it.pendT = this.time + 1.5;       // until the host's snapshots say it's gone
        Net.toHost({ t: 'take', i: this.L.pickups.indexOf(it) });
      }
    }
  },

  switchWeapon(name) {
    const p = this.player;
    if (p.weapon === name) return;
    p.weapon = name;
    p.fireT = Math.max(p.fireT, 0.25);
    p.shotT = 9;
  },

  fire(w) {
    const p = this.player;
    p.ammo[w.ammo] -= w.use || 1;
    p.fireT = w.cool;
    p.shotT = 0;
    p.shots++;
    p.flip = !p.flip;
    p.kick = w.kick;
    Engine.flash = w.proj === 'pplasma' ? 0.2 : 0.35;
    Sound.play(w.sound);
    this.noise = 0.2;
    if (w.proj) {
      const pt = PROJ_TYPES[w.proj];
      const a = p.a + rand(-0.01, 0.01);
      const pr = { kind: w.proj, x: p.x + Math.cos(a) * 0.35, y: p.y + Math.sin(a) * 0.35,
        vx: Math.cos(a) * pt.speed, vy: Math.sin(a) * pt.speed, owner: p, t: 0,
        dmg: randi(w.dmg[0], w.dmg[1]), splash: w.splash || 0 };
      // a guest's rockets fly in the host's world; they show up with the next snapshot
      if (Net.guest) Net.toHost({ t: 'proj', kind: pr.kind, x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, dmg: pr.dmg, splash: pr.splash });
      else this.projs.push(pr);
      return;
    }
    for (let i = 0; i < w.pellets; i++) {
      const a = p.a + rand(-w.spread, w.spread);
      this.hitscan(p.x, p.y, a, randi(w.dmg[0], w.dmg[1]), null);
    }
  },

  // ray from (x, y) at angle a; hits the closest enemy (or the player) before a wall.
  // Your own shots (shooter null) also hit the other players in co-op: friendly fire
  hitscan(x, y, a, dmg, shooter) {
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = Engine.castDist(this.L, x, y, dx, dy, 40);
    let best = null, bestT = wall;
    const targets = shooter ? [shooter.tgt || this.player]
      : [...this.enemies.filter(e => e.hp > 0), ...Net.active().filter(r => !r.dead)];
    for (const e of targets) {
      const ex = e.x - x, ey = e.y - y;
      const t = ex * dx + ey * dy;
      if (t <= 0 || t >= bestT) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp < (e.hitR || 0.3)) { best = e; bestT = t; }
    }
    const hx = x + dx * (bestT - 0.05), hy = y + dy * (bestT - 0.05);
    if (best && best.isPlayer) {
      if (!shooter) this.addFx(hx, hy, 'blood', 0.75, 0.16);
      this.hurtAny(best, dmg, shooter || this.player);
    } else if (best) {
      this.addFx(hx, hy, 'blood', 0.75, 0.16);
      if (Net.guest) {
        Net.toHost({ t: 'hit', e: this.enemies.indexOf(best), dmg });
        this.target = best;
        this.targetT = 3;
      } else this.hurtEnemy(best, dmg);
    } else if (!shooter) {
      this.addFx(hx, hy, 'puff', rand(0.7, 1.1), 0.12);
    }
  },

  pickup(type) {
    const p = this.player;
    switch (type) {
      case 'medkit': if (p.hp >= 100) return false; p.hp = Math.min(100, p.hp + 25); this.say('Picked up a first aid kit.'); return true;
      case 'coffee': if (p.hp >= 100) return false; p.hp = Math.min(100, p.hp + 10); this.say('Coffee. Productivity +10.'); return true;
      case 'clip': if (p.ammo.bullets >= AMMO_MAX.bullets) return false; p.ammo.bullets = Math.min(AMMO_MAX.bullets, p.ammo.bullets + 15); this.say('Picked up a clip.'); return true;
      case 'shells': if (p.ammo.shells >= AMMO_MAX.shells) return false; p.ammo.shells = Math.min(AMMO_MAX.shells, p.ammo.shells + 6); this.say('Picked up some shells.'); return true;
      case 'armor': if (p.armor >= 100) return false; p.armor = 100; this.say('Picked up body armor.'); return true;
      case 'shotgun': p.has.shotgun = true; p.ammo.shells = Math.min(AMMO_MAX.shells, p.ammo.shells + 8); this.switchWeapon('shotgun'); this.say('You got the SHOTGUN! (2)'); return true;
      case 'rifle': p.has.rifle = true; p.ammo.bullets = Math.min(AMMO_MAX.bullets, p.ammo.bullets + 40); this.switchWeapon('rifle'); this.say('You got the ASSAULT RIFLE! (5)'); return true;
      case 'dbshotgun': p.has.dbshotgun = true; p.ammo.shells = Math.min(AMMO_MAX.shells, p.ammo.shells + 10); this.switchWeapon('dbshotgun'); this.say('You got the SUPER SHOTGUN! (3)'); return true;
      case 'rocketl': p.has.rocketl = true; p.ammo.rockets = Math.min(AMMO_MAX.rockets, p.ammo.rockets + 6); this.switchWeapon('rocketl'); this.say('You got the ROCKET LAUNCHER! (6)'); return true;
      case 'plasmagun': p.has.plasmagun = true; p.ammo.cells = Math.min(AMMO_MAX.cells, p.ammo.cells + 60); this.switchWeapon('plasmagun'); this.say('You got the PLASMA RIFLE! (7)'); return true;
      case 'rockets': if (p.ammo.rockets >= AMMO_MAX.rockets) return false; p.ammo.rockets = Math.min(AMMO_MAX.rockets, p.ammo.rockets + 5); this.say('Picked up rockets.'); return true;
      case 'cells': if (p.ammo.cells >= AMMO_MAX.cells) return false; p.ammo.cells = Math.min(AMMO_MAX.cells, p.ammo.cells + 40); this.say('Picked up an energy cell.'); return true;
      case 'chaingun': p.has.chaingun = true; p.ammo.bullets = Math.min(AMMO_MAX.bullets, p.ammo.bullets + 30); this.switchWeapon('chaingun'); this.say('You got the CHAINGUN! (4)'); return true;
    }
    return false;
  },

  hurtPlayer(dmg, src) {
    const p = this.player;
    if (p.dead) return;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.floor(dmg / 3));
      p.armor -= absorbed;
      dmg -= absorbed;
    }
    p.hp -= dmg;
    this.washR = Math.min(0.45, this.washR + dmg / 60);
    Sound.play('hurt');
    if (src) this.lastHitBy = src;
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      Sound.play('playerdie');
      Main.onDeath();
    }
  },

  // remote: another co-op player's hit (the HUD keeps showing your own target)
  hurtEnemy(e, dmg, remote) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    if (!remote) {
      this.target = e;
      this.targetT = 3;
    }
    if (e.state === 'idle') this.wake(e);
    if (e.t.enrage && !e.enraged && e.hp > 0 && e.hp < e.t.hp / 2) {
      e.enraged = true;
      this.announce(`${e.t.name} is enraged!`);
    }
    if (e.hp <= 0) {
      e.state = 'dying'; e.st = 0;
      this.kills++;
      this.sound(e.t.boss ? 'bossdie' : 'die');
      if (e.t.final) {
        this.announce(`${e.t.name} is down!`);
        BossMusic.stop();
        Main.onWin();
        Net.send({ t: 'win', stats: Main.winStats });
      } else if (e.t.boss) this.bossDown(e);
      else if (this.totalEnemies - this.kills - this.bossRoomCount() === 0) {
        this.announce('Office cleared. The boss office door is unlocked.');
        const bd = this.L.doors.find(d => d.locked && d.key === 'L');
        if (bd) bd.locked = false;
        this.computeFlow();
      }
    } else if (Math.random() < e.t.pain && e.state !== 'pain') {
      e.state = 'pain'; e.st = 0;
      this.sound('pain');
    }
  },

  wake(e) {
    if (e.state !== 'idle') return;
    e.state = 'chase';
    e.st = 0;
    e.cool = rand(0.8, 2.2);          // reaction time before the first shot
    this.sound('sight');
  },

  // ------------------------------------------------------------------
  // enemies
  // ------------------------------------------------------------------
  updateEnemies(dt) {
    const players = this.livePlayers();
    for (const e of this.enemies) {
      e.st += dt;
      e.animT += dt;
      const p = e.tgt = this.nearest(e, players);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
      switch (e.state) {
        case 'idle': {
          const noise = p === this.player ? this.noise : p.noise;
          const heard = noise > 0 && (dist < 5 || (dist < 12 && zoneAt(this.L, e.x, e.y) === zoneAt(this.L, p.x, p.y)));
          if (heard || (dist < 18 && this.sees(e.x, e.y, p.x, p.y))) this.wake(e);
          e.frame = 'idle';
          break;
        }
        case 'chase': {
          e.cool -= dt;
          const see = !p.dead && this.sees(e.x, e.y, p.x, p.y);
          if (see && e.cool <= 0 && dist < e.t.range) {
            e.state = 'attack'; e.st = 0; e.fired = 0;
            break;
          }
          this.walk(e, dt, see, dist);
          const walkFrames = e.t.seated ? ['walk1', 'walk2', 'walk3', 'walk4'] : ['walk1', 'walk2', 'walk3', 'walk2'];
          e.frame = walkFrames[Math.floor(e.animT / (e.t.seated ? 0.14 : 0.17)) % walkFrames.length];
          break;
        }
        case 'attack': {
          const windup = e.t.kind === 'melee' ? 0.25 : 0.4;
          e.frame = e.st < windup ? 'attack1' : 'attack2';
          const shots = e.t.burst || 1;
          if (e.st >= windup && e.fired < shots && e.st >= windup + e.fired * 0.18) {
            this.enemyAttack(e, dist);
            e.fired++;
          }
          if (e.st > windup + 0.3 + (shots - 1) * 0.18) {
            e.state = 'chase'; e.st = 0;
            e.cool = rand(e.t.cool[0], e.t.cool[1]) * (e.enraged ? 0.6 : 1);
          }
          break;
        }
        case 'pain':
          e.frame = 'pain';
          if (e.st > 0.28) { e.state = 'chase'; e.st = 0; }
          break;
        case 'dying': {
          const f = Math.min(3, Math.floor(e.st / 0.14));
          e.frame = 'death' + (f + 1);
          if (e.st > 0.6) e.state = 'dead';
          break;
        }
        case 'dead':
          e.frame = 'death4';
          break;
      }
    }
    // keep living enemies apart
    const live = this.enemies.filter(e => e.hp > 0);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d < m && d > 0.001) {
          const push = (m - d) / 2;
          this.move(a, -dx / d * push, -dy / d * push);
          this.move(b, dx / d * push, dy / d * push);
        }
      }
    }
  },

  walk(e, dt, see, dist) {
    const p = e.tgt || this.player;
    let tx, ty;
    if (see && dist < 4) {
      tx = p.x; ty = p.y;
    } else {
      // step to the neighbouring cell closest to the player on the flow field
      const L = this.L, cx = Math.floor(e.x), cy = Math.floor(e.y);
      let best = this.flow[cy * L.w + cx], bx = cx, by = cy;
      if (best < 0) best = 1e9;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const v = this.flow[ny * L.w + nx];
        if (v < 0 || v >= best) continue;
        if (ox && oy && (!this.walkable(cx + ox, cy) || !this.walkable(cx, cy + oy))) continue;
        best = v; bx = nx; by = ny;
      }
      tx = bx + 0.5; ty = by + 0.5;
      // open doors on the way
      const di = by * L.w + bx;
      if (L.doorAt[di]) this.openDoor(L.doorAt[di], false);
    }
    // a little side-to-side so they don't line up in a queue
    e.strafeT -= dt;
    if (e.strafeT <= 0) { e.strafe = rand(-0.6, 0.6); e.strafeT = rand(0.6, 1.4); }
    let mx = tx - e.x, my = ty - e.y;
    const ml = Math.hypot(mx, my);
    if (ml < 0.05) return;
    mx /= ml; my /= ml;
    const sx = -my * e.strafe, sy = mx * e.strafe;
    if (dist < 1.2 && e.t.kind === 'melee') return;
    if (dist < 0.7) return;
    const sp = e.t.speed * (e.enraged ? 1.3 : 1) * dt;
    this.move(e, (mx + sx * 0.4) * sp, (my + sy * 0.4) * sp);
  },

  enemyAttack(e, dist) {
    const p = e.tgt || this.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    this.sound(e.t.sound, Math.max(0.15, 1 - dist / 20));
    if (e.t.kind === 'melee') {
      if (dist < e.t.range + 0.25) this.hurtAny(p, randi(e.t.dmg[0], e.t.dmg[1]), e);
    } else if (e.t.kind === 'hitscan') {
      for (let i = 0; i < e.t.pellets; i++) {
        const acc = Math.min(0.7, Math.max(0.25, 0.85 - dist / 16)) * (1 - 0.25 * p.crouch);
        if (Math.random() < acc) this.hitscan(e.x, e.y, a + rand(-0.02, 0.02), randi(e.t.dmg[0], e.t.dmg[1]), e);
      }
    } else {
      // COMMUNIST SANDRO alternates: hammer, sickle, hammer...
      let kind = e.t.proj;
      if (e.t.throws) { const n = e.throwN || 0; e.throwN = n + 1; kind = e.t.throws[n % e.t.throws.length]; }
      const pt = PROJ_TYPES[kind];
      const lead = rand(-0.05, 0.05);
      // THE AGAMEMNOV throws a fan of spears every `volley`th time
      const n = e.attackN = (e.attackN || 0) + 1;
      const fan = e.t.volley && n % e.t.volley === 0 ? [-0.18, 0, 0.18] : [0];
      for (const off of fan) {
        this.projs.push({ kind, x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4,
          vx: Math.cos(a + lead + off) * pt.speed, vy: Math.sin(a + lead + off) * pt.speed, owner: e, t: 0,
          dmg: randi(e.t.dmg[0], e.t.dmg[1]), splash: e.t.splash || 0 });
      }
    }
  },

  // ------------------------------------------------------------------
  // projectiles + effects
  // ------------------------------------------------------------------
  updateProjs(dt) {
    const players = this.livePlayers();
    for (const pr of this.projs) {
      pr.t += dt;
      const mine = !!pr.owner.isPlayer;       // any player's, in co-op too
      const remote = pr.owner !== this.player;
      const steps = 4;
      for (let s = 0; s < steps && !pr.dead; s++) {
        pr.x += pr.vx * dt / steps;
        pr.y += pr.vy * dt / steps;
        const hitWall = this.blocked(Math.floor(pr.x), Math.floor(pr.y));
        let hitEnemy = null, hitPlayer = null;
        if (mine) {
          for (const e of this.enemies) {
            if (e.hp > 0 && (pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 < (e.hitR + 0.1) ** 2) { hitEnemy = e; break; }
          }
          // friendly fire: a player's rockets and plasma hit the other players too
          if (!hitEnemy) {
            hitPlayer = players.find(p => p !== pr.owner && (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 < (p.r + 0.12) ** 2) || null;
          }
        } else {
          // crouching ducks under fireballs and plasma (not rockets: they explode)
          hitPlayer = players.find(p => !(p.crouch > 0.7 && pr.kind !== 'rocket')
            && (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 < (p.r + 0.12) ** 2) || null;
        }
        if (!(hitWall || hitPlayer || hitEnemy || pr.t > 6)) continue;
        pr.dead = true;
        const sp = Math.hypot(pr.vx, pr.vy);
        const back = hitWall ? 0.12 : 0;
        const ex = pr.x - pr.vx / sp * back, ey = pr.y - pr.vy / sp * back;
        if (hitPlayer) this.hurtAny(hitPlayer, pr.dmg, pr.owner);
        if (hitEnemy) this.hurtEnemy(hitEnemy, pr.dmg, remote);
        if (pr.splash) {
          // the blast hurts every player near: a player's rocket at 40% (the shooter too), the coworkers' at 80%
          for (const p of players) {
            if (p === hitPlayer || p.dead) continue;
            const d = Math.hypot(p.x - ex, p.y - ey);
            if (d < pr.splash) {
              this.hurtAny(p, Math.round(pr.dmg * (1 - d / pr.splash) * (mine ? 0.4 : 0.8)), p === pr.owner ? null : pr.owner);
            }
          }
          if (mine) {
            for (const e of this.enemies) {
              if (e === hitEnemy || e.hp <= 0) continue;
              const de = Math.hypot(e.x - ex, e.y - ey);
              if (de < pr.splash && this.sees(ex, ey, e.x, e.y)) this.hurtEnemy(e, Math.round(pr.dmg * (1 - de / pr.splash)), remote);
            }
          }
          Engine.flash = 0.4;
        }
        const kind = PROJ_TYPES[pr.kind].hit;
        this.addFx(ex, ey, kind, 0.6, kind === 'zap' ? 0.4 : (pr.splash ? 1.0 : 0.55));
        this.sound(PROJ_TYPES[pr.kind].hitSound || (kind === 'zap' ? 'zaphit' : 'explode'), 0.7);
      }
    }
    this.projs = this.projs.filter(pr => !pr.dead);
  },

  addFx(x, y, kind, lift, h) {
    const frames = { puff: 3, blood: 3, explode: 3, zap: 3 }[kind];
    this.fx.push({ x, y, kind, lift, h, t: 0, frames, dur: kind === 'explode' ? 0.36 : 0.24 });
    if (Net.coop && Net.host) Net.out.fx.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100, kind, lift, h]);
  },

  // the people on the street: the rider scoots up and down, the other two idle, smoke, steam and talk
  updateNpcs(dt) {
    const p = this.player;
    for (const n of this.L.npcs) {
      const N = n.n;
      if (N.path) {
        const dir = Math.cos(n.facing) > 0 ? 1 : -1;
        const nx = n.x + dir * N.speed * dt;
        if (nx > N.path[1] || nx < N.path[0]) n.facing = dir > 0 ? Math.PI : 0;
        else if ((nx - p.x) ** 2 + (n.y - p.y) ** 2 >= (n.r + p.r + 0.05) ** 2) n.x = nx;   // waits if you're in the way
      }
      if (N.beats) {
        n.beatT -= dt;
        if (n.beatT <= 0) {
          n.frame = (n.frame + 1) % N.frames.length;
          n.beatT = N.beats[n.frame] * rand(0.8, 1.2);
          // breathes out after a drag
          if (N.smoke && n.frame === 0) for (let i = 0; i < 4; i++) this.addVapor('smoke', n.x, n.y, 0, 0.98, 0.1, i * 0.18);
        }
        n.tex = Assets.get('npc/' + N.frames[n.frame]);
      }
      if (N.smoke && n.frame === 0) {
        n.puffT -= dt;
        if (n.puffT <= 0) { n.puffT = 0.7; this.addVapor('smoke', n.x, n.y, 0.27, 0.46, 0.08, 0); }   // from the cigarette
      }
      if (N.line) {
        const near = !p.dead && Math.hypot(n.x - p.x, n.y - p.y) < N.talkR && this.sees(p.x, p.y, n.x, n.y);
        n.talk = Math.max(0, Math.min(1, n.talk + (near ? dt * 4 : -dt * 3)));
      }
    }
    // the BMW's engine is boiling over
    for (const d of this.L.decor) {
      if (d.type !== 'bmw') continue;
      d.steamT = (d.steamT || 0) - dt;
      if (d.steamT <= 0) {
        d.steamT = rand(0.15, 0.3);
        const fx = d.x + Math.cos(d.facing) * 1.2, fy = d.y + Math.sin(d.facing) * 1.2;
        this.addVapor('steam', fx + rand(-0.25, 0.25), fy + rand(-0.35, 0.35), 0, 0.62, rand(0.12, 0.18), 0);
      }
    }
    for (const v of this.vapor) {
      v.t += dt;
      if (v.t < 0) continue;
      v.z += v.vz * dt; v.x += v.vx * dt; v.y += v.vy * dt;
    }
    this.vapor = this.vapor.filter(v => v.t < v.dur);
  },

  // side: offset to the right as seen by the player, so smoke stays at the hand of a billboard sprite
  addVapor(kind, x, y, side, z, h, delay) {
    const steam = kind === 'steam';
    this.vapor.push({ kind, x, y, side, z, h, t: -delay, dur: steam ? rand(1.0, 1.4) : 1.6,
      vz: steam ? rand(0.5, 0.8) : 0.22, vx: rand(-0.08, 0.08), vy: rand(-0.08, 0.08) });
  },

  updateFx(dt) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);
    this.noise = Math.max(0, this.noise - dt);
    this.washR = Math.max(0, this.washR - dt * 0.9);
    this.washG = Math.max(0, this.washG - dt * 0.8);
    Engine.flash = Math.max(0, Engine.flash - dt * 2.5);
    for (const m of this.msgs) m.t -= dt;
    this.msgs = this.msgs.filter(m => m.t > 0);
    this.targetT -= dt;
  },

  updateLights() {
    const L = this.L;
    const t = this.time;
    for (let i = 0; i < L.light.length; i++) {
      const f = L.flicker[i];
      if (!f) continue;
      // blocky flicker: cells in the same 3x3 block flicker together
      const x = i % L.w, y = (i / L.w) | 0;
      const seed = ((x / 3) | 0) * 13 + ((y / 3) | 0) * 7;
      const n = Math.sin(t * 7 + seed) * Math.sin(t * 13.3 + seed * 1.7);
      L.light[i] = L.baseLight[i] * (1 - f * (n > 0.55 ? 1 : n * 0.3));
    }
  },

  // ------------------------------------------------------------------
  update(dt) {
    this.updatePlayer(dt);
    this.updateWorld(dt);
  },

  // everything but your own player: runs on while you're dead (and in co-op while you're paused)
  updateWorld(dt) {
    this.time += dt;
    if (Net.guest) {
      // the host runs the coworkers, doors and projectiles; between snapshots the projectiles fly on
      for (const pr of this.projs) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.t += dt; }
    } else {
      this.flowT -= dt;
      if (this.flowT <= 0) { this.computeFlow(); this.flowT = 0.3; }
      this.updateDoors(dt);
      this.updateEnemies(dt);
      this.updateProjs(dt);
    }
    this.updateFx(dt);
    this.updateNpcs(dt);
    this.updateLights();
    const fighting = this.enemies.filter(e => (e.state === 'chase' || e.state === 'attack')
      && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 14).length;
    Music.setIntensity(Math.min(1, fighting / 3));
    const p = this.player;
    // a boss's song starts when his door opens (or he wakes up some other way) and plays until he dies
    const sb = this.songBoss && this.songBoss.hp > 0 ? this.songBoss
      : this.enemies.find(e => e.t.song && e.hp > 0 && e.state !== 'idle');
    if (sb && !p.dead) BossMusic.play(sb.t.song);
    // what is the crosshair on? (HUD shows that coworker's face)
    const dx = Math.cos(p.a), dy = Math.sin(p.a);
    const wall = Engine.castDist(this.L, p.x, p.y, dx, dy, 30);
    let best = null, bestT = wall;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const ex = e.x - p.x, ey = e.y - p.y, t = ex * dx + ey * dy;
      if (t > 0 && t < bestT && Math.abs(ex * dy - ey * dx) < e.hitR) { best = e; bestT = t; }
    }
    if (best) { this.target = best; this.targetT = 1.5; }
  },

  // sprite list for the renderer (viewOf is below Game)
  sprites() {
    const out = [];
    const t = this.time;
    const p = this.player;
    for (const d of this.L.decor) {
      let tex = d.anim ? Assets.get('prop/' + d.anim[Math.floor(t * 8) % d.anim.length]) : d.tex;
      if (d.anim && Math.sin(t * 3 + d.x) < -0.3) continue;   // sparks come and go
      let flip = false;
      if (d.dirs) {
        // car side pictures show the front on the left, so the far side is flipped
        const v = viewOf(d, p);
        tex = Assets.get('prop/' + d.dirs[v.view]);
        flip = v.view === 1 && v.rel > 0;
      }
      out.push({ x: d.x, y: d.y, tex, h: d.h, lift: d.lift, bright: d.bright, flip });
    }
    for (const n of this.L.npcs) {
      let tex = n.tex, flip = false;
      if (n.n.dirs) {
        // the rider's side picture faces right, the other way round from the cars
        const v = viewOf(n, p);
        tex = Assets.get('npc/' + n.n.dirs[v.view]);
        flip = v.view === 1 && v.rel < 0;
      }
      out.push({ x: n.x, y: n.y, tex, h: n.h, lift: 0, flip });
    }
    // steam and smoke: `side` is to the player's right, smoke sits a little in front of the smoker
    const rx = -Math.sin(p.a), ry = Math.cos(p.a), fx = -Math.cos(p.a), fy = -Math.sin(p.a);
    for (const v of this.vapor) {
      if (v.t < 0) continue;
      const f = Math.min(2, Math.floor(v.t / v.dur * 3));
      const near = v.kind === 'smoke' ? 0.08 : 0;
      const h = v.h * (1 + 0.8 * v.t / v.dur);
      out.push({ x: v.x + v.side * rx + near * fx, y: v.y + v.side * ry + near * fy,
        tex: Assets.get('fx/' + v.kind + '_' + f), h, lift: v.z - h / 2 });
    }
    for (const it of this.L.pickups) {
      if (!it.taken && !it.mine) out.push({ x: it.x, y: it.y, tex: it.tex, h: it.h, lift: 0 });
    }
    // the other players in co-op: a coworker sprite in their own colour
    for (const r of Net.active()) {
      const frame = r.dead ? 'death4' : r.shotT < 0.15 ? 'attack2'
        : r.moving ? ['walk1', 'walk2', 'walk3', 'walk2'][Math.floor(r.animT / 0.17) % 4] : 'idle';
      const [tintR, tintG, tintB] = playerTint(r.slot);
      out.push({ x: r.x, y: r.y, tex: Assets.get(PLAYER_SKIN + '/' + frame), h: 1.25 - (r.dead ? 0 : 0.3 * r.crouch),
        lift: r.z, tintR, tintG, tintB });
    }
    for (const e of this.enemies) {
      const tex = Assets.get(e.type + '/' + e.frame);
      // death frames are 2x wider but the same pixel scale
      out.push({ x: e.x, y: e.y, tex, h: e.h, lift: 0 });
    }
    for (const pr of this.projs) {
      const pt = PROJ_TYPES[pr.kind];
      out.push({ x: pr.x, y: pr.y, tex: Assets.get(pt.frames[Math.floor(pr.t * 10) % pt.frames.length]), h: pt.h,
        lift: 0.72, bright: true });
    }
    for (const f of this.fx) {
      const i = Math.min(f.frames - 1, Math.floor(f.t / f.dur * f.frames));
      out.push({ x: f.x, y: f.y, tex: Assets.get('fx/' + f.kind + '_' + i), h: f.h, lift: f.lift - f.h / 2,
        bright: f.kind !== 'blood' });
    }
    return out;
  },
};

// which side of a thing with `facing` the viewer sees: view 0 = front, 1 = side, 2 = rear;
// rel > 0 means its front points to the viewer's right
function viewOf(d, p) {
  let rel = Math.atan2(p.y - d.y, p.x - d.x) - d.facing;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const ar = Math.abs(rel);
  return { view: ar < Math.PI / 4 ? 0 : (ar > 3 * Math.PI / 4 ? 2 : 1), rel };
}
