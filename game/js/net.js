// Online. The page looks for the server (server.js) on port NET_PORT of the computer it was loaded
// from, or wherever `?server=host:port` in the page address says. If it's there, the title screen
// offers PLAY ONLINE and BATTLE ROYALE next to PLAY ALONE.
//
// Two different arrangements, because the two games want different things:
//
//   co-op          peer to peer through a relay. The first one in is the host: their browser runs the
//                  coworkers, doors, pickups and projectiles and sends the others snapshots 20 times
//                  a second. The others move and aim on their own screen and send the host their
//                  shots, rockets, door presses and pickups.
//   battle royale  the server is the referee. It owns who is alive, who shot whom and where the ring
//                  is; this sends it where we are and what we shot at, and draws what comes back.
//
// Without a server (or opened as a file) the game is single player as before.
'use strict';

const NET_PORT = 6363;
const NET_HZ = 20;
// co-op recolours one coworker sprite per player; the battle royale gives everyone
// their own colleague instead, and only tints the slots that had to double up
const PLAYER_SKIN = 'irakli';
const PLAYER_TINTS = [[0.55, 1.35, 0.95], [0.6, 0.9, 1.6], [1.5, 1.3, 0.5], [1.5, 0.65, 1.25]];
const E_STATES = ['idle', 'chase', 'attack', 'pain', 'dying', 'dead'];
const D_STATES = ['closed', 'opening', 'open', 'closing'];

const playerTint = slot => PLAYER_TINTS[(slot - 1) % PLAYER_TINTS.length];
const playerColor = slot => slotColor(slot);        // SLOT_COLORS in mode.js, fifteen of them
const r2 = v => Math.round(v * 100) / 100;

const Net = {
  ws: null, on: false, id: 0, slot: 1, hostId: 0, remotes: {}, sendT: 0, hostStarted: false,
  mode: 'coop',       // which game we joined: 'coop' (relayed, peer-run) or 'br' (server-run)
  lobby: null,        // { players, max, br, full } while the server is there and we haven't joined
  out: { fx: [], snd: [], msgs: [] },     // the host's world events since the last snapshot
  q: 0,               // our own tick counter, echoed back so the server can time our round trip

  // "runs its own world": true alone, true in a battle royale (there are no coworkers
  // to run, and the server owns everything else), and only for the host in co-op
  get host() { return !this.on || this.mode === 'br' || this.id === this.hostId; },
  get guest() { return this.on && this.mode === 'coop' && this.id !== this.hostId; },
  // playing co-op together right now (someone else is connected)
  get coop() { return this.on && this.mode === 'coop' && Object.keys(this.remotes).length > 0; },
  get br() { return this.on && this.mode === 'br'; },
  // the others who are in the game (not on the title screen)
  active() {
    const out = [];
    for (const id in this.remotes) { const r = this.remotes[id]; if (r.on && r.tx !== undefined) out.push(r); }
    return out;
  },

  // ws://<page's computer>:6363/ws, or `?server=host:port` (or a full ws:// / wss:// address)
  serverUrl() {
    let s = null;
    try { s = new URLSearchParams(location.search).get('server'); } catch (e) { /* old browser */ }
    if (s) return /^wss?:\/\//.test(s) ? s : 'ws://' + s.replace(/\/+$/, '') + '/ws';
    if (!location.hostname) return null;      // opened as a file
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':' + NET_PORT + '/ws';
  },

  // connects as a watcher (the title screen shows who's playing); join() goes into the game
  connect() {
    const url = this.serverUrl();
    if (!url || this.ws) return;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return; }
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      this.recv(m);
    };
    ws.onclose = () => {
      const was = this.on;
      this.ws = null; this.on = false; this.lobby = null; this.remotes = {};
      if (was) Game.say('Lost the connection to the server. Playing alone now.');
      // look again in a while, for as long as someone could still pick PLAY ONLINE
      setTimeout(() => { if (Main.state === 'title') this.connect(); }, 5000);
    };
    this.ws = ws;
  },

  join() { this.mode = 'coop'; this.send({ t: 'join' }); },

  // battle royale: say who we are, then wait for 'welcome' and the lobby
  joinBr(name, skin) {
    this.mode = 'br';
    this.send({ t: 'hello', mode: 'br', name, skin });
  },

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  toHost(m) { m.to = this.hostId; this.send(m); },

  addRemote(id, slot, extra) {
    this.remotes[id] = Object.assign({ id, slot, remote: true, isPlayer: true, r: 0.24, hitR: 0.3,
      x: 0, y: 0, a: 0, z: 0, crouch: 0, hp: 100, dead: false, deadT: 0, on: false, moving: false,
      weapon: 'pistol', shots: 0, shotT: 9, animT: 0, noise: 0, aboard: false,
      skin: PLAYER_SKIN, name: 'P' + slot, dup: false }, extra || {});
    return this.remotes[id];
  },

  recv(m) {
    const G = Game, from = this.remotes[m.from];
    switch (m.t) {
      case 'lobby':
        if (!this.on) this.lobby = { players: m.players, max: m.max, full: m.players >= m.max, br: m.br };
        break;
      case 'full': if (this.lobby) this.lobby.full = true; Main.joining = false; break;
      case 'nobr':
        if (this.lobby) this.lobby.br = null;
        Main.joining = false;
        break;
      case 'welcome':
        this.on = true; this.id = m.id; this.slot = m.slot; this.lobby = null;
        if (m.mode === 'br') {
          this.mode = 'br';
          BR.myName = m.name; BR.mySkin = m.skin;
          if (m.map) BR_MAP_NAME = m.map;      // before Game.start('br') builds it
        } else {
          this.mode = 'coop';
          this.hostId = m.host;
          for (const p of m.players) this.addRemote(p.id, p.slot);
        }
        break;

      // ---- battle royale: the server is the referee ----
      case 'blobby': this.brLobby(m); break;
      case 'match': this.brMatch(m); break;
      case 'S': this.brSnap(m); break;
      case 'you': BR.onYou(m); break;
      case 'jumped':
        // the server has us out of the plane; it owns where from
        if (G.player) { G.player.x = m.x; G.player.y = m.y; }
        BR.aboard = false; BR.falling = true; BR.fallT = 0; BR.z = m.z;
        break;
      case 'fix':
        // we were somewhere we could not have got to; the server wins
        if (G.player) { G.player.x = m.x; G.player.y = m.y; }
        break;
      case 'end': this.brEnd(m); break;
      case 'join': this.addRemote(m.id, m.slot); G.say(`P${m.slot} joined the game.`); break;
      case 'leave': {
        const r = this.remotes[m.id];
        delete this.remotes[m.id];
        if (r) G.say(`P${r.slot} left the game.`);
        break;
      }
      case 'host':
        this.hostId = m.id;
        if (m.id === this.id) this.becomeHost();
        break;
      case 'p': if (from) this.applyRemote(from, m); break;

      // host -> guests
      case 'snap': if (m.from === this.hostId && this.guest) this.applySnap(m); break;
      case 'hurt':
        if (['play', 'win', 'paused'].includes(Main.state)) {
          G.hurtPlayer(m.dmg, m.by ? { friendly: true, slot: m.by } : G.enemies[m.src] || null);
        }
        break;
      case 'heal':
        BossMusic.stop();
        if (!G.player.dead) { G.player.hp = 100; G.washG = 0.5; Sound.play('pickup'); }
        break;
      case 'msg': G.say(m.text); if (m.snd) Sound.play(m.snd); break;
      case 'win':
        BossMusic.stop();
        Main.winStats = m.stats;
        if (Main.state !== 'title') {
          if (G.player.dead) G.respawn();
          Main.setState('win');
        }
        break;
      case 'restart':
        if (m.from !== this.hostId) break;
        G.start();
        if (Main.state !== 'title') Main.setState('play');
        break;

      // guests -> host
      case 'hit': {
        const e = G.enemies[m.e];
        if (this.host && e && from) G.hurtEnemy(e, m.dmg, true);
        break;
      }
      case 'proj':
        if (this.host && from && PROJ_TYPES[m.kind]) {
          G.projs.push({ kind: m.kind, x: m.x, y: m.y, vx: m.vx, vy: m.vy, owner: from, t: 0, dmg: m.dmg, splash: m.splash || 0 });
        }
        break;
      case 'use': {
        const d = G.L.doors[m.i];
        if (this.host && d && from) G.openDoor(d, from);
        break;
      }
      case 'take': {
        const it = G.L.pickups[m.i];
        if (this.host && it) it.taken = true;
        break;
      }
      case 'restartReq': if (this.host && Main.state === 'win') Main.restart(); break;
    }
  },

  // ---------------- battle royale ----------------
  // The roster: everyone in the lobby, their name, their colleague, whether they are
  // ready. Two people sharing a skin get flagged so one of them can be tinted.
  brLobby(m) {
    BR.state = m.state;
    BR.stateT = m.ct;
    BR.roster = m.roster;
    BR.min = m.min; BR.max = m.max; BR.countdown = m.countdown; BR.wait = m.wait;
    const seen = {};
    for (const e of m.roster) {
      const dup = !!seen[e.skin];
      seen[e.skin] = true;
      if (e.id === this.id) { BR.mySkin = e.skin; BR.myName = e.name; BR.ready = e.ready; continue; }
      const r = this.remotes[e.id] || this.addRemote(e.id, e.slot);
      r.slot = e.slot; r.name = e.name; r.skin = e.skin; r.dup = dup;
    }
    for (const id in this.remotes) {
      if (!m.roster.some(e => String(e.id) === id)) delete this.remotes[id];
    }
  },

  // a match is starting (or we walked in on one)
  brMatch(m) {
    BR.spawn = m.spawn;
    BR.kit = m.kit;
    BR.seed = m.seed;
    BR.spectating = !!m.spectate;
    BR.plane = m.plane || null;
    BR.fall = m.fall || null;
    BR.planeT = m.plane ? m.plane.t : 0;
    BR.state = m.plane ? 'plane' : 'live';
    if (m.ring) BR.ring = Object.assign({ tx: m.ring.cx, ty: m.ring.cy, tr: m.ring.r,
      phase: 0, shrinking: false, left: 0, dps: 0 }, m.ring);
    Main.onBrMatch();
  },

  // 20 Hz: where everyone is, where the ring is, and what just happened
  brSnap(m) {
    const G = Game;
    BR.state = m.st;
    BR.stateT = m.ct;
    BR.alive = m.alive;
    BR.onRing(m.r);
    if (m.pl) {
      // the plane's own clock wins over ours, which only runs between snapshots
      if (Math.abs(m.pl[0] - BR.planeT) > 0.25) BR.planeT = m.pl[0];
      BR.aboardN = m.pl[1];
    }
    const here = {};
    for (const [id, x, y, a, hp, flags, shots, wIdx, z] of m.p) {
      here[id] = true;
      if (id === this.id) continue;
      const r = this.remotes[id] || this.addRemote(id, id);
      if (r.tx === undefined) { r.x = x; r.y = y; }
      r.tx = x; r.ty = y; r.a = a; r.hp = hp; r.z = z || 0;
      r.on = true;
      const wasDead = r.dead;
      r.dead = !!(flags & 1);
      if (r.dead && !wasDead) r.deadT = 0;
      r.moving = !!(flags & 2);
      r.crouch = (flags & 4) ? 1 : 0;
      r.frozen = !!(flags & 8);
      r.aboard = !!(flags & 16);
      const w = Rules_wname(wIdx);
      if (w) r.weapon = w;
      // their gun went off: you hear it, and so do you know roughly where they are
      if (shots > r.shots && !r.dead) {
        r.shotT = 0;
        const d = Math.hypot(r.x - G.player.x, r.y - G.player.y);
        if (d < 30) {
          Sound.play(WEAPONS[r.weapon].sound, Math.max(0.08, 1 - d / 30));
          BR.nearbyFire = 1.5;
        }
      }
      r.shots = shots;
    }
    for (const e of m.e) {
      if (e[0] === 'k') BR.onKill(e[1], e[2], e[3], e[4]);
      else if (e[0] === 'm') G.say(e[1]);
    }
  },

  brEnd(m) {
    BR.board = m.board;
    BR.winner = m.winner;
    BR.state = 'over';
    Main.onBrEnd();
  },

  applyRemote(r, m) {
    if (r.tx === undefined) { r.x = m.x; r.y = m.y; }
    r.tx = m.x; r.ty = m.y; r.a = m.a; r.z = m.z; r.crouch = m.c; r.hp = m.hp;
    r.dead = !!m.dead; r.moving = !!m.m; r.on = !!m.on;
    if (WEAPONS[m.w]) r.weapon = m.w;
    // their gun goes off: you hear it, and so do the coworkers near them
    if (m.s > r.shots && r.on && Main.state !== 'title') {
      r.shotT = 0;
      r.noise = 0.2;
      const d = Math.hypot(r.x - Game.player.x, r.y - Game.player.y);
      Sound.play(WEAPONS[r.weapon].sound, Math.max(0.1, 1 - d / 20));
    }
    r.shots = m.s;
  },

  // the host's world: coworkers, doors and pickups line up by index, since everyone builds the same level
  applySnap(m) {
    const G = Game;
    if (!G.L) return;
    this.hostStarted = !!m.started;
    m.e.forEach(([x, y, hp, st, frame, enraged], i) => {
      const e = G.enemies[i];
      if (!e) return;
      e.nx = x; e.ny = y; e.hp = hp; e.state = E_STATES[st] || 'idle'; e.frame = frame; e.enraged = !!enraged;
    });
    m.d.forEach(([open, st, locked], i) => {
      const d = G.L.doors[i];
      if (!d) return;
      d.open = open; d.state = D_STATES[st] || 'closed'; d.locked = !!locked;
    });
    G.L.pickups.forEach((it, i) => { it.taken = m.pk[i] === '1' || it.pendT > G.time; });
    G.projs = m.pr.map(([kind, x, y, vx, vy, t]) => ({ kind, x, y, vx, vy, t, owner: null }));
    G.kills = m.k;
    G.songBoss = m.sb >= 0 ? G.enemies[m.sb] : null;
    for (const [x, y, kind, lift, h] of m.fx) G.addFx(x, y, kind, lift, h);
    if (Main.state !== 'title') {
      for (const [name, vol] of m.snd) Sound.play(name, vol);
      for (const text of m.msgs) G.say(text);
    }
  },

  snapshot() {
    const G = Game;
    this.send({
      t: 'snap', started: Main.state !== 'title',
      e: G.enemies.map(e => [r2(e.x), r2(e.y), Math.ceil(e.hp), E_STATES.indexOf(e.state), e.frame, e.enraged ? 1 : 0]),
      d: G.L.doors.map(d => [r2(d.open), D_STATES.indexOf(d.state), d.locked ? 1 : 0]),
      pk: G.L.pickups.map(it => it.taken ? '1' : '0').join(''),
      pr: G.projs.map(p => [p.kind, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), r2(p.t)]),
      k: G.kills, sb: G.songBoss ? G.enemies.indexOf(G.songBoss) : -1,
      fx: this.out.fx, snd: this.out.snd, msgs: this.out.msgs,
    });
    this.out = { fx: [], snd: [], msgs: [] };
  },

  // the host left: carry on from the last snapshot, running the world here now
  becomeHost() {
    const G = Game;
    for (const e of G.enemies) if (e.nx !== undefined) { e.x = e.nx; e.y = e.ny; }
    G.projs = [];
    G.computeFlow();
    G.say('The host left. Your computer runs the office now.');
  },

  // every frame, whatever the screen
  update(dt) {
    if (!this.on) return;
    const G = Game, k = Math.min(1, dt * 15);
    for (const id in this.remotes) {
      const r = this.remotes[id];
      r.animT += dt; r.shotT += dt; r.noise = Math.max(0, r.noise - dt);
      if (r.dead) r.deadT += dt;
      if (r.tx === undefined) continue;
      if (Math.abs(r.tx - r.x) + Math.abs(r.ty - r.y) > 3) { r.x = r.tx; r.y = r.ty; }
      else { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; }
    }
    if (this.mode === 'br') { this.brSend(dt); return; }
    if (this.guest) {
      for (const e of G.enemies) {
        if (e.nx === undefined) continue;
        if (Math.abs(e.nx - e.x) + Math.abs(e.ny - e.y) > 3) { e.x = e.nx; e.y = e.ny; }
        else { e.x += (e.nx - e.x) * k; e.y += (e.ny - e.y) * k; }
      }
    }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / NET_HZ;
    const p = G.player;
    this.send({ t: 'p', on: Main.state !== 'title' && Main.state !== 'loading' ? 1 : 0,
      x: r2(p.x), y: r2(p.y), a: r2(p.a), z: r2(p.z), c: r2(p.crouch), hp: Math.ceil(p.hp),
      dead: p.dead ? 1 : 0, m: p.moving ? 1 : 0, w: p.weapon, s: p.shots });
    if (this.host && this.coop) this.snapshot();
  },

  // Battle royale: all we ever send is where we are and what we are doing. Shots go
  // separately, the moment the trigger is pulled (see Game.fire).
  brSend(dt) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / NET_HZ;
    const p = Game.player;
    if (!p) return;
    this.q++;
    const z = BR.aboard || BR.falling ? BR.z : p.z;
    this.send({ t: 'i', q: this.q, x: r2(p.x), y: r2(p.y), a: r2(p.a), z: r2(z),
      c: r2(p.crouch), m: p.moving ? 1 : 0, w: p.weapon });
  },
};

// the weapon names in the order the server indexes them (see Rules.wnames there)
const WNAMES = Object.keys(WEAPONS);
const Rules_wname = i => WNAMES[i] || null;
