// Status bar, crosshair, messages and the title / death / win screens.
'use strict';

const MINT = '#44da9d';
const PURPLE = '#383892';
const RED = '#e63c32';

// title screen choices when the server is there: [x, y, w, h, label].
// The third only appears if that server runs battle royale matches.
const TITLE_BUTTONS = [
  [VW / 2 - 160, 147, 100, 16, 'PLAY ALONE'],
  [VW / 2 - 50, 147, 100, 16, 'PLAY ONLINE'],
  [VW / 2 + 60, 147, 100, 16, 'BATTLE ROYALE'],
];
const titleButtonCount = () => (Net.lobby && Net.lobby.br ? 3 : 2);

const Hud = {
  // the right wording for the input in use: controller, touch screen or mouse + keyboard
  say(pad, touch, mouse) { return Input.mode === 'pad' ? pad : Input.mode === 'touch' ? touch : mouse; },

  // which title button (index) is at screen point (x, y), or -1
  titleButtonAt(x, y) {
    if (!Net.lobby) return -1;
    return TITLE_BUTTONS.slice(0, titleButtonCount())
      .findIndex(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh);
  },

  font(size, bold = true) {
    return `${bold ? 'bold ' : ''}${size}px "Courier New", Courier, monospace`;
  },

  text(g, s, x, y, size, color, align = 'left', shadow = true) {
    g.font = this.font(size);
    g.textAlign = align;
    g.textBaseline = 'top';
    if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
    g.fillStyle = color;
    g.fillText(s, x, y);
  },

  // speech boxes over the street people's heads, in the GeoPixel font
  drawBubbles(g) {
    const size = 10, lineH = 12, maxW = 170;   // GeoPixel is drawn on a 10 px grid, so 10 px stays crisp
    g.font = `${size}px GeoPixel, "Courier New", monospace`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    for (const n of Game.L.npcs) {
      if (n.talk <= 0) continue;
      const s = Engine.project(n.x, n.y, n.h + 0.1);
      if (!s || s.hidden || s.x < -40 || s.x > VW + 40) continue;
      // word wrap
      const lines = [];
      for (const word of n.n.line.split(' ')) {
        const last = lines[lines.length - 1];
        if (last !== undefined && g.measureText(last + ' ' + word).width <= maxW) lines[lines.length - 1] = last + ' ' + word;
        else lines.push(word);
      }
      const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width))) + 10;
      const h = lines.length * lineH + 6;
      const tipX = Math.round(Math.max(8, Math.min(VW - 8, s.x)));
      const tipY = Math.round(Math.max(h + 8, Math.min(VH - 4, s.y)));
      const x = Math.round(Math.max(2, Math.min(VW - 2 - w, tipX - w / 2))), y = tipY - 5 - h;
      g.globalAlpha = n.talk;
      // pixel box with clipped corners and a tail down to the head
      g.fillStyle = '#111';
      g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
      for (let i = 0; i < 5; i++) g.fillRect(tipX - 5 + i, y + h - 1 + i, 2 * (5 - i), 1);
      g.fillStyle = '#fff';
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      for (let i = 0; i < 4; i++) g.fillRect(tipX - 4 + i, y + h - 1 + i, 2 * (4 - i), 1);
      g.fillStyle = '#111';
      lines.forEach((l, i) => g.fillText(l, x + 5, y + 4 + i * lineH));
      g.globalAlpha = 1;
    }
  },

  drawBar(g) {
    const G = Game, p = G.player;
    const y = VH;
    const grd = g.createLinearGradient(0, y, 0, SCREEN_H);
    grd.addColorStop(0, '#2e2c3c');
    grd.addColorStop(1, '#1a1922');
    g.fillStyle = grd;
    g.fillRect(0, y, VW, SCREEN_H - y);
    g.fillStyle = MINT;
    g.fillRect(0, y, VW, 2);
    g.drawImage(Assets.get('item/logo63').img, 4, y + 5, 32, 32);

    const panel = (x, w) => { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 4, w, 34); };
    panel(40, 60); panel(102, 56); panel(160, 70); panel(232, 42); panel(276, 52);
    this.text(g, 'HEALTH', 70, y + 5, 8, '#bbb', 'center', false);
    this.text(g, Math.max(0, Math.ceil(p.hp)) + '%', 70, y + 16, 16, p.hp > 30 ? RED : '#ff7a50', 'center');
    this.text(g, 'ARMOR', 130, y + 5, 8, '#bbb', 'center', false);
    this.text(g, p.armor + '%', 130, y + 16, 16, p.armor ? '#6fd08a' : '#777', 'center');
    const w = WEAPONS[p.weapon];
    this.text(g, w.label, 195, y + 5, 8, '#bbb', 'center', false);
    this.text(g, String(p.ammo[w.ammo]), 195, y + 16, 16, '#f0c040', 'center');
    this.text(g, w.ammo.toUpperCase(), 195, y + 31, 6, '#888', 'center', false);
    this.text(g, 'ARMS', 253, y + 5, 8, '#bbb', 'center', false);
    for (const [name, wd] of Object.entries(WEAPONS)) {
      const col = p.weapon === name ? MINT : (p.has[name] ? '#ddd' : '#444');
      const sx = 236 + ((wd.slot - 1) % 4) * 10, sy = y + 15 + Math.floor((wd.slot - 1) / 4) * 11;
      this.text(g, String(wd.slot), sx, sy, 10, col, 'left', false);
    }
    if (Net.br) { this.drawBrBar(g, y); return; }
    this.text(g, 'KILLS', 302, y + 5, 8, '#bbb', 'center', false);
    this.text(g, `${G.kills}/${G.totalEnemies}`, 302, y + 18, 12, '#ddd', 'center');

    // target: face of the coworker under the crosshair (or last one hit)
    const tg = G.target;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(330, y + 3, 146, 36);
    if (tg && G.targetT > 0) {
      g.fillStyle = PURPLE;
      g.fillRect(332, y + 4, 34, 34);
      const face = Assets.get(tg.type + '/face').img;
      g.drawImage(face, 333, y + 5, 32, 32);
      if (tg.hp <= 0) { g.fillStyle = 'rgba(160,0,0,0.45)'; g.fillRect(333, y + 5, 32, 32); }
      this.text(g, tg.t.name, 370, y + 6, tg.t.name.length > 12 ? 9 : 12, MINT);
      const frac = Math.max(0, tg.hp) / tg.t.hp;
      g.strokeStyle = MINT;
      g.strokeRect(370.5, y + 24.5, 100, 8);
      g.fillStyle = frac > 0.5 ? '#5fd37a' : (frac > 0.2 ? '#f0c040' : RED);
      g.fillRect(372, y + 26, 97 * frac, 5);
    } else {
      this.text(g, 'NO TARGET', 403, y + 16, 10, '#555', 'center', false);
    }
  },

  drawView(g) {
    const G = Game;
    // crosshair
    g.fillStyle = MINT;
    g.fillRect(VW / 2 - 4, CY, 3, 1); g.fillRect(VW / 2 + 2, CY, 3, 1);
    g.fillRect(VW / 2, CY - 4, 1, 3); g.fillRect(VW / 2, CY + 2, 1, 3);
    // messages
    G.msgs.forEach((m, i) => {
      g.globalAlpha = Math.min(1, m.t);
      this.text(g, m.text, 6, 6 + i * 12, 10, '#f4e7c0');
    });
    g.globalAlpha = 1;
    const z = zoneAt(G.L, G.player.x, G.player.y);
    if (z) this.text(g, z.toUpperCase(), VW - 6, 6, 8, 'rgba(255,255,255,0.6)', 'right');
    // co-op: a tag over each of the others, and how they're doing under the room name
    Net.active().forEach((r, i) => {
      const col = playerColor(r.slot);
      this.text(g, `P${r.slot}  ${r.dead ? 'FIRED' : r.hp + '%'}`, VW - 6, 18 + i * 10, 8, col, 'right');
      if (r.dead) return;
      const s = Engine.project(r.x, r.y, 1.35 + r.z);
      if (s && !s.hidden && s.x > 0 && s.x < VW) this.text(g, 'P' + r.slot, Math.round(s.x), Math.round(s.y) - 9, 8, col, 'center');
    });
  },

  overlay(g, alpha, color = '0,0,0') {
    g.fillStyle = `rgba(${color},${alpha})`;
    g.fillRect(0, 0, VW, SCREEN_H);
  },

  drawTitle(g, t) {
    this.overlay(g, 0.55);
    const logo = Assets.get('item/logo63').img;
    g.drawImage(logo, VW / 2 - 40, 14, 80, 80);
    this.text(g, 'OFFICE HELL', VW / 2, 100, 30, RED, 'center');
    this.text(g, 'Your coworkers have gone wrong.', VW / 2, 134, 10, '#ddd', 'center');
    if (Main.joining) {
      this.text(g, Net.on ? 'JOINING THE OTHERS...' : 'CONNECTING...', VW / 2, 150, 14, MINT, 'center');
    } else if (Net.lobby) {
      // the server is there: play alone, join the office, or go into the yard
      const lob = Net.lobby;
      const n = titleButtonCount();
      const shift = n === 2 ? 55 : 0;        // two buttons sit centred, three spread out
      const brFull = lob.br && lob.br.players >= lob.br.max;
      for (let i = 0; i < n; i++) {
        const [bx, y, w, h, label] = TITLE_BUTTONS[i];
        const x = bx + shift;
        const sel = Main.menu === i;
        const off = (i === 1 && lob.full) || (i === 2 && brFull);
        g.fillStyle = sel ? 'rgba(68,218,157,0.28)' : 'rgba(0,0,0,0.5)';
        g.fillRect(x, y, w, h);
        g.strokeStyle = sel ? MINT : '#666';
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        this.text(g, label, x + w / 2, y + 4, label.length > 11 ? 9 : 10,
          off ? '#777' : sel ? '#fff' : '#bbb', 'center');
        let under = '';
        if (i === 1) {
          under = lob.full ? 'SERVER FULL'
            : lob.players ? `${lob.players} IN THE OFFICE NOW` : 'NOBODY ONLINE YET';
        } else if (i === 2 && lob.br) {
          const st = lob.br.state;
          under = brFull ? 'MATCH FULL'
            : st === 'live' ? `MATCH ON -- ${lob.br.players} IN`
              : lob.br.players ? `${lob.br.players} WAITING` : 'UP TO 15 PLAYERS';
        }
        if (under) {
          this.text(g, under, x + w / 2, y + h + 2, 8,
            off || lob.full ? RED : '#f4e7c0', 'center');
        }
      }
    } else if (Math.floor(t * 2) % 2 === 0) {
      this.text(g, this.say('PRESS A TO START', 'TAP TO START', 'CLICK TO START'), VW / 2, 150, 14, MINT, 'center');
    }
    if (Input.padBlocked && !window.isSecureContext) {
      this.text(g, 'CONTROLLER NEEDS HTTPS', VW / 2, 162, 8, RED, 'center');
    }
    // the crew
    const crew = ['brute', 'tank', 'irakli', 'rider', 'beard', 'sandro', 'agamemnov'];
    crew.forEach((id, i) => {
      const x = VW / 2 - crew.length * 32 + i * 64 + 16;
      g.fillStyle = PURPLE;
      g.fillRect(x - 1, 172, 34, 34);
      // the last boss is a surprise: a question mark instead of his face and name
      const secret = ENEMY_TYPES[id].final;
      if (secret) {
        g.fillStyle = '#140a14';
        g.fillRect(x, 173, 32, 32);
        this.text(g, '?', x + 16, 176, 26, RED, 'center');
      } else g.drawImage(Assets.get(id + '/face').img, x, 173, 32, 32);
      const name = secret ? '???' : ENEMY_TYPES[id].name;
      // long names go on two lines so they don't run into the neighbour's
      const words = name.length > 12 ? name.split(' ') : [name];
      words.forEach((w, k) => this.text(g, w, x + 16, 208 + k * 9, 8, ENEMY_TYPES[id].boss ? RED : '#ccc', 'center'));
    });
    if (Input.mode === 'pad') {
      this.text(g, 'L-stick move · R-stick look · RT fire · A jump · B crouch · X doors',
        VW / 2, 244, 8, '#aaa', 'center');
      this.text(g, 'LT run · LB / RB weapons · VIEW music · MENU pause',
        VW / 2, 256, 8, '#aaa', 'center');
    } else if (Input.mode === 'touch') {
      this.text(g, 'Left thumb move (push to the edge to run) · drag on the right to look',
        VW / 2, 244, 8, '#aaa', 'center');
      this.text(g, 'FIRE · JUMP · USE doors · DUCK · GUN switches weapon · || pause',
        VW / 2, 256, 8, '#aaa', 'center');
    } else {
      this.text(g, 'WASD move · mouse look · click fire · Space jump · C crouch · E doors',
        VW / 2, 244, 8, '#aaa', 'center');
      this.text(g, 'Shift run · 1-7 / wheel weapons · M music · Esc pause',
        VW / 2, 256, 8, '#aaa', 'center');
    }
  },

  // ---------------- battle royale ----------------

  // the right-hand end of the status bar: how many are left, and the ring
  drawBrBar(g, y) {
    this.text(g, 'LEFT', 302, y + 5, 8, '#bbb', 'center', false);
    this.text(g, String(BR.alive), 302, y + 18, 12, BR.alive <= 3 ? RED : '#ddd', 'center');

    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(330, y + 3, 146, 36);
    const ring = BR.ring;
    if (!ring) {
      this.text(g, 'WAITING', 403, y + 16, 10, '#555', 'center', false);
      return;
    }
    const shrinking = ring.shrinking;
    const label = shrinking ? 'VENTS CLOSING' : (ring.dps ? 'NEXT VENT IN' : 'VENTS OPEN');
    this.text(g, label, 336, y + 6, 9, shrinking ? RED : MINT);
    this.text(g, clock(ring.left), 336, y + 18, 16, shrinking ? '#ff9a6a' : '#ddd');
    // your own tally
    this.text(g, 'KILLS', 420, y + 6, 8, '#bbb', 'center', false);
    this.text(g, String(BR.kills), 420, y + 17, 14, '#f0c040', 'center');
    this.text(g, 'PHASE', 458, y + 6, 8, '#bbb', 'center', false);
    this.text(g, String(ring.phase + 1), 458, y + 17, 14, '#ddd', 'center');
  },

  // over the 3D view: the minimap, the kill feed, and a warning if you are outside
  drawBrView(g) {
    this.drawMinimap(g);
    this.drawFeed(g);
    const out = BR.outsideBy();
    if (BR.outside) {
      // a pulsing band across the middle: you cannot miss it, and it says which way to go
      const pulse = 0.5 + 0.5 * Math.sin(BR.warnT * 7);
      g.fillStyle = `rgba(150,60,210,${0.12 + 0.12 * pulse})`;
      g.fillRect(0, 0, VW, VH);
      this.text(g, 'OUTSIDE THE VENTS', VW / 2, 40, 14, `rgba(255,${120 + 80 * pulse | 0},255,1)`, 'center');
      this.text(g, `${Math.ceil(out)} CELLS OUT -- GET BACK IN`, VW / 2, 58, 9, '#f0d0ff', 'center');
      this.drawRingArrow(g);
    }
    if (BR.spectating) this.text(g, 'WATCHING', VW / 2, 10, 10, MINT, 'center');
  },

  // which way the middle of the ring is, drawn at the edge of the view
  drawRingArrow(g) {
    const ring = BR.ring, p = Game.player;
    if (!ring) return;
    let rel = Math.atan2(ring.cy - p.y, ring.cx - p.x) - p.a;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const cx = VW / 2 + Math.max(-1, Math.min(1, rel / (FOV / 2))) * (VW / 2 - 16);
    const cy = 78;
    g.fillStyle = MINT;
    g.beginPath();
    g.moveTo(cx, cy + 8);
    g.lineTo(cx - 7, cy - 4);
    g.lineTo(cx + 7, cy - 4);
    g.closePath();
    g.fill();
  },

  // 4-5 lines of who shot whom, top right
  drawFeed(g) {
    BR.feed.forEach((f, i) => {
      g.globalAlpha = Math.min(1, f.t / 1.5);
      this.text(g, f.text, VW - 6, 6 + i * 11, f.mine ? 10 : 9, f.colour, 'right');
      g.globalAlpha = 1;
    });
  },

  // The map, drawn once per level into an offscreen canvas and then blitted. North
  // up, not turned with the player: a turning map makes the ring circle unreadable.
  mapImg: null, mapFor: '',

  buildMinimap(L) {
    const c = document.createElement('canvas');
    c.width = L.w; c.height = L.h;
    const mg = c.getContext('2d');
    const im = mg.createImageData(L.w, L.h);
    const px = new Uint32Array(im.data.buffer);
    for (let i = 0; i < L.w * L.h; i++) {
      if (L.solid[i]) px[i] = 0xff3a3a44;              // wall
      else if (L.block[i]) px[i] = 0xff4a4438;         // something standing in the way
      else {
        // the floor's own colour, so places look different from one another
        const t = L.floorTex[i];
        let r = 90, gg = 86, b = 82;
        if (t && t.data) {
          const c0 = t.data[0], c1 = t.data[t.w * 20 + 20] || c0;
          r = (((c0 & 255) + (c1 & 255)) >> 1);
          gg = ((((c0 >>> 8) & 255) + ((c1 >>> 8) & 255)) >> 1);
          b = ((((c0 >>> 16) & 255) + ((c1 >>> 16) & 255)) >> 1);
        }
        px[i] = 0xff000000 | ((b * 0.7 | 0) << 16) | ((gg * 0.7 | 0) << 8) | (r * 0.7 | 0);
      }
    }
    mg.putImageData(im, 0, 0);
    this.mapImg = c;
    this.mapFor = L.name;
  },

  drawMinimap(g) {
    const L = Game.L, p = Game.player;
    if (!L) return;
    if (this.mapFor !== L.name || !this.mapImg) this.buildMinimap(L);
    const SIZE = 78, SPAN = 34;               // pixels on screen, cells across
    const x0 = 6, y0 = VH - SIZE - 6;
    const scale = SIZE / SPAN;
    const cam = BR.spectating || p.dead ? (BR.specTarget() || p) : p;

    g.save();
    g.beginPath();
    g.rect(x0, y0, SIZE, SIZE);
    g.clip();
    g.fillStyle = 'rgba(8,8,12,0.85)';
    g.fillRect(x0, y0, SIZE, SIZE);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mapImg, cam.x - SPAN / 2, cam.y - SPAN / 2, SPAN, SPAN, x0, y0, SIZE, SIZE);

    const sx = v => x0 + (v - (cam.x - SPAN / 2)) * scale;
    const sy = v => y0 + (v - (cam.y - SPAN / 2)) * scale;
    const ring = BR.ring;
    if (ring) {
      g.lineWidth = 1;
      if (ring.tr < ring.r) {
        g.strokeStyle = 'rgba(110,160,255,0.9)';      // where it is going
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(sx(ring.tx), sy(ring.ty), ring.tr * scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.strokeStyle = 'rgba(190,235,255,0.95)';       // where it is now
      g.beginPath();
      g.arc(sx(ring.cx), sy(ring.cy), ring.r * scale, 0, Math.PI * 2);
      g.stroke();
    }
    // the others, and you
    for (const r of Net.active()) {
      if (r.dead) continue;
      g.fillStyle = playerColor(r.slot);
      g.fillRect(sx(r.x) - 1.5, sy(r.y) - 1.5, 3, 3);
    }
    g.fillStyle = '#fff';
    const ax = sx(cam.x), ay = sy(cam.y);
    g.beginPath();
    g.moveTo(ax + Math.cos(cam.a) * 4, ay + Math.sin(cam.a) * 4);
    g.lineTo(ax + Math.cos(cam.a + 2.5) * 3.5, ay + Math.sin(cam.a + 2.5) * 3.5);
    g.lineTo(ax + Math.cos(cam.a - 2.5) * 3.5, ay + Math.sin(cam.a - 2.5) * 3.5);
    g.closePath();
    g.fill();
    g.restore();

    g.strokeStyle = 'rgba(68,218,157,0.6)';
    g.strokeRect(x0 + 0.5, y0 + 0.5, SIZE - 1, SIZE - 1);
    this.text(g, zoneAt(L, cam.x, cam.y).toUpperCase() || 'THE YARD', x0 + SIZE / 2, y0 - 10, 8,
      'rgba(255,255,255,0.65)', 'center');
  },

  // the lobby: who is in, which colleague you are, and whether you are ready
  drawBrLobby(g, t) {
    this.overlay(g, 0.6);
    this.text(g, 'BATTLE ROYALE', VW / 2, 10, 22, RED, 'center');
    const n = BR.roster.length;
    const waiting = BR.state === 'countdown'
      ? `STARTING IN ${Math.ceil(Math.max(0, BR.countdown - BR.stateT))}`
      : n < BR.min ? `WAITING FOR ${BR.min - n} MORE` : 'READY UP TO START';
    this.text(g, `${n}/${BR.max} IN THE YARD -- ${waiting}`, VW / 2, 38, 10,
      BR.state === 'countdown' ? MINT : '#ddd', 'center');

    // your colleague, big, with the ones nobody has taken either side
    const taken = new Set(BR.roster.filter(e => e.id !== Net.id).map(e => e.skin));
    this.text(g, 'YOU ARE', VW / 2, 56, 8, '#bbb', 'center', false);
    const mine = BR.mySkin;
    g.fillStyle = PURPLE;
    g.fillRect(VW / 2 - 25, 68, 50, 50);
    try { g.drawImage(Assets.get(mine + '/face').img, VW / 2 - 24, 69, 48, 48); } catch (e) { /* not loaded */ }
    const myName = BR.myName || ('P' + Net.slot);
    this.text(g, myName, VW / 2, 122, 12, playerColor(Net.slot), 'center');
    this.text(g, this.say('LB / RB to change', 'TAP A FACE', '< > to change'), VW / 2, 137, 8, '#999', 'center');

    // everyone else
    const cols = 8;
    BR.roster.filter(e => e.id !== Net.id).forEach((e, i) => {
      const cx = VW / 2 - (Math.min(cols, n - 1) * 30) / 2 + (i % cols) * 30 + 15;
      const cy = 152 + Math.floor(i / cols) * 44;
      g.fillStyle = e.ready ? MINT : '#333';
      g.fillRect(cx - 13, cy - 1, 26, 26);
      try { g.drawImage(Assets.get(e.skin + '/face').img, cx - 12, cy, 24, 24); } catch (err) { /* ditto */ }
      this.text(g, e.name.slice(0, 8), cx, cy + 27, 7, playerColor(e.slot), 'center');
      if (e.late) this.text(g, 'NEXT', cx, cy + 35, 6, '#888', 'center', false);
    });

    const ready = BR.roster.filter(e => e.ready).length;
    this.text(g, BR.ready ? 'YOU ARE READY' : this.say('A WHEN READY', 'TAP WHEN READY', 'ENTER WHEN READY'),
      VW / 2, SCREEN_H - 34, 14, BR.ready ? MINT : '#f4e7c0', 'center');
    this.text(g, `${ready} of ${n} ready` + (taken.size ? '' : ''), VW / 2, SCREEN_H - 18, 8, '#999', 'center');
    this.text(g, 'ESC leaves', 6, SCREEN_H - 14, 8, '#777');
  },

  drawSpectate(g) {
    const t = BR.specTarget();
    this.text(g, t ? `WATCHING ${t.name || ('P' + t.slot)}` : 'NOBODY LEFT TO WATCH',
      VW / 2, VH - 26, 12, t ? playerColor(t.slot) : '#999', 'center');
    this.text(g, BR.place ? `YOU CAME #${BR.place} WITH ${BR.kills} KILL${BR.kills === 1 ? '' : 'S'}` : '',
      VW / 2, VH - 12, 9, '#ddd', 'center');
    this.text(g, this.say('A / LB / RB switches', 'TAP TO SWITCH', 'SPACE or < > switches'),
      VW / 2, 12, 8, '#999', 'center');
  },

  // the scoreboard at the end of a match
  drawBrResults(g, t) {
    this.overlay(g, 0.72);
    const board = BR.board || [];
    const win = board.find(b => b.id === BR.winner);
    const mine = board.find(b => b.id === Net.id);
    if (win) {
      g.fillStyle = PURPLE;
      g.fillRect(VW / 2 - 33, 14, 66, 66);
      try { g.drawImage(Assets.get(win.skin + '/face').img, VW / 2 - 32, 15, 64, 64); } catch (e) { /* ditto */ }
      this.text(g, 'EMPLOYEE OF THE MONTH', VW / 2, 86, 16, '#f0c040', 'center');
      this.text(g, win.name, VW / 2, 106, 22, playerColor(win.slot), 'center');
      this.text(g, `${win.kills} kill${win.kills === 1 ? '' : 's'}`, VW / 2, 130, 10, '#ddd', 'center');
    } else {
      this.text(g, 'NOBODY LEFT STANDING', VW / 2, 60, 18, RED, 'center');
    }
    if (mine) {
      this.text(g, `YOU: #${mine.place} of ${board.length}, ${mine.kills} kill${mine.kills === 1 ? '' : 's'}`,
        VW / 2, 146, 12, mine.place === 1 ? MINT : '#f4e7c0', 'center');
    }
    // the rest of the table, two columns
    const rest = board.filter(b => b.place > 1).slice(0, 14);
    rest.forEach((b, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = VW / 2 - 110 + col * 118, y = 164 + row * 12;
      const me = b.id === Net.id;
      this.text(g, `#${String(b.place).padStart(2)}`, x, y, 9, '#888');
      this.text(g, b.name.slice(0, 12), x + 22, y, 9, me ? '#fff' : playerColor(b.slot));
      this.text(g, String(b.kills), x + 100, y, 9, '#999', 'right');
    });
    this.text(g, 'NEXT MATCH SHORTLY', VW / 2, SCREEN_H - 14, 10, MINT, 'center');
  },

  drawDead(g, t) {
    this.overlay(g, Math.min(0.55, t * 0.6), '120,0,0');
    this.text(g, "YOU'RE FIRED!", VW / 2, 70, 30, '#fff', 'center');
    const by = Game.lastHitBy;
    if (by && by.friendly) {
      this.text(g, `P${by.slot} got you.`, VW / 2, 118, 16, playerColor(by.slot), 'center');
      this.text(g, 'FRIENDLY FIRE!', VW / 2, 140, 12, '#f4e7c0', 'center');
    } else if (by) {
      g.drawImage(Assets.get(by.type + '/face').img, VW / 2 - 24, 108, 48, 48);
      this.text(g, `${by.t.name} got you.`, VW / 2, 160, 12, '#f4e7c0', 'center');
    }
    if (t > 1 && Math.floor(t * 2) % 2 === 0) {
      this.text(g, Net.coop ? this.say('PRESS A TO RESPAWN', 'TAP TO RESPAWN', 'CLICK TO RESPAWN')
        : this.say('PRESS A TO TRY AGAIN', 'TAP TO TRY AGAIN', 'CLICK TO TRY AGAIN'), VW / 2, 182, 12, MINT, 'center');
    }
  },

  // a banner just above the status bar; the office stays visible and playable
  drawWin(g, t, stats) {
    const y = VH - 40;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, y, VW, 40);
    g.drawImage(Assets.get('item/logo63').img, 6, y + 4, 32, 32);
    this.text(g, 'YOU SURVIVED THE 63 OFFICE', 44, y + 5, 14, MINT);
    this.text(g, `Kills ${stats.kills}/${stats.total}   Time ${stats.time}`, 44, y + 24, 10, '#f4e7c0');
    // on a touch screen the RESTART button at the top is the way back
    if (Input.mode !== 'touch' && Math.floor(t * 2) % 2 === 0) {
      this.text(g, Input.usingPad ? 'VIEW  RESTART' : 'R  RESTART', VW - 8, y + 24, 10, MINT, 'right');
    }
  },

  drawPaused(g) {
    this.overlay(g, 0.5);
    this.text(g, 'PAUSED', VW / 2, 90, 26, '#fff', 'center');
    this.text(g, this.say('Press A to resume', 'Tap to resume', 'Click to resume'), VW / 2, 124, 12, MINT, 'center');
    if (Main.soundBlocked()) {
      this.text(g, this.say('No sound? Press A or click the screen once', 'No sound? Tap the screen once',
        'No sound? Click the screen once'), VW / 2, 146, 8, '#f4e7c0', 'center');
    }
  },

  // #padtest: raw controller state, for checking what reaches the page on a real Xbox
  drawPadTest(g) {
    const gp = Input.gp;
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(0, 0, VW, 92);
    const ua = navigator.userActivation;
    this.text(g, `secure ${window.isSecureContext}  activation ${ua ? ua.hasBeenActive : '?'}  ` +
      `audio ${Sound.ctx ? Sound.ctx.state : 'none'}  mode ${Input.mode}  xbox ${IS_XBOX}  ${Main.fps} fps`, 4, 4, 8, '#0f0');
    if (!gp) { this.text(g, Input.padBlocked ? 'getGamepads() blocked / missing' : 'no controller - press a button', 4, 16, 8, '#ff0'); return; }
    this.text(g, (gp.id || '').slice(0, 70) + '  map ' + gp.mapping, 4, 16, 8, '#ff0');
    const bs = Array.from(gp.buttons, (b, i) => i + ':' + (b.pressed ? 'X' : b.value > 0.05 ? b.value.toFixed(1) : '.'));
    for (let r = 0; r * 9 < bs.length; r++) this.text(g, bs.slice(r * 9, r * 9 + 9).join('  '), 4, 28 + r * 11, 8, '#fff');
    this.text(g, 'axes ' + Array.from(gp.axes, a => a.toFixed(2)).join(' '), 4, 64, 8, '#fff');
    this.text(g, 'last key ' + (Input.lastKey || '-'), 4, 76, 8, '#aaa');
  },

  drawLoading(g, done, total) {
    g.fillStyle = '#111';
    g.fillRect(0, 0, VW, SCREEN_H);
    this.text(g, 'LOADING THE OFFICE...', VW / 2, 120, 12, MINT, 'center');
    g.fillStyle = '#333';
    g.fillRect(VW / 2 - 100, 140, 200, 6);
    g.fillStyle = MINT;
    g.fillRect(VW / 2 - 100, 140, 200 * done / total, 6);
  },
};

// seconds as m:ss, for the ring timer
function clock(sec) {
  const n = Math.max(0, Math.ceil(sec));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
