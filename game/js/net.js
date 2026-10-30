// Online co-op. The page looks for the co-op server (server.js) on port NET_PORT of the computer it was
// loaded from, or wherever `?server=host:port` in the page address says. If it's there, the title screen
// offers PLAY ONLINE next to PLAY ALONE. The first one in is the host: their browser runs the coworkers,
// doors, pickups and projectiles and sends the others snapshots of it 20 times a second. The others
// move and aim on their own screen and send the host their shots, rockets, door presses and pickups.
// Without a server (or opened as a file) the game is single player as before.
'use strict';

const NET_PORT = 6363;
const NET_HZ = 20;
const PLAYER_SKIN = 'irakli';
const PLAYER_TINTS = [[0.55, 1.35, 0.95], [0.6, 0.9, 1.6], [1.5, 1.3, 0.5], [1.5, 0.65, 1.25]];
const PLAYER_COLORS = ['#44da9d', '#6f9dff', '#f0c040', '#ff7ad0'];
const E_STATES = ['idle', 'chase', 'attack', 'pain', 'dying', 'dead'];
const D_STATES = ['closed', 'opening', 'open', 'closing'];

const playerTint = slot => PLAYER_TINTS[(slot - 1) % PLAYER_TINTS.length];
const playerColor = slot => PLAYER_COLORS[(slot - 1) % PLAYER_COLORS.length];
const r2 = v => Math.round(v * 100) / 100;

const Net = {
  ws: null, on: false, id: 0, slot: 1, hostId: 0, remotes: {}, sendT: 0, hostStarted: false,
  lobby: null,        // { players, max, full } while the server is there and we haven't joined
  out: { fx: [], snd: [], msgs: [] },     // the host's world events since the last snapshot

  get host() { return !this.on || this.id === this.hostId; },
  get guest() { return this.on && this.id !== this.hostId; },
  // playing together right now (someone else is connected)
  get coop() { return this.on && Object.keys(this.remotes).length > 0; },
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

  join() { this.send({ t: 'join' }); },

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  toHost(m) { m.to = this.hostId; this.send(m); },

  addRemote(id, slot) {
    this.remotes[id] = { id, slot, remote: true, isPlayer: true, r: 0.24, hitR: 0.3, x: 0, y: 0, a: 0, z: 0, crouch: 0,
      hp: 100, dead: false, on: false, moving: false, weapon: 'pistol', shots: 0, shotT: 9, animT: 0, noise: 0 };
  },

  recv(m) {
    const G = Game, from = this.remotes[m.from];
    switch (m.t) {
      case 'lobby': if (!this.on) this.lobby = { players: m.players, max: m.max, full: m.players >= m.max }; break;
      case 'full': if (this.lobby) this.lobby.full = true; Main.joining = false; break;
      case 'welcome':
        this.on = true; this.id = m.id; this.slot = m.slot; this.hostId = m.host; this.lobby = null;
        for (const p of m.players) this.addRemote(p.id, p.slot);
        break;
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
      if (r.tx === undefined) continue;
      if (Math.abs(r.tx - r.x) + Math.abs(r.ty - r.y) > 3) { r.x = r.tx; r.y = r.ty; }
      else { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; }
    }
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
};
