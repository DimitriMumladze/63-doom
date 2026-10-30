// Input, screen states and the main loop.
'use strict';

const IS_XBOX = /Xbox/i.test(navigator.userAgent);
const TOUCH_LOOK = 5;        // a finger drag turns this many times more than the same mouse move
const STICK_R = 50;          // touch thumb stick radius in CSS pixels

// Edge on Xbox also sends the controller as keyboard events (key "GamepadA", keyCode 195-218)
const isPadKey = e => (e.key && e.key.startsWith('Gamepad')) || (e.keyCode >= 195 && e.keyCode <= 218);

const Input = {
  keys: {}, down: {}, mouseDX: 0, mouseDY: 0, lastDX: 0, wheel: 0, mouseFire: false, locked: false,
  // controller (standard mapping, e.g. an Xbox pad in Edge on Xbox), polled once per frame
  pad: { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, run: false, crouch: false },
  padPrev: [], gp: null, padBlocked: false, lastKey: '',
  // touch screen: thumb stick, buttons and a drag-to-look finger, tracked by pointerId
  touch: { lx: 0, ly: 0, fire: false, run: false, crouch: false },
  stickId: null, stickX: 0, stickY: 0, lookId: null, lookX: 0, lookY: 0,
  mode: 'mouse',      // 'mouse' | 'pad' | 'touch': decides prompts, cursor, pointer lock and the touch overlay
  get usingPad() { return this.mode === 'pad'; },

  init(canvas) {
    // old Edge on Xbox drives a mouse cursor with the pad unless the page asks for raw gamepad input
    try { navigator.gamepadInputEmulation = 'gamepad'; } catch (e) { /* not Xbox */ }
    if (IS_XBOX) this.setMode('pad');
    else if (window.matchMedia && matchMedia('(pointer: coarse)').matches) this.setMode('touch');
    window.addEventListener('keydown', e => {
      this.lastKey = e.key + ' / ' + e.code + ' / ' + e.keyCode;
      // the Gamepad API already handles these; also keeps B from going "back" and A from clicking
      if (isPadKey(e)) { e.preventDefault(); return; }
      if (!IS_XBOX) this.setMode('mouse');
      if (!this.keys[e.code]) this.down[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyM' && !e.repeat) SideBar.toggleMusic();
    });
    window.addEventListener('keyup', e => { if (isPadKey(e)) { e.preventDefault(); return; } this.keys[e.code] = false; });
    window.addEventListener('blur', () => this.releaseAll());
    // pointer events say what made them, unlike the mouse events a phone fakes after a tap
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') this.setMode('touch');
      else if (e.pointerType === 'mouse' && !IS_XBOX) this.setMode('mouse');
    }, true);
    window.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());     // iOS pinch zoom
    this.initTouch();
    canvas.addEventListener('mousedown', e => { if (e.button === 0 && this.mode === 'mouse') this.mouseFire = true; });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseFire = false; });
    window.addEventListener('mousemove', e => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    window.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && Main.state === 'play' && Main.hadLock) Main.setState('paused');
    });
  },
  pressed(code) { const v = !!this.down[code]; this.down[code] = false; return v; },

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    document.body.classList.toggle('pad', m === 'pad');
    document.body.classList.toggle('touch', m === 'touch');
    if (m !== 'touch') this.clearTouch();
    const lbl = document.getElementById('sensLbl');
    if (lbl) lbl.textContent = m === 'mouse' ? 'MOUSE' : 'LOOK';
    if (m !== 'mouse' && document.pointerLockElement) document.exitPointerLock();
  },

  clearPad() {
    const s = this.pad;
    s.lx = s.ly = s.rx = s.ry = 0;
    s.fire = s.run = s.crouch = false;
  },

  clearTouch() {
    const t = this.touch;
    t.lx = t.ly = 0;
    t.fire = t.run = t.crouch = false;
    this.stickId = this.lookId = null;
    const box = document.getElementById('touch');
    if (box) {
      box.classList.remove('stick');
      for (const b of box.querySelectorAll('button.on')) b.classList.remove('on');
    }
  },

  // focus lost, tab hidden: nothing may stay held down
  releaseAll() { this.keys = {}; this.mouseFire = false; this.clearPad(); this.clearTouch(); },

  // the on-screen controls: a floating thumb stick on the left 45%, drag-to-look on the rest
  initTouch() {
    const box = document.getElementById('touch');
    if (!box) return;
    const base = document.getElementById('tBase'), knob = document.getElementById('tKnob');
    const t = this.touch;
    const place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
    box.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.45 && this.stickId === null) {
        this.stickId = e.pointerId; this.stickX = e.clientX; this.stickY = e.clientY;
        place(base, e.clientX, e.clientY); place(knob, e.clientX, e.clientY);
        box.classList.add('stick');
      } else if (this.lookId === null) {
        this.lookId = e.pointerId; this.lookX = e.clientX; this.lookY = e.clientY;
      } else return;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    });
    box.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) {
        let dx = (e.clientX - this.stickX) / STICK_R, dy = (e.clientY - this.stickY) / STICK_R;
        const m = Math.hypot(dx, dy);
        t.run = m > 1.25;                          // dragged well past the rim: run
        if (m > 1) { dx /= m; dy /= m; }
        const k = m < 0.15 ? 0 : 1;                // deadzone
        t.lx = dx * k; t.ly = dy * k;
        place(knob, this.stickX + dx * STICK_R, this.stickY + dy * STICK_R);
      } else if (e.pointerId === this.lookId) {
        this.mouseDX += (e.clientX - this.lookX) * TOUCH_LOOK;
        this.mouseDY += (e.clientY - this.lookY) * TOUCH_LOOK;
        this.lookX = e.clientX; this.lookY = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId === this.stickId) {
        this.stickId = null; t.lx = t.ly = 0; t.run = false;
        box.classList.remove('stick');
      } else if (e.pointerId === this.lookId) this.lookId = null;
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // buttons: FIRE is held, DUCK toggles, the rest are presses like the keyboard's
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        down(el);
      });
      const off = e => { e.stopPropagation(); if (up) up(el); };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('click', e => e.stopPropagation());
    };
    btn('tFire', el => { t.fire = true; el.classList.add('on'); }, el => { t.fire = false; el.classList.remove('on'); });
    btn('tJump', () => { this.down.Space = true; });
    btn('tUse', () => { this.down.KeyE = true; });
    btn('tWeapon', () => { this.wheel++; });
    btn('tCrouch', el => { t.crouch = !t.crouch; el.classList.toggle('on', t.crouch); });
    btn('tPause', () => { if (Main.state === 'play') Main.setState('paused'); });
  },

  // radial deadzone with a squared response curve, so small stick moves aim finely
  stick(x, y, dead) {
    const m = Math.hypot(x, y);
    if (m < dead) return 0;
    const k = Math.min(1, (m - dead) / (1 - dead));
    return k * k / m;
  },

  pollPad() {
    // getGamepads throws (or is missing) outside a secure context in some browsers
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    this.padBlocked = !pads;
    let gp = null;
    if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    this.gp = gp;
    if (!gp) { this.clearPad(); return; }
    const s = this.pad, b = gp.buttons, ax = gp.axes;
    const held = i => !!b[i] && (b[i].pressed || b[i].value > 0.4);
    const fl = this.stick(ax[0] || 0, ax[1] || 0, 0.18);
    const fr = this.stick(ax[2] || 0, ax[3] || 0, 0.15);
    s.lx = (ax[0] || 0) * fl; s.ly = (ax[1] || 0) * fl;
    s.rx = (ax[2] || 0) * fr; s.ry = (ax[3] || 0) * fr;
    s.fire = held(7);                  // RT
    s.run = held(6) || held(10);       // LT or left stick click
    s.crouch = held(1);                // B
    let active = fl > 0 || fr > 0;
    for (let i = 0; i < b.length && i < 17; i++) {
      const now = held(i);
      if (now) active = true;
      if (now && !this.padPrev[i]) this.padPress(i);
      this.padPrev[i] = now;
    }
    if (active) this.setMode('pad');
  },

  // button presses become the same "pressed" events the keyboard makes; Pad0 / Pad9 drive the menus
  padPress(i) {
    // a pad press is not a user gesture to the browser, so this may not unlock audio; Main.unlock retries on real ones
    Main.unlock();
    this.down['Pad' + i] = true;
    if (i === 0) this.down.Space = true;                     // A     jump
    else if (i === 2) this.down.KeyE = true;                 // X     doors
    else if (i === 3 || i === 5 || i === 12) this.wheel++;   // Y, RB, d-pad up: next weapon
    else if (i === 4 || i === 13) this.wheel--;              // LB, d-pad down: previous weapon
    else if (i === 8 && Main.state !== 'win') SideBar.toggleMusic();  // View (restarts once won)
    else if (i === 11) Main.showFps = !Main.showFps;         // right stick click
  },
  takeMouse() {
    const v = [this.mouseDX, this.mouseDY];
    this.lastDX = this.mouseDX;
    this.mouseDX = 0; this.mouseDY = 0;
    return v;
  },
  takeWheel() { const v = this.wheel; this.wheel = 0; return v; },
  fireHeld() { return this.mouseFire || this.keys.ControlLeft || this.keys.ControlRight || this.pad.fire || this.touch.fire; },
  endFrame() { this.down = {}; },
};

const Main = {
  canvas: null, g: null, state: 'loading', stateT: 0, last: 0, hadLock: false, winStats: null, wantFull: false,
  fps: 0, fpsAcc: 0, fpsN: 0, showFps: false,
  // title screen choice when the server is there: 0 PLAY ALONE, 1 PLAY ONLINE, 2 BATTLE ROYALE
  menu: 0,
  joining: false,     // PLAY ONLINE picked, waiting for the server (and the host's first snapshot)
  joiningBr: false,   // BATTLE ROYALE picked, waiting for the server to let us into the lobby

  async boot() {
    const canvas = this.canvas = document.getElementById('screen');
    this.g = canvas.getContext('2d');
    Engine.init(canvas);
    Input.init(canvas);
    Settings.load();
    SideBar.init();
    window.addEventListener('resize', () => this.fit());
    this.fit();
    Hud.drawLoading(this.g, 0, 1);
    await Assets.load((d, n) => Hud.drawLoading(this.g, d, n));
    Game.start();
    this.setState('title');
    Net.connect();
    canvas.addEventListener('click', e => this.onClick(e));
    // only real gestures (key, click, tap) may start audio or go fullscreen; try on every one until it works
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
      window.addEventListener(ev, () => this.unlock(), true);
    }
    // Xbox guide / home button or a tab switch: pause, so nothing is held down and no huge dt on return
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      Input.releaseAll();
      if (this.state === 'play') this.setState('paused');
    });
    // B is "back" in the Xbox browser; keep one history entry in hand so it pauses instead of leaving
    try {
      history.pushState({ game: 1 }, '');
      window.addEventListener('popstate', () => {
        history.pushState({ game: 1 }, '');
        if (this.state === 'play') this.setState('paused');
      });
    } catch (e) { /* file:// in some browsers */ }
    document.getElementById('restartBtn').addEventListener('click', e => { e.currentTarget.blur(); Sound.init(); this.restart(); });
    // a hidden tab gets no animation frames, but in co-op the others still need the office (and you) in it
    setInterval(() => {
      if (!document.hidden || !Net.coop) return;
      const now = performance.now(), dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      if (this.state !== 'title' && this.state !== 'loading') Game.updateWorld(dt);
      Net.update(dt);
    }, 1000 / NET_HZ);
    requestAnimationFrame(t => this.loop(t));
  },

  fit() {
    // TVs crop the picture edges, so on Xbox keep the HUD inside the safe area
    const s = (IS_XBOX ? 0.95 : 1) * Math.min(window.innerWidth / VW, window.innerHeight / SCREEN_H);
    this.canvas.style.width = Math.floor(VW * s) + 'px';
    this.canvas.style.height = Math.floor(SCREEN_H * s) + 'px';
  },

  setState(s) {
    this.state = s;
    this.stateT = 0;
    document.body.classList.toggle('playing', s === 'play' || s === 'win' || s === 'spectate');
    document.body.classList.toggle('won', s === 'win');
    if (s === 'paused') BossMusic.stop(false);     // resumes where it was once play starts again
    if (s === 'dead') BossMusic.stop();
  },

  lock() {
    // a controller or a finger has no use for a captured mouse (and Xbox would show an "Esc to exit" banner)
    if (Input.mode !== 'mouse') return;
    try {
      const r = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
      this.hadLock = true;
    } catch (e) { /* playing with arrow keys is fine too */ }
  },

  // audio, the boss song and (once asked for) fullscreen all need a user gesture
  unlock() {
    Sound.init();
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume().catch(() => {});
    if (this.wantFull) this.fullscreen();
  },

  soundBlocked() { return !!Sound.ctx && Sound.ctx.state !== 'running'; },

  onClick(e) {
    Sound.init();
    SideBar.apply();
    // on the title screen a click on PLAY ALONE / PLAY ONLINE picks it
    if (this.state === 'title' && e) {
      const r = this.canvas.getBoundingClientRect();
      const b = Hud.titleButtonAt((e.clientX - r.left) * VW / r.width, (e.clientY - r.top) * SCREEN_H / r.height);
      if (b >= 0) this.menu = b;
    }
    if (this.state === 'title' || this.state === 'paused' || this.state === 'dead') this.advance();
    else if ((this.state === 'play' || this.state === 'win') && !Input.locked) this.lock();
  },

  // title -> play, paused -> play, dead -> restart; from a mouse click or the A / Menu buttons
  advance() {
    SideBar.apply();
    if (this.state === 'title') {
      if (Net.on || this.joining || this.joiningBr) { /* already on the way in */ }
      else if (Net.lobby && this.menu === 2) {
        if (Net.lobby.br && Net.lobby.br.players < Net.lobby.br.max) this.joinBattleRoyale();
      } else if (Net.lobby && this.menu === 1) {
        if (!Net.lobby.full) this.joinOnline();
      } else this.startGame();
    } else if (this.state === 'lobby') {
      Net.send({ t: 'ready', v: BR.ready ? 0 : 1 });
      BR.ready = !BR.ready;
    } else if (this.state === 'results') {
      /* the server takes everyone back to the lobby when it is done */
    } else if (this.state === 'paused') {
      this.lock();
      this.setState('play');
    } else if (this.state === 'dead' && this.stateT > 1) {
      // in co-op the others play on: come back in at the front door
      if (Net.coop) {
        Game.respawn();
        this.setState('play');
        this.lock();
      } else this.restart();
    }
    Input.down = {};      // the A press that started the game must not also jump
  },

  startGame(modeId) {
    Game.start(modeId || 'campaign');
    Sound.play('start');
    this.wantFull = Input.mode !== 'mouse';
    this.fullscreen();
    this.lock();
    this.setState('play');
  },

  // PLAY ONLINE: the game starts once the server lets us in (see loop); the click is the gesture
  // the mouse lock and fullscreen need, so ask for them now
  joinOnline() {
    this.joining = true;
    this.joinT = 0;
    Net.join();
    this.wantFull = Input.mode !== 'mouse';
    this.fullscreen();
    this.lock();
  },

  // BATTLE ROYALE: into the lobby, where you pick your colleague and say you are ready.
  // The server starts the match; onBrMatch puts us in it.
  joinBattleRoyale() {
    this.joiningBr = true;
    this.joinT = 0;
    Net.joinBr(Settings.playerName, Settings.playerSkin);
    this.wantFull = Input.mode !== 'mouse';
    this.fullscreen();
  },

  // in the lobby there is a world to look at behind the panel, so build the yard now
  toBrLobby() {
    this.joiningBr = false;
    if (!Game.L || Game.L.name !== 'yard') Game.start('br');
    this.setState('lobby');
    if (document.pointerLockElement) document.exitPointerLock();
  },

  onBrMatch() {
    Game.start('br');
    if (BR.spectating) {
      this.setState('spectate');
      Game.say('A match is already running. Watching.');
      return;
    }
    Sound.play('start');
    this.setState('play');
    this.lock();
  },

  onBrDeath() {
    this.setState('dead');
    this.deadT = 0;
  },

  onBrEnd() {
    this.setState('results');
    if (document.pointerLockElement) document.exitPointerLock();
  },

  // on a TV or a phone the browser bar wastes space; not done for mouse players.
  // Without a gesture (a pad press) it fails, and unlock() retries on the next real one.
  fullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { this.wantFull = false; return; }       // iPhone: "Add to Home Screen" instead
    if (document.fullscreenElement || document.webkitFullscreenElement) { this.wantFull = false; return; }
    if (Input.mode === 'mouse') return;
    try {
      const r = req.call(el);
      const landscape = () => {
        this.wantFull = false;
        if (Input.mode === 'touch' && screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      };
      if (r && r.then) r.then(landscape, () => {});
      else landscape();
    } catch (e) { /* not allowed without a gesture */ }
  },

  // in co-op only the host restarts, for everyone; a guest asks the host
  restart() {
    if (Net.br) return;            // the server runs the matches; it will start the next one
    if (Net.guest) { Net.toHost({ t: 'restartReq' }); return; }
    Game.start();
    Net.send({ t: 'restart' });
    this.setState('play');
    this.lock();
  },

  onDeath() { this.setState('dead'); },

  // cycle through the colleagues nobody else has taken
  pickSkin(dir) {
    const taken = new Set(BR.roster.filter(e => e.id !== Net.id).map(e => e.skin));
    const free = SKINS.filter(id => !taken.has(id));
    if (!free.length) return;
    const i = free.indexOf(BR.mySkin);
    const next = free[((i < 0 ? 0 : i + dir) + free.length) % free.length];
    BR.mySkin = next;
    Settings.playerSkin = next;
    Settings.save();
    Net.send({ t: 'skin', id: next });
  },

  leaveBr() {
    if (Net.ws) Net.ws.close();
    this.setState('title');
    this.menu = 0;
    Game.start('campaign');
  },

  onWin() {
    const t = Math.floor(Game.time);
    this.winStats = { kills: Game.kills, total: Game.totalEnemies, time: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` };
    this.setState('win');
  },

  loop(now) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.stateT += dt;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    Input.pollPad();
    if (Input.pressed('F3')) this.showFps = !this.showFps;
    if (this.state === 'title') {
      // PLAY ALONE / PLAY ONLINE / BATTLE ROYALE: arrows, A / D or the d-pad choose,
      // Enter (or click, or A) goes
      const n = Net.lobby && Net.lobby.br ? 3 : 2;
      if (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('Pad14')) {
        this.menu = (this.menu + n - 1) % n;
      }
      if (Input.pressed('ArrowRight') || Input.pressed('KeyD') || Input.pressed('Pad15')) {
        this.menu = (this.menu + 1) % n;
      }
      if (Input.pressed('Enter')) this.advance();
      if (this.joining) {
        this.joinT += dt;
        // in once the server says so; a guest also waits for the host's world to arrive
        if (Net.on && (Net.host || Net.hostStarted)) { this.joining = false; this.startGame(); }
        else if (!Net.ws || this.joinT > 10) { this.joining = false; if (Net.on) Net.ws.close(); }
      }
      if (this.joiningBr) {
        this.joinT += dt;
        if (Net.br) this.toBrLobby();
        else if (!Net.ws || this.joinT > 10) { this.joiningBr = false; if (Net.on) Net.ws.close(); }
      }
    } else if (this.state === 'lobby') {
      // pick which colleague you are, and say you are ready
      const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') || Input.pressed('Pad15')) ? 1
        : (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('Pad14')) ? -1 : 0;
      if (dir) this.pickSkin(dir);
      if (Input.pressed('Enter') || Input.pressed('KeyR')) this.advance();
      if (Input.pressed('Escape')) this.leaveBr();
    } else if (this.state === 'spectate' || (this.state === 'dead' && Net.br)) {
      // watching: fire or the arrows move you between the people still standing
      if (Input.pressed('ArrowRight') || Input.pressed('KeyD') || Input.pressed('Pad15')) BR.nextSpec(1);
      if (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('Pad14')) BR.nextSpec(-1);
      if (Input.pressed('Space')) BR.nextSpec(1);
      if (this.state === 'dead' && this.stateT > 3) this.setState('spectate');
    } else if (this.state === 'results') {
      if (BR.state === 'lobby') this.toBrLobby();
    }
    if (this.state === 'win' && (Input.pressed('KeyR') || Input.pressed('Pad8'))) this.restart();
    if (Input.pressed('Pad9')) {                       // Menu: pause / resume / start
      if (this.state === 'play') this.setState('paused');
      else this.advance();
    } else if (this.state !== 'play' && this.state !== 'win' && Input.pressed('Pad0')) this.advance();

    const g = this.g, p = Game.player;
    if (this.state === 'play' || this.state === 'win') Game.update(dt);
    else if (this.state === 'dead' || this.state === 'spectate' || this.state === 'results'
      || this.state === 'lobby' || (this.state === 'paused' && Net.coop)) {
      if (Game.L) Game.updateWorld(dt);
    }
    Net.update(dt);
    // camera: title screen slowly drifts along the street in front of the office
    // eye height: crouch lowers it, jumping raises it, landing dips it
    let cam = { x: p.x, y: p.y, a: p.a, horizon: CY + p.pitch + p.kick * 0.25,
      eyeZ: EYE - 0.4 * p.crouch + p.z - 0.08 * Math.sin(p.land * Math.PI) };
    const ring = Net.br && this.state !== 'title' && this.state !== 'lobby' ? BR.ring : null;
    if (this.state === 'title') {
      cam = { x: 14 + Math.sin(this.stateT * 0.12) * 7, y: 41.2, a: -Math.PI / 2 + Math.sin(this.stateT * 0.2) * 0.8 };
      Game.time += dt;
      Game.updateNpcs(dt);
      Game.updateLights();
    } else if (this.state === 'lobby') {
      // the yard, turning slowly behind the lobby panel
      const L = Game.L;
      cam = { x: L.w / 2, y: L.h / 2 + 6, a: -Math.PI / 2 + Math.sin(this.stateT * 0.1) * 0.9 };
    } else if (this.state === 'spectate' || this.state === 'results') {
      // over the shoulder of whoever is still standing
      const t = BR.specTarget();
      if (t) cam = { x: t.x, y: t.y, a: t.a, horizon: CY, eyeZ: EYE };
    }
    cam.ring = ring;
    cam.ringTime = Game.time;
    Engine.render(cam, Game.L, Game.sprites());
    if (this.state === 'play' || this.state === 'paused' || this.state === 'win') this.drawWeapon();
    Engine.wash(255, 0, 0, Game.washR);
    Engine.wash(255, 220, 90, Game.washG);
    Engine.present();
    g.fillStyle = '#000';
    g.fillRect(0, VH, VW, SCREEN_H - VH);
    if (this.state !== 'title' && this.state !== 'lobby') { Hud.drawBar(g); }
    if (this.state === 'play' || this.state === 'win') { Hud.drawBubbles(g); Hud.drawView(g); }
    if (Net.br && (this.state === 'play' || this.state === 'spectate' || this.state === 'dead')) {
      Hud.drawBrView(g);
    }
    if (this.state === 'title') Hud.drawTitle(g, this.stateT);
    if (this.state === 'lobby') Hud.drawBrLobby(g, this.stateT);
    if (this.state === 'spectate') Hud.drawSpectate(g);
    if (this.state === 'results') Hud.drawBrResults(g, this.stateT);
    if (this.state === 'paused') Hud.drawPaused(g);
    if (this.state === 'dead') Hud.drawDead(g, this.stateT);
    if (this.state === 'win') Hud.drawWin(g, this.stateT, this.winStats);
    if (this.showFps) Hud.text(g, this.fps + ' FPS', 4, VH - 12, 8, '#0f0');
    if (location.hash === '#padtest') Hud.drawPadTest(g);
    Input.endFrame();
    requestAnimationFrame(t => this.loop(t));
  },

  drawWeapon() {
    const p = Game.player;
    const w = WEAPONS[p.weapon];
    let frame = 0;
    if (w.auto) {
      if (p.shotT < w.cool + 0.02) frame = p.flip ? 1 : 2;
    } else {
      for (const [t0, t1, f] of w.seq) if (p.shotT >= t0 && p.shotT < t1) frame = f;
    }
    const tex = Assets.get('wep/' + p.weapon + '_' + frame);
    // bob while walking, sway against mouse movement, recoil, crouch and landing
    this.sway = (this.sway || 0) * 0.85 + Math.max(-18, Math.min(18, -Input.lastDX * 0.4)) * 0.15;
    const bob = p.moving && p.z <= 0 ? Math.sin(p.bob) : 0;
    const ox = bob * 7 + this.sway;
    const oy = Math.abs(bob) * 6 + 6 + p.kick * 0.8 + p.crouch * 10 + Math.sin(p.land * Math.PI) * 10 - p.vz * 2;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const li = cy * Game.L.w + cx;
    const firing = (w.auto && frame) || (!w.auto && frame === 1);
    const l = firing ? 1.2 : Math.min(1.1, Game.L.light[li] * 1.05 + Engine.flash);
    Engine.drawWeapon(tex, ox, oy, l);
  },
};

window.addEventListener('load', () => Main.boot().catch(err => {
  console.error(err);
  const g = document.getElementById('screen').getContext('2d');
  g.fillStyle = '#300'; g.fillRect(0, 0, VW, SCREEN_H);
  g.fillStyle = '#fff'; g.font = '10px monospace'; g.fillText(String(err), 8, 20);
}));
