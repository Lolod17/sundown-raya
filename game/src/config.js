// config.js — JOB: All tunable constants: districts, cars, weapons, palette, world size.
// EXPORTS: CONFIG, DISTRICTS, CAR_MODELS, WEAPONS, DISTRICT_AT
// USES: nothing

export const CONFIG = {
  world: { cols: 7, rows: 7, block: 520, road: 150, beach: 420, origin: 0 },
  player: { walk: 118, sprint: 205, radius: 11, maxHealth: 100, maxArmour: 100, fireRate: 0.17, bulletSpeed: 1150 },
  police: { starCash: 40, sight: 620, loseTime: 5.0, cruiserSpeed: 300, cruiserAccel: 240, shootRange: 380 },
  traffic: { countTarget: 34, pedCount: 90, passTime: 2.2, redTime: 7.0, greenTime: 11.0 },
  clock: { startMinutes: 18 * 60 + 24, minutesPerSecond: 3 },
  save: { key: 'sundown-raya-save-v1' },
};

// Rendered in this order on the world: base -> props.
export const DISTRICTS = [
  { id: 'marina', name: 'Coral Marina', tagline: 'Salt air, borrowed money.', color: '#2b5f74', road: '#33383c', accent: '#ffcf6b' },
  { id: 'oldtown', name: 'Old Town Raya', tagline: 'Nothing here closes early.', color: '#5a4a3c', road: '#34302c', accent: '#f0a05a' },
  { id: 'boardwalk', name: 'Sunny Boardwalk', tagline: 'Every sunset is for sale.', color: '#6d6a45', road: '#3b3a33', accent: '#ffe08a' },
  { id: 'stonegate', name: 'Stonegate', tagline: 'Loud money, quiet streets.', color: '#4a4656', road: '#31303a', accent: '#9fd0ff' },
  { id: 'harbor', name: 'Port Vela', tagline: 'Everything comes through here.', color: '#4b5340', road: '#2e332c', accent: '#ffa36b' },
  { id: 'hills', name: 'Cerro Alto', tagline: 'You can see the whole grift from up here.', color: '#5d4b3f', road: '#332e29', accent: '#ffb8de' },
];

export const DISTRICT_AT = (col, row) => {
  if (col >= 6) return DISTRICTS[4];
  if (row >= 6) return DISTRICTS[5];
  if (row >= 3 && col >= 3) return DISTRICTS[3];
  if (col <= 1) return DISTRICTS[0];
  if (row <= 2 && col <= 3) return DISTRICTS[1];
  return DISTRICTS[2];
};

export const CAR_MODELS = [
  { id: 'kiwi', name: 'Vespi Kiwi', color: '#e8c149', weight: 0.34, maxSpeed: 260, accel: 260, turn: 2.9, grip: 0.90, hp: 100 },
  { id: 'gull', name: 'Pescadero Gull', color: '#8fd0c0', weight: 0.24, maxSpeed: 360, accel: 320, turn: 3.0, grip: 0.84, hp: 110 },
  { id: 'mako', name: 'Cascadora Mako', color: '#d0533f', weight: 0.18, maxSpeed: 420, accel: 380, turn: 2.7, grip: 0.80, hp: 120 },
  { id: 'parcel', name: 'Cielo Parcel', color: '#e0e0de', weight: 0.14, maxSpeed: 240, accel: 200, turn: 2.4, grip: 0.93, hp: 160 },
  { id: 'gira', name: 'Ruiz Gira', color: '#6f7bd1', weight: 0.10, maxSpeed: 460, accel: 430, turn: 3.15, grip: 0.86, hp: 95 },
];
export const CAR_BY_ID = id => CAR_MODELS.find(c => c.id === id) || CAR_MODELS[0];

export const WEAPONS = {
  pistol: { name: 'Ruano .32', ammo: 42, cooldown: 0.20, damage: 34, spread: 0.045, pellets: 1, range: 900 },
  smg: { name: 'Chiquito SMG', ammo: 120, cooldown: 0.075, damage: 17, spread: 0.085, pellets: 1, range: 780 },
  shotgun: { name: 'Viento 12G', ammo: 24, cooldown: 0.65, damage: 22, spread: 0.20, pellets: 7, range: 520 },
};
