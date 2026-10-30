// Synthesized sound effects (WebAudio), no audio files needed.
'use strict';

const Sound = {
  ctx: null, master: null, noiseBuf: null, last: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    Music.start(this.ctx, this.noiseBuf);
  },

  noise(t0, dur, vol, f0, f1, type = 'lowpass', q = 1) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.05);
  },

  tone(t0, dur, vol, f0, f1, wave = 'square') {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  },

  play(name, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // don't stack the same sound more than ~25 times a second
    if (this.last[name] && t - this.last[name] < 0.04) return;
    this.last[name] = t;
    const v = vol;
    switch (name) {
      case 'pistol': this.noise(t, 0.18, 0.7 * v, 3000, 300); this.tone(t, 0.08, 0.3 * v, 180, 60); break;
      case 'shotgun': this.noise(t, 0.45, 1.0 * v, 2400, 120); this.tone(t, 0.2, 0.5 * v, 120, 40);
        this.noise(t + 0.45, 0.08, 0.3 * v, 1500, 800, 'bandpass', 4); this.noise(t + 0.6, 0.08, 0.3 * v, 1200, 700, 'bandpass', 4); break;
      case 'chaingun': this.noise(t, 0.1, 0.6 * v, 3500, 500); this.tone(t, 0.05, 0.25 * v, 220, 90); break;
      case 'fireball': this.noise(t, 0.6, 0.6 * v, 400, 2000, 'bandpass', 2); break;
      case 'plasma': this.tone(t, 0.18, 0.25 * v, 1400, 300, 'sawtooth'); this.tone(t, 0.18, 0.15 * v, 700, 150, 'square'); break;
      case 'rocket': this.noise(t, 0.7, 0.8 * v, 800, 200, 'lowpass', 2); this.tone(t, 0.4, 0.3 * v, 90, 40, 'sawtooth'); break;
      case 'punch': this.noise(t, 0.12, 0.9 * v, 900, 100); this.tone(t, 0.1, 0.5 * v, 110, 50, 'sine'); break;
      case 'explode': this.noise(t, 0.9, 1.0 * v, 1200, 60); this.tone(t, 0.6, 0.5 * v, 70, 25, 'sine'); break;
      case 'zaphit': this.tone(t, 0.25, 0.25 * v, 900, 120, 'sawtooth'); break;
      case 'hurt': this.tone(t, 0.18, 0.4, 260, 110, 'sawtooth'); break;
      case 'pain': this.tone(t, 0.22, 0.35 * v, 180, 90, 'sawtooth'); this.noise(t, 0.15, 0.2 * v, 800, 300, 'bandpass', 3); break;
      case 'die': this.tone(t, 0.6, 0.4 * v, 220, 50, 'sawtooth'); this.noise(t, 0.5, 0.3 * v, 600, 100); break;
      case 'bossdie': this.tone(t, 1.6, 0.5, 140, 25, 'sawtooth'); this.noise(t, 1.4, 0.6, 900, 40); break;
      case 'playerdie': this.tone(t, 1.2, 0.5, 300, 40, 'sawtooth'); break;
      case 'sight': this.tone(t, 0.25, 0.25 * v, 140, 220, 'sawtooth'); break;
      case 'door': this.noise(t, 0.55, 0.35, 220, 120, 'lowpass', 6); this.tone(t, 0.5, 0.12, 60, 55, 'square'); break;
      case 'locked': this.tone(t, 0.1, 0.25, 160, 150); this.tone(t + 0.12, 0.12, 0.25, 120, 110); break;
      case 'pickup': this.tone(t, 0.07, 0.2, 660, 660); this.tone(t + 0.07, 0.1, 0.2, 990, 990); break;
      case 'click': this.tone(t, 0.03, 0.2, 1200, 1100); break;
      case 'dbshotgun': this.noise(t, 0.7, 1.0 * v, 1800, 70); this.tone(t, 0.3, 0.6 * v, 90, 30);
        this.noise(t + 0.55, 0.06, 0.35 * v, 1600, 900, 'bandpass', 5); this.noise(t + 0.95, 0.08, 0.35 * v, 1300, 800, 'bandpass', 5); break;
      case 'rifle': this.noise(t, 0.12, 0.7 * v, 4200, 600); this.tone(t, 0.06, 0.3 * v, 260, 80); break;
      case 'jump': this.noise(t, 0.08, 0.15, 900, 500, 'bandpass', 2); break;
      case 'land': this.tone(t, 0.12, 0.3, 90, 50, 'sine'); this.noise(t, 0.1, 0.2, 500, 200); break;
      case 'start': [0, 0.12, 0.24].forEach((d, i) => this.tone(t + d, 0.25, 0.25, [220, 277, 330][i], [220, 277, 330][i], 'square')); break;
    }
  },
};

// Tense procedural soundtrack: dark drone, heartbeat kick, minor-key bass
// ostinato, metallic stingers. A combat layer (ticking hats, gritty bass)
// fades in while coworkers are chasing you.
const Music = {
  ctx: null, out: null, combat: null, noiseBuf: null, timer: null,
  vol: 0.6, intensity: 0, targetIntensity: 0, step: 0, next: 0,
  BEAT: 60 / 80,

  start(ctx, noiseBuf) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.combat = ctx.createGain();
    this.combat.gain.value = 0;
    this.combat.connect(this.out);

    // drone: detuned saws through a slowly breathing low-pass + a sub sine
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 4;
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.06; lfoAmt.gain.value = 180;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    lp.connect(droneGain).connect(this.out);
    for (const [f, det] of [[73.42, -7], [73.42, 6], [110.0, 3], [77.78, 0]]) {   // D2, D2, A2, D#2 (tension)
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = f === 77.78 ? 0.25 : 0.5;
      o.connect(g).connect(lp);
      o.start();
    }
    const sub = ctx.createOscillator(), subG = ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = 36.71; subG.gain.value = 0.18;
    sub.connect(subG).connect(this.out);
    sub.start();

    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.setVolume(this.vol);
  },

  setVolume(v) {
    this.vol = v;
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.25);
  },

  setIntensity(x) { this.targetIntensity = x; },

  schedule() {
    const ctx = this.ctx;
    // ease the combat layer in and out
    this.intensity += (this.targetIntensity - this.intensity) * 0.02;
    this.combat.gain.setTargetAtTime(this.intensity, ctx.currentTime, 0.3);
    const sixteenth = this.BEAT / 4;
    while (this.next < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.next);
      this.next += sixteenth;
      this.step = (this.step + 1) % 128;           // 8 bars of 16 steps
    }
  },

  playStep(i, t) {
    const inBar = i % 16;
    // heartbeat: lub-dub on every beat
    if (inBar % 4 === 0) this.kick(t, 0.55);
    if (inBar % 4 === 1) this.kick(t, 0.3);
    // bass ostinato in eighths: D D F D C# D A D
    if (i % 2 === 0) {
      const pat = [73.42, 73.42, 87.31, 73.42, 69.30, 73.42, 55.0, 73.42];
      this.bass(t, pat[(i / 2) % 8], 0.11, this.out);
      if (this.intensity > 0.05) this.bass(t, pat[(i / 2) % 8] * 2, 0.07, this.combat, true);
    }
    // ticking hats only in the combat layer
    this.hat(t, inBar % 4 === 2 ? 0.06 : 0.03);
    // metallic stinger every 4 bars, noise riser before each 8-bar phrase
    if (i % 64 === 0) this.metal(t);
    if (i === 112) this.riser(t, this.BEAT * 4);
  },

  kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.4);
  },

  bass(t, f, v, dest, gritty) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = gritty ? 'sawtooth' : 'square';
    o.frequency.value = f;
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(gritty ? 1400 : 700, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + 0.3);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(flt).connect(g).connect(dest);
    o.start(t); o.stop(t + 0.36);
  },

  hat(t, v) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    flt.type = 'highpass'; flt.frequency.value = 7000;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(flt).connect(g).connect(this.combat);
    src.start(t, Math.random() * 0.5, 0.05);
  },

  metal(t) {
    const ctx = this.ctx;
    for (const f of [420, 631, 977, 1433]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + 2.6);
    }
  },

  riser(t, dur) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    flt.type = 'bandpass'; flt.Q.value = 3;
    flt.frequency.setValueAtTime(200, t);
    flt.frequency.exponentialRampToValueAtTime(3000, t + dur);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t); src.stop(t + dur + 0.1);
  },
};
