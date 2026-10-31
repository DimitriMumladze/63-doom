// Asset manifest + loader. Images become {w, h, data: Uint32Array, img}.
// In the bundled single-file build, window.EMBED maps each path to a data URI.
'use strict';

// Where an asset comes from. The bundled single file carries most of them as data
// URIs in window.EMBED; what is left out of the embed (the boss music, which is the
// bulk of the bytes) sits in assets/ next to the page. Unbundled, game/index.html
// loads everything from ../assets/.
const BUNDLED = typeof window !== 'undefined' && !!window.EMBED;
const ASSET_BASE = BUNDLED ? 'assets/' : '../assets/';
const assetUrl = path => (BUNDLED && window.EMBED[path]) || (ASSET_BASE + path);

// the coworkers who come after you in the campaign
const CREW = ['brute', 'tank', 'irakli', 'beard', 'rider', 'sandro', 'agamemnov'];
// who you can be in the battle royale. The same list lives in server.js (it hands out
// the spare ones, so two people are not the same colleague) -- keep them in step.
// hood and specs were drawn with the rest of the crew but never used in the campaign.
const SKINS = ['brute', 'tank', 'irakli', 'beard', 'rider', 'hood', 'specs', 'sandro', 'agamemnov'];
const CHARS = [...new Set([...CREW, ...SKINS])];
const STAND_FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'attack1', 'attack2', 'pain',
  'death1', 'death2', 'death3', 'death4'];
const SEAT_FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4', 'attack1', 'attack2', 'pain',
  'death1', 'death2', 'death3', 'death4'];

const MANIFEST = (() => {
  const list = [];
  const walls = ['plaster', 'window', 'cabinet', 'concrete', 'radiator', 'door', 'server', 'tiles',
    'whiteboard', 'plaster_hell', 'concrete_hell', 'server_hell', 'tiles_hell',
    'plaster_grey', 'plaster_grey_panel', 'glass_wall', 'door_entry',
    'facade_pillar', 'facade_glass', 'facade_slats', 'door_front', 'fence_metal', 'wall_concrete_low',
    'soviet_wall', 'door_soviet', 'poster_0', 'poster_1', 'poster_2', 'kremlin_wall', 'flag_ru_wall', 'door_kremlin'];
  for (const w of walls) list.push(['tex/' + w, 'textures/' + w + '.png']);
  for (let i = 0; i < 12; i++) {
    const n = String(i).padStart(2, '0');
    list.push(['tex/mural_' + n, 'textures/mural_' + n + '.png']);
  }
  // multi-cell wall pictures (see WALL_STRIPS)
  for (const [s, n] of [['dino', 4], ['stairs', 4], ['sign63', 2], ['portrait', 2]]) {
    for (let i = 0; i < n; i++) list.push(['tex/' + s + '_' + i, 'textures/' + s + '_' + i + '.png']);
  }
  for (const f of ['floor_oak', 'floor_oak_hell', 'floor_server', 'ceil_concrete', 'ceil_tray', 'ceil_light',
    'floor_gloss', 'ceil_dark', 'ceil_linear', 'sidewalk', 'curb', 'asphalt', 'sky_dusk',
    'carpet_red', 'ceil_ornate', 'ceil_chandelier']) {
    list.push(['tex/' + f, 'textures/' + f + '.png']);
  }
  for (const p of ['desk', 'desk_lego', 'desk_broken', 'chair_black', 'chair_grey', 'bin', 'plant', 'lamp',
    'blood_pool', 'spark_0', 'spark_1', 'sofa', 'coffee_table', 'scooter', 'hanging_chair', 'pendant',
    'doormat', 'car_lexus_front', 'car_lexus_side', 'car_lexus_rear', 'car_bmw_front', 'car_bmw_side',
    'car_bmw_rear', 'streetlamp', 'lamp_glow', 'shrub', 'ac_unit', 'plate65',
    'soviet_flag', 'bust', 'samovar', 'tv_rubin', 'desk_soviet', 'matryoshka', 'coat_stand', 'star_lamp',
    'russian_flag', 'throne',
  ]) list.push(['prop/' + p, 'props/' + p + '.png']);
  for (const c of CHARS) {
    const frames = c === 'rider' ? SEAT_FRAMES : STAND_FRAMES;
    for (const f of frames) list.push([c + '/' + f, 'chars/' + c + '/' + f + '.png']);
    list.push([c + '/face', 'chars/' + c + '/face.png']);
  }
  // the friendly people out on the street (see NPCS)
  for (const f of ['bmw_0', 'bmw_1', 'lexus_0', 'lexus_1', 'rider_front', 'rider_side', 'rider_rear']) {
    list.push(['npc/' + f, 'chars/npc/' + f + '.png']);
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
    'puff_0', 'puff_1', 'puff_2', 'blood_0', 'blood_1', 'blood_2',
    'hammer_0', 'hammer_1', 'hammer_2', 'hammer_3', 'sickle_0', 'sickle_1', 'sickle_2', 'sickle_3',
    'spear_0', 'spear_1', 'spear_2', 'spear_3',
    'steam_0', 'steam_1', 'steam_2', 'smoke_0', 'smoke_1', 'smoke_2'];
  for (const f of fx) list.push(['fx/' + f, 'fx/' + f + '.png']);
  return list;
})();

const Assets = {
  img: {},   // key -> texture object

  load(onProgress) {
    let done = 0;
    return Promise.all([this.loadFont(), ...MANIFEST.map(([key, path]) => new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        Assets.img[key] = Assets.toTex(im);
        onProgress && onProgress(++done, MANIFEST.length);
        resolve();
      };
      im.onerror = () => reject(new Error('missing asset ' + path));
      im.src = assetUrl(path);
    }))]);
  },

  // GeoPixel (Georgian pixel font) for the speech boxes; without it they fall back to the HUD font
  loadFont() {
    if (!window.FontFace || !document.fonts) return Promise.resolve();
    const src = assetUrl('fonts/geopixel.ttf');
    return new FontFace('GeoPixel', 'url(' + src + ')').load()
      .then(f => { document.fonts.add(f); })
      .catch(err => console.warn('GeoPixel font not loaded', err));
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
