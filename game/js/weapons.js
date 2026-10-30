// What the guns and the things they fire do. Separate from game.js because
// server.js requires it: in a battle royale the server decides whether a shot was
// possible (enough ammo, not faster than the weapon's cooldown, in range, in
// sight) and rolls the damage itself, so it has to read the same numbers the
// player's browser does.
'use strict';

const PROJ_TYPES = {
  fireball: { speed: 7, frames: ['fx/fireball_0', 'fx/fireball_1'], h: 0.36, hit: 'explode' },
  plasma: { speed: 11, frames: ['fx/plasma_0', 'fx/plasma_1'], h: 0.3, hit: 'zap' },
  rocket: { speed: 8.5, frames: ['fx/rocket_0', 'fx/rocket_1'], h: 0.34, hit: 'explode' },
  prock: { speed: 14, frames: ['fx/rocket_0', 'fx/rocket_1'], h: 0.3, hit: 'explode' },
  pplasma: { speed: 20, frames: ['fx/plasma_0', 'fx/plasma_1'], h: 0.24, hit: 'zap' },
  hammer: { speed: 9, frames: ['fx/hammer_0', 'fx/hammer_1', 'fx/hammer_2', 'fx/hammer_3'], h: 0.4, hit: 'puff',
    hitSound: 'clang' },
  sickle: { speed: 9, frames: ['fx/sickle_0', 'fx/sickle_1', 'fx/sickle_2', 'fx/sickle_3'], h: 0.4, hit: 'puff',
    hitSound: 'clang' },
  spear: { speed: 13, frames: ['fx/spear_0', 'fx/spear_1', 'fx/spear_2', 'fx/spear_3'], h: 0.36, hit: 'puff',
    hitSound: 'clang' },
};

// seq: [from, to, frame] by time since the shot; auto weapons alternate frames 1/2
const WEAPONS = {
  pistol: { slot: 1, label: 'PISTOL', ammo: 'bullets', cool: 0.38, dmg: [8, 15], pellets: 1, spread: 0.012,
    frames: 2, seq: [[0, 0.12, 1]], sound: 'pistol', kick: 6 },
  shotgun: { slot: 2, label: 'SHOTGUN', ammo: 'shells', cool: 0.95, dmg: [6, 14], pellets: 7, spread: 0.1,
    frames: 3, seq: [[0, 0.12, 1], [0.3, 0.75, 2]], sound: 'shotgun', kick: 12 },
  dbshotgun: { slot: 3, label: 'SUPER SG', ammo: 'shells', use: 2, cool: 1.45, dmg: [6, 14], pellets: 18, spread: 0.2,
    frames: 3, seq: [[0, 0.15, 1], [0.4, 1.25, 2]], sound: 'dbshotgun', kick: 18 },
  chaingun: { slot: 4, label: 'CHAINGUN', ammo: 'bullets', cool: 0.1, dmg: [7, 13], pellets: 1, spread: 0.045,
    auto: true, frames: 3, sound: 'chaingun', kick: 3 },
  rifle: { slot: 5, label: 'RIFLE', ammo: 'bullets', cool: 0.09, dmg: [9, 15], pellets: 1, spread: 0.02,
    auto: true, frames: 3, sound: 'rifle', kick: 3 },
  rocketl: { slot: 6, label: 'ROCKETS', ammo: 'rockets', cool: 0.9, dmg: [60, 100], proj: 'prock', splash: 1.6,
    frames: 3, seq: [[0, 0.15, 1], [0.3, 0.75, 2]], sound: 'rocket', kick: 14 },
  plasmagun: { slot: 7, label: 'PLASMA', ammo: 'cells', cool: 0.08, dmg: [10, 18], proj: 'pplasma',
    auto: true, frames: 3, sound: 'plasma', kick: 2 },
};
const AMMO_MAX = { bullets: 200, shells: 50, rockets: 30, cells: 200 };

// Node (server.js) requires this; in the browser it is just a script.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROJ_TYPES, WEAPONS, AMMO_MAX };
}
