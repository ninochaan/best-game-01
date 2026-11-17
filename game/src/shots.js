// The screenshot scenes behind ?shot=menu|play|boss|over. Each one resets the world and then
// composes a still by hand — pre-placed enemies, bullets frozen mid-flight, a burst of
// particles, the HUD set to plausible mid-game values — using only the seeded rng, so the
// same seed always gives the same frame. The play, boss and over scenes also pose a build:
// the upgrades a pilot would have drafted by then (levels, modifiers, a live wingman drone
// on its orbit), so the stills show the draft system the run is built on. The renderer then
// paints the scene with exactly the code the live game uses, so a screenshot is the real
// game, posed.

import { COLORS, W } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/**
 * Pose a drafted build on the state: the ordered picks, their levels, the derived
 * modifiers, and (for the drone pick) a drone placed on its orbit, facing its target,
 * with two of its shots already in the air.
 */
function stageBuild(state, picks, mods, droneFace = null) {
  state.taken = [...picks];
  state.levels = {};
  for (const id of picks) state.levels[id] = (state.levels[id] ?? 0) + 1;
  Object.assign(state.mods, mods);
  if (state.levels.drone) {
    const p = state.player;
    const angle = 2.35;
    const drone = {
      angle, face: droneFace ?? angle + Math.PI / 2, fireCd: 0.3, flashT: 0.04,
      x: p.x + Math.cos(angle) * 54, y: p.y + Math.sin(angle) * 54,
    };
    state.drones = [drone];
    for (const r of [30, 96]) {
      state.bullets.push({
        x: drone.x + Math.cos(drone.face) * r, y: drone.y + Math.sin(drone.face) * r,
        vx: Math.cos(drone.face) * 700, vy: Math.sin(drone.face) * 700,
        life: 1, dmg: 1, src: 'drone',
      });
    }
  }
}

function quietArena(world) {
  const state = world.state;
  state.queue = [];
  state.phase = 'active';
  state.phaseT = 0;
  state.ebullets.length = 0;
  return state;
}

/** A hand-posed lance beam with a long fade, so it survives the attract-mode settling steps. */
function stageBeam(state, x, y, angle) {
  state.beams.push({
    x1: x + Math.cos(angle) * 19, y1: y + Math.sin(angle) * 19,
    x2: x + Math.cos(angle) * 1250, y2: y + Math.sin(angle) * 1250,
    life: 5, maxLife: 5,
  });
}

function stageMenu(world) {
  world.reset();
  const state = quietArena(world);
  // Park the ship below the help text, so the words stay readable through the ring.
  state.player.y = 716;
  // A decorative ring of the cast, drifting around the parked player ship.
  const cast = [
    ['chaser', W / 2 - 430, 300],
    ['weaver', W / 2 + 430, 280],
    ['splitter', W / 2 - 360, 640],
    ['tank', W / 2 + 380, 620],
    ['mini', W / 2 + 120, 190],
    ['sniper', W / 2 + 580, 450],
  ];
  for (const [kind, x, y] of cast) world.spawnEnemy(kind, x, y);
  // A wingman drone rides its orbit around the parked ship, on display like the cast.
  const p = state.player;
  state.drones = [{
    angle: 0.8, face: 0.8 + Math.PI / 2, fireCd: 1, flashT: 0,
    x: p.x + Math.cos(0.8) * 54, y: p.y + Math.sin(0.8) * 54,
  }];
  // The two new power-ups hover at the edges of the ring, on display.
  state.ups.push({ kind: 'lance', x: W / 2 - 585, y: 462, t: 0.6, life: 8 });
  state.ups.push({ kind: 'nova', x: W / 2 + 585, y: 168, t: 1.4, life: 8 });
  world.burst(W / 2 - 430, 300, COLORS.magenta, 6, 120, 0.8, 2.4);
  world.burst(W / 2 + 380, 620, COLORS.ember, 6, 120, 0.8, 2.4);
  return { screen: SCREEN_TITLE, best: 8450 };
}

function stagePlay(world) {
  world.reset();
  const state = quietArena(world);
  state.wave = 6;
  state.score = 18940;
  state.combo = 27;
  state.comboTime = 1.8;
  state.kills = 84;
  const p = state.player;
  p.x = 520;
  p.y = 560;
  p.hp = 72;
  p.flashT = 0.02;
  p.lanceT = 7;
  p.novaT = 4;
  p.bombs = 2;
  // Five waves in, the build shows: a wingman drone (already firing on the weaver),
  // heavy rounds and a rapid cycler — the HUD chips and the drone are both live.
  stageBuild(state, ['drone', 'damage', 'rapid'], { damage: 1.35, fireRate: 1.25 },
    Math.atan2(178 - 598, 862 - 482));
  // The lance is live: the pilot is skewering the lead chaser, mid-beam.
  p.angle = Math.atan2(262 - p.y, 985 - p.x);
  stageBeam(state, p.x, p.y, p.angle);
  // A nova ring, caught a blink after it burst.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const r = 74 + (i % 3) * 22;
    state.bullets.push({
      x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
      vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, life: 0.8,
    });
  }
  world.spawnEnemy('chaser', 985, 262);
  world.spawnEnemy('chaser', 1085, 425);
  world.spawnEnemy('chaser', 250, 390);
  world.spawnEnemy('weaver', 862, 178);
  world.spawnEnemy('splitter', 1180, 565);
  const tank = world.spawnEnemy('tank', 1245, 305);
  tank.hp = 11;
  // A sniper at the flank, halfway through its charge: the sight line gives it away.
  const sniper = world.spawnEnemy('sniper', 1150, 648);
  sniper.charge = 0.5;
  sniper.angle = Math.atan2(p.y - sniper.y, p.x - sniper.x);
  world.spawnEnemy('mini', 760, 430);
  world.spawnEnemy('mini', 700, 480);
  world.spawnEnemy('mini', 950, 700);
  state.ups.push({ kind: 'shield', x: 690, y: 268, t: 1.2, life: 8 });
  world.burst(985, 262, COLORS.magenta, 10, 200, 0.6, 2.6);
  world.burst(1180, 565, COLORS.violet, 8, 170, 0.5, 2.4);
  world.floatText(1180, 520, '+200', COLORS.violet, 17);
  return { screen: SCREEN_PLAY, best: 15200 };
}

function stageBoss(world) {
  world.reset();
  const state = quietArena(world);
  state.wave = 10;
  state.score = 48600;
  state.combo = 38;
  state.comboTime = 2.1;
  state.kills = 214;
  state.lives = 2;
  const boss = world.spawnEnemy('boss', W / 2 + 130, 202);
  // Deep in the enrage: a third of its hull left, spiral barrage already spinning.
  boss.hp = Math.round(boss.maxHp * 0.34);
  boss.enraged = true;
  const p = state.player;
  p.x = 655;
  p.y = 700;
  p.hp = 55;
  p.angle = Math.atan2(boss.y - p.y, boss.x - p.x);
  p.flashT = 0.02;
  p.shieldT = 4;
  p.lanceT = 6;
  p.bombs = 1;
  // A nine-wave build behind the pilot: drone wingman (firing up at the dreadnought),
  // heavy rounds twice over, a rapid cycler and nano repair ticking.
  stageBuild(state, ['drone', 'damage', 'damage', 'rapid', 'regen'],
    { damage: 1.82, fireRate: 1.25, regen: 1.4 }, Math.atan2(202 - 738, 850 - 617));
  // The pilot answers with the lance, straight into the dreadnought's core.
  stageBeam(state, p.x, p.y, p.angle);
  // The boss's radial burst, frozen on its way out, plus an aimed trio.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.4;
    state.ebullets.push({
      x: boss.x + Math.cos(a) * 120, y: boss.y + Math.sin(a) * 120,
      vx: Math.cos(a) * 196, vy: Math.sin(a) * 196, life: 3,
    });
  }
  // The enrage spiral: two arms of bolts winding out of the hull.
  for (let i = 0; i < 9; i += 1) {
    for (const off of [0, Math.PI]) {
      const a = 0.6 + i * 0.45 + off;
      const r = 96 + i * 17;
      state.ebullets.push({
        x: boss.x + Math.cos(a) * r, y: boss.y + Math.sin(a) * r,
        vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 3,
      });
    }
  }
  world.spawnEnemy('chaser', 210, 300);
  world.spawnEnemy('chaser', 1235, 330);
  world.spawnEnemy('sniper', 175, 545);
  world.burst(boss.x - 40, boss.y + 30, COLORS.ember, 16, 260, 0.7, 3);
  world.burst(p.x + 90, p.y - 120, COLORS.cyan, 8, 180, 0.5, 2.4);
  world.floatText(boss.x - 90, boss.y + 84, '+300', COLORS.ember, 17);
  return { screen: SCREEN_PLAY, best: 24000 };
}

function stageOver(world) {
  world.reset();
  const state = quietArena(world);
  state.wave = 9;
  state.score = 41275;
  state.kills = 236;
  state.bestCombo = 41;
  state.combo = 0;
  state.comboTime = 0;
  state.lives = 0;
  // The run the summary panel tells: eight waves drafted, 70% accuracy over 12 minutes.
  state.stats = { fired: 612, hit: 431 };
  state.time = 754;
  stageBuild(state, ['drone', 'damage', 'rapid', 'damage', 'plating', 'saver'],
    { damage: 1.82, fireRate: 1.25, saver: 1 });
  state.maxHp = 125;
  // The wingman went down with the ship: no drone, and none of its shots left hanging.
  state.drones = [];
  state.bullets = state.bullets.filter((b) => b.src !== 'drone');
  state.player.alive = false;
  state.player.hp = 0;
  state.player.bombs = 0;
  world.spawnEnemy('chaser', 430, 300);
  world.spawnEnemy('chaser', 1010, 260);
  world.spawnEnemy('weaver', 900, 620);
  world.spawnEnemy('splitter', 300, 610);
  world.spawnEnemy('sniper', 1160, 470);
  // The wreck of the player's ship, still smouldering at centre field.
  world.burst(W / 2, 560, COLORS.cyan, 42, 300, 1.1, 3.4);
  world.burst(W / 2, 560, COLORS.amber, 22, 200, 0.9, 3);
  return { screen: SCREEN_OVER, best: 21300 };
}

const IDLE = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, bomb: false };

/**
 * Set `world` to the named scene (menu, play, boss or over; any other name is menu) and
 * return the screen to draw over it and the best score to show. After composing, the world
 * is stepped briefly in attract mode so particle bursts bloom into clouds instead of
 * sitting on the single pixel they were spawned at; nothing can be hurt in attract mode
 * and the placed bullets stay frozen.
 */
export function stageShot(name, world) {
  let scene;
  if (name === 'play') scene = stagePlay(world);
  else if (name === 'boss') scene = stageBoss(world);
  else if (name === 'over') scene = stageOver(world);
  else scene = stageMenu(world);
  for (let i = 0; i < 21; i += 1) world.step(1 / 60, IDLE, true);
  return scene;
}
