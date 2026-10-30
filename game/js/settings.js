// Player settings (mouse sensitivity, music) kept in this browser only.
'use strict';

const Settings = {
  sens: 1.0,          // multiplier on the base mouse sensitivity
  musicVol: 0.6,
  musicMuted: false,
  KEY: 'officehell.settings.v1',

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      if (typeof s.sens === 'number') this.sens = Math.min(2, Math.max(0.3, s.sens));
      if (typeof s.musicVol === 'number') this.musicVol = Math.min(1, Math.max(0, s.musicVol));
      if (typeof s.musicMuted === 'boolean') this.musicMuted = s.musicMuted;
    } catch (e) { /* private mode / blocked storage: keep defaults */ }
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ sens: this.sens, musicVol: this.musicVol, musicMuted: this.musicMuted }));
    } catch (e) { /* ignore */ }
  },
};

// Right-hand side bar: music on/off + volume, mouse sensitivity.
const SideBar = {
  init() {
    const btn = document.getElementById('musicBtn');
    const vol = document.getElementById('musicVol');
    const sens = document.getElementById('sens');
    const sensVal = document.getElementById('sensVal');
    if (!btn) return;
    vol.value = Math.round(Settings.musicVol * 100);
    sens.value = Math.round(Settings.sens * 100);
    sensVal.textContent = Settings.sens.toFixed(1) + 'x';
    btn.addEventListener('click', e => { e.stopPropagation(); this.toggleMusic(); });
    // gear opens / closes the dropdown; clicking anywhere else closes it
    const wrap = document.getElementById('settings');
    const gear = document.getElementById('gearBtn');
    gear.addEventListener('click', e => {
      e.stopPropagation();
      const open = wrap.classList.toggle('open');
      gear.setAttribute('aria-expanded', String(open));
    });
    wrap.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => {
      wrap.classList.remove('open');
      gear.setAttribute('aria-expanded', 'false');
    });
    vol.addEventListener('input', () => {
      Settings.musicVol = vol.value / 100;
      if (Settings.musicVol > 0 && Settings.musicMuted) Settings.musicMuted = false;
      this.apply();
    });
    sens.addEventListener('input', () => {
      Settings.sens = sens.value / 100;
      sensVal.textContent = Settings.sens.toFixed(1) + 'x';
      Settings.save();
    });
    for (const el of [vol, sens]) el.addEventListener('change', () => el.blur());
    this.apply();
  },

  toggleMusic() {
    Sound.init();
    Settings.musicMuted = !Settings.musicMuted;
    this.apply();
  },

  apply() {
    const btn = document.getElementById('musicBtn');
    if (btn) {
      btn.classList.toggle('muted', Settings.musicMuted);
      btn.title = Settings.musicMuted ? 'Music off (M)' : 'Music on (M)';
    }
    Music.setVolume(Settings.musicMuted ? 0 : Settings.musicVol);
    BossMusic.setVolume(Settings.musicMuted ? 0 : Settings.musicVol);
    Settings.save();
  },
};
