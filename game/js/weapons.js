// Marisol Bay — the weapon table: pistol, SMG and shotgun, each with its own
// damage, fire rate, spread, pellet count and reach. Player.shoot() reads
// these numbers, the HUD prints the names, missions hand the guns out.
export const WEAPONS = {
  fists: {
    id: 'fists', name: 'FISTS',
    damage: 0, cooldown: 0.45, pellets: 0, spread: 0, range: 0, sound: null,
  },
  pistol: {
    id: 'pistol', name: 'PISTOL',
    damage: 34, cooldown: 0.32, pellets: 1, spread: 0.015, range: 42, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'SMG',
    damage: 16, cooldown: 0.09, pellets: 1, spread: 0.055, range: 38, sound: 'smg',
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN',
    damage: 13, cooldown: 0.85, pellets: 6, spread: 0.15, range: 24, sound: 'shotgun',
  },
};

// The order the 1/2/3 keys walk through the armoury.
export const WEAPON_KEYS = ['pistol', 'smg', 'shotgun'];

export function weaponById(id) {
  return WEAPONS[id] || WEAPONS.fists;
}
