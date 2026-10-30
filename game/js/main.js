// Input, screen states and the main loop.
'use strict';

const Input = {
  keys: {}, down: {}, mouseDX: 0, mouseDY: 0, lastDX: 0, wheel: 0, mouseFire: false, locked: false,

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this.down[e.code] = true;
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyM' && !e.repeat) SideBar.toggleMusic();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouseFire = false; });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this.mouseFire = true; });
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
  takeMouse() {
    const v = [this.mouseDX, this.mouseDY];
    this.lastDX = this.mouseDX;
    this.mouseDX = 0; this.mouseDY = 0;
    return v;
  },
  takeWheel() { const v = this.wheel; this.wheel = 0; return v; },
  fireHeld() { return this.mouseFire || this.keys.ControlLeft || this.keys.ControlRight; },
  endFrame() { this.down = {}; },
};

const Main = {
  canvas: null, g: null, state: 'loading', stateT: 0, last: 0, hadLock: false, winStats: null,
  fps: 0, fpsAcc: 0, fpsN: 0, showFps: false,

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
    canvas.addEventListener('click', () => this.onClick());
    requestAnimationFrame(t => this.loop(t));
  },

  fit() {
    const s = Math.min(window.innerWidth / VW, window.innerHeight / SCREEN_H);
    this.canvas.style.width = Math.floor(VW * s) + 'px';
    this.canvas.style.height = Math.floor(SCREEN_H * s) + 'px';
  },

  setState(s) {
    this.state = s;
    this.stateT = 0;
    document.body.classList.toggle('playing', s === 'play');
  },

  lock() {
    try {
      const r = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
      this.hadLock = true;
    } catch (e) { /* playing with arrow keys is fine too */ }
  },

  onClick() {
    Sound.init();
    SideBar.apply();
    if (this.state === 'title') {
      Game.start();
      Sound.play('start');
      this.lock();
      this.setState('play');
    } else if (this.state === 'paused') {
      this.lock();
      this.setState('play');
    } else if ((this.state === 'dead' && this.stateT > 1) || (this.state === 'win' && this.stateT > 1.5)) {
      Game.start();
      this.setState('play');
      this.lock();
    } else if (this.state === 'play' && !Input.locked) {
      this.lock();
    }
  },

  onDeath() { this.setState('dead'); },

  onWin() {
    const t = Math.floor(Game.time);
    this.winStats = { kills: Game.kills, total: Game.totalEnemies, time: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` };
    this.setState('win');
    if (document.exitPointerLock) document.exitPointerLock();
  },

  loop(now) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.stateT += dt;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (Input.pressed('F3')) this.showFps = !this.showFps;

    const g = this.g, p = Game.player;
    if (this.state === 'play' || this.state === 'dead' || this.state === 'win') {
      if (this.state === 'play' || this.state === 'win') Game.update(dt);
      else { Game.updateEnemies(dt); Game.updateProjs(dt); Game.updateFx(dt); Game.updateDoors(dt); Game.time += dt; }
    }
    // camera: title screen slowly looks around the open space
    // eye height: crouch lowers it, jumping raises it, landing dips it
    let cam = { x: p.x, y: p.y, a: p.a, horizon: CY + p.pitch + p.kick * 0.25,
      eyeZ: EYE - 0.4 * p.crouch + p.z - 0.08 * Math.sin(p.land * Math.PI) };
    if (this.state === 'title') {
      cam = { x: 2.2, y: 7.2, a: -0.55 + Math.sin(this.stateT * 0.25) * 0.5 };
      Game.time += dt;
      Game.updateLights();
    }
    Engine.render(cam, Game.L, Game.sprites());
    if (this.state === 'play' || this.state === 'paused') this.drawWeapon();
    Engine.wash(255, 0, 0, Game.washR);
    Engine.wash(255, 220, 90, Game.washG);
    Engine.present();
    g.fillStyle = '#000';
    g.fillRect(0, VH, VW, SCREEN_H - VH);
    if (this.state !== 'title') { Hud.drawBar(g); }
    if (this.state === 'play') Hud.drawView(g);
    if (this.state === 'title') Hud.drawTitle(g, this.stateT);
    if (this.state === 'paused') Hud.drawPaused(g);
    if (this.state === 'dead') Hud.drawDead(g, this.stateT);
    if (this.state === 'win') Hud.drawWin(g, this.stateT, this.winStats);
    if (this.showFps) Hud.text(g, this.fps + ' FPS', 4, VH - 12, 8, '#0f0');
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
