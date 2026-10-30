// Status bar, crosshair, messages and the title / death / win screens.
'use strict';

const MINT = '#44da9d';
const PURPLE = '#383892';
const RED = '#e63c32';

const Hud = {
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
      this.text(g, tg.t.name, 370, y + 6, 12, MINT);
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
    if (Math.floor(t * 2) % 2 === 0) this.text(g, 'CLICK TO START', VW / 2, 150, 14, MINT, 'center');
    // the crew
    const crew = ['brute', 'tank', 'irakli', 'rider', 'beard'];
    crew.forEach((id, i) => {
      const x = VW / 2 - crew.length * 36 + i * 72 + 20;
      g.fillStyle = PURPLE;
      g.fillRect(x - 1, 172, 34, 34);
      g.drawImage(Assets.get(id + '/face').img, x, 173, 32, 32);
      this.text(g, ENEMY_TYPES[id].name, x + 16, 208, 8, ENEMY_TYPES[id].boss ? RED : '#ccc', 'center');
    });
    this.text(g, 'WASD move · mouse look · click fire · Space jump · C crouch · E doors',
      VW / 2, 244, 8, '#aaa', 'center');
    this.text(g, 'Shift run · 1-7 / wheel weapons · M music · Esc pause',
      VW / 2, 256, 8, '#aaa', 'center');
  },

  drawDead(g, t) {
    this.overlay(g, Math.min(0.55, t * 0.6), '120,0,0');
    this.text(g, "YOU'RE FIRED!", VW / 2, 70, 30, '#fff', 'center');
    const by = Game.lastHitBy;
    if (by) {
      g.drawImage(Assets.get(by.type + '/face').img, VW / 2 - 24, 108, 48, 48);
      this.text(g, `${by.t.name} got you.`, VW / 2, 160, 12, '#f4e7c0', 'center');
    }
    if (t > 1 && Math.floor(t * 2) % 2 === 0) this.text(g, 'CLICK TO TRY AGAIN', VW / 2, 182, 12, MINT, 'center');
  },

  drawWin(g, t, stats) {
    this.overlay(g, Math.min(0.6, t * 0.5));
    g.drawImage(Assets.get('item/logo63').img, VW / 2 - 28, 20, 56, 56);
    this.text(g, 'YOU SURVIVED', VW / 2, 84, 26, MINT, 'center');
    this.text(g, 'THE 63 OFFICE', VW / 2, 112, 18, '#fff', 'center');
    this.text(g, `Kills ${stats.kills}/${stats.total}   Time ${stats.time}`, VW / 2, 142, 12, '#f4e7c0', 'center');
    if (t > 1.5 && Math.floor(t * 2) % 2 === 0) this.text(g, 'CLICK TO PLAY AGAIN', VW / 2, 170, 12, MINT, 'center');
  },

  drawPaused(g) {
    this.overlay(g, 0.5);
    this.text(g, 'PAUSED', VW / 2, 90, 26, '#fff', 'center');
    this.text(g, 'Click to resume', VW / 2, 124, 12, MINT, 'center');
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
