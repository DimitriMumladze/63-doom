// Asset manifest + loader. Images become {w, h, data: Uint32Array, img}.
// In the bundled single-file build, window.EMBED maps each path to a data URI.
'use strict';

const ASSET_BASE = '../assets/';

const CREW = ['brute', 'tank', 'irakli', 'beard', 'rider'];
const STAND_FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'attack1', 'attack2', 'pain',
  'death1', 'death2', 'death3', 'death4'];
const SEAT_FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4', 'attack1', 'attack2', 'pain',
  'death1', 'death2', 'death3', 'death4'];

const MANIFEST = (() => {
  const list = [];
  const walls = ['plaster', 'window', 'cabinet', 'concrete', 'radiator', 'door', 'server', 'tiles',
    'whiteboard', 'plaster_hell', 'concrete_hell', 'server_hell', 'tiles_hell'];
  for (const w of walls) list.push(['tex/' + w, 'textures/' + w + '.png']);
  for (let i = 0; i < 12; i++) {
    const n = String(i).padStart(2, '0');
    list.push(['tex/mural_' + n, 'textures/mural_' + n + '.png']);
  }
  for (const f of ['floor_oak', 'floor_oak_hell', 'floor_server', 'ceil_concrete', 'ceil_tray', 'ceil_light']) {
    list.push(['tex/' + f, 'textures/' + f + '.png']);
  }
  for (const p of ['desk', 'desk_lego', 'desk_broken', 'chair_black', 'chair_grey', 'bin', 'plant', 'lamp',
    'blood_pool', 'spark_0', 'spark_1']) list.push(['prop/' + p, 'props/' + p + '.png']);
  for (const c of CREW) {
    const frames = c === 'rider' ? SEAT_FRAMES : STAND_FRAMES;
    for (const f of frames) list.push([c + '/' + f, 'chars/' + c + '/' + f + '.png']);
    list.push([c + '/face', 'chars/' + c + '/face.png']);
  }
  const guns = { pistol: 2, shotgun: 3, dbshotgun: 3, chaingun: 3, rifle: 3, rocketl: 3, plasmagun: 3 };
  for (const [g, n] of Object.entries(guns)) {
    for (let i = 0; i < n; i++) list.push(['wep/' + g + '_' + i, 'weapons/' + g + '_' + i + '.png']);
  }
  for (const it of ['medkit', 'coffee', 'clip', 'shells', 'armor', 'shotgun', 'chaingun', 'logo63',
    'rifle', 'dbshotgun', 'rocketl', 'plasmagun', 'rockets', 'cells']) {
    list.push(['item/' + it, 'items/' + it + '.png']);
  }
  const fx = ['fireball_0', 'fireball_1', 'plasma_0', 'plasma_1', 'rocket_0', 'rocket_1',
    'explode_0', 'explode_1', 'explode_2', 'zap_0', 'zap_1', 'zap_2',
    'puff_0', 'puff_1', 'puff_2', 'blood_0', 'blood_1', 'blood_2'];
  for (const f of fx) list.push(['fx/' + f, 'fx/' + f + '.png']);
  return list;
})();

const Assets = {
  img: {},   // key -> texture object

  load(onProgress) {
    let done = 0;
    return Promise.all(MANIFEST.map(([key, path]) => new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        Assets.img[key] = Assets.toTex(im);
        onProgress && onProgress(++done, MANIFEST.length);
        resolve();
      };
      im.onerror = () => reject(new Error('missing asset ' + path));
      im.src = (window.EMBED && window.EMBED[path]) || (ASSET_BASE + path);
    })));
  },

  toTex(im) {
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height);
    return { w: im.width, h: im.height, data: new Uint32Array(d.data.buffer), img: c };
  },

  get(key) {
    const t = Assets.img[key];
    if (!t) throw new Error('asset not loaded: ' + key);
    return t;
  },
};
