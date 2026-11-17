// Shared constants for Neon Swarm: the logical field size (the canvas is scaled to fit the
// window, letterboxed, so every screen renders the same 1440x900 world), the palette, and the
// tuning numbers the world and the renderer both read.

/** Logical field size, in world pixels. Screenshots are taken at exactly this size. */
export const W = 1440;
export const H = 900;

/** The fixed simulation step, in seconds: the world advances in 1/60 s ticks. */
export const STEP = 1 / 60;

/** localStorage key for the best score. */
export const BEST_KEY = 'neon-swarm-best';

/** The neon palette: deep space indigo behind cyan, magenta, amber, violet and ember. */
export const COLORS = {
  bgTop: '#05060f',
  bgBottom: '#0d1136',
  ink: '#eaf6ff',
  dim: '#8fa3c8',
  cyan: '#3df3ff',
  magenta: '#ff3d8a',
  amber: '#ffb52e',
  violet: '#9a6bff',
  lilac: '#c4a6ff',
  ember: '#ff5a3c',
  green: '#52ffa8',
  red: '#ff3860',
  acid: '#c8ff3d',
};

export const PLAYER = {
  radius: 13,
  speed: 348,
  accel: 2600,
  drag: 6.5,
  maxHp: 100,
  lives: 3,
  fireRate: 7.5,
  bulletSpeed: 760,
  bulletLife: 1.5,
  respawnInvuln: 2.5,
  hitInvuln: 1.1,
};

export const ENEMY = {
  chaser: { radius: 15, hp: 3, speed: 106, score: 100, damage: 14, color: COLORS.magenta },
  weaver: { radius: 13, hp: 2, speed: 168, score: 150, damage: 12, color: COLORS.amber },
  splitter: { radius: 24, hp: 7, speed: 62, score: 200, damage: 18, color: COLORS.violet },
  mini: { radius: 9, hp: 1, speed: 218, score: 50, damage: 8, color: COLORS.lilac },
  tank: { radius: 26, hp: 18, speed: 46, score: 300, damage: 22, color: COLORS.ember },
  sniper: { radius: 14, hp: 4, speed: 96, score: 250, damage: 12, color: COLORS.acid },
  boss: { radius: 58, hp: 170, speed: 40, score: 2000, damage: 30, color: COLORS.ember },
};

/** Enemy bolt (the shots tanks and the boss fire back). */
export const BOLT = { speed: 245, radius: 5, damage: 12, life: 4.5 };

/**
 * The sniper: it keeps its distance (retreats inside `minRange`, advances beyond
 * `maxRange`, strafes between), then stops to charge a fast, heavy bolt. The charge is
 * telegraphed by a sight line, so a moving pilot can dodge the shot.
 */
export const SNIPER = {
  minRange: 330,
  maxRange: 480,
  sightRange: 720,
  chargeTime: 1.15,
  boltSpeed: 400,
  boltDamage: 14,
  refireMin: 2.4,
  refireMax: 3.2,
};

/** The lance power-up: while it lasts, the gun fires a piercing beam instead of bullets. */
export const LANCE = { duration: 10, fireRate: 5.5, damage: 2, length: 1250, width: 10 };

/** The nova power-up: while it lasts, the ship periodically bursts a ring of bullets. */
export const NOVA = { duration: 10, interval: 1.3, bullets: 14, bulletSpeed: 540, bulletLife: 0.85 };

/** Power-up kinds, in drop-table order. */
export const POWER_KINDS = ['spread', 'shield', 'bomb', 'lance', 'nova'];

/**
 * The wingman drone, earned from the between-wave draft: it orbits the ship at `orbit`
 * pixels, picks the nearest hostile inside `range` and fires `fireRate` shots a second at
 * a fraction of the ship's gun damage. A second draft pick launches a second drone.
 */
export const DRONE = { orbit: 54, range: 540, fireRate: 3.4, bulletSpeed: 700, damage: 0.8 };

/** Tractor field (draft): power-ups inside `radiusPerLevel` x level drift to the ship. */
export const MAGNET = { radiusPerLevel: 150, pullSpeed: 360 };
