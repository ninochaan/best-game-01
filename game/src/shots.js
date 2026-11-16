// The screenshot scenes behind ?shot=menu|play|boss|over. Each one resets the world and then
// composes a still by hand — pre-placed enemies, bullets frozen mid-flight, a burst of
// particles, the HUD set to plausible mid-game values — using only the seeded rng, so the
// same seed always gives the same frame. The renderer then paints the scene with exactly the
// code the live game uses, so a screenshot is the real game, posed.

import { COLORS, W } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function bulletRow(state, x, y, angle, count, gap) {
  for (let i = 0; i < count; i += 1) {
    state.bullets.push({
      x: x + Math.cos(angle) * gap * i,
      y: y + Math.sin(angle) * gap * i,
      vx: Math.cos(angle) * 760,
      vy: Math.sin(angle) * 760,
      life: 1,
    });
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

function stageMenu(world) {
  world.reset();
  const state = quietArena(world);
  // A decorative ring of the cast, drifting around the parked player ship.
  const cast = [
    ['chaser', W / 2 - 430, 300],
    ['weaver', W / 2 + 430, 280],
    ['splitter', W / 2 - 360, 640],
    ['tank', W / 2 + 380, 620],
    ['mini', W / 2 + 120, 190],
  ];
  for (const [kind, x, y] of cast) world.spawnEnemy(kind, x, y);
  world.burst(W / 2 - 430, 300, COLORS.magenta, 6, 120, 0.8, 2.4);
  world.burst(W / 2 + 380, 620, COLORS.ember, 6, 120, 0.8, 2.4);
  return { screen: SCREEN_TITLE, best: 8450 };
}

function stagePlay(world) {
  world.reset();
  const state = quietArena(world);
  state.wave = 4;
  state.score = 12750;
  state.combo = 14;
  state.comboTime = 1.8;
  state.kills = 57;
  const p = state.player;
  p.x = 520;
  p.y = 560;
  p.hp = 72;
  p.angle = Math.atan2(300 - p.y, 900 - p.x);
  p.flashT = 0.02;
  p.spreadT = 6;
  p.bombs = 2;
  bulletRow(state, p.x + 30, p.y - 14, p.angle, 4, 74);
  world.spawnEnemy('chaser', 985, 262);
  world.spawnEnemy('chaser', 1085, 425);
  world.spawnEnemy('chaser', 250, 390);
  world.spawnEnemy('weaver', 862, 178);
  world.spawnEnemy('splitter', 1180, 565);
  const tank = world.spawnEnemy('tank', 1245, 305);
  tank.hp = 11;
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
  state.wave = 5;
  state.score = 21300;
  state.combo = 22;
  state.comboTime = 2.1;
  state.kills = 96;
  state.lives = 2;
  const boss = world.spawnEnemy('boss', W / 2 + 130, 202);
  boss.hp = Math.round(boss.maxHp * 0.62);
  const p = state.player;
  p.x = 655;
  p.y = 700;
  p.hp = 55;
  p.angle = Math.atan2(boss.y - p.y, boss.x - p.x);
  p.flashT = 0.02;
  p.shieldT = 4;
  p.bombs = 1;
  bulletRow(state, p.x + 16, p.y - 30, p.angle, 5, 82);
  // The boss's radial burst, frozen on its way out, plus an aimed trio.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.4;
    state.ebullets.push({
      x: boss.x + Math.cos(a) * 120, y: boss.y + Math.sin(a) * 120,
      vx: Math.cos(a) * 196, vy: Math.sin(a) * 196, life: 3,
    });
  }
  world.spawnEnemy('chaser', 210, 300);
  world.spawnEnemy('chaser', 1235, 330);
  world.burst(boss.x - 40, boss.y + 30, COLORS.ember, 16, 260, 0.7, 3);
  world.burst(p.x + 90, p.y - 120, COLORS.cyan, 8, 180, 0.5, 2.4);
  world.floatText(boss.x - 90, boss.y + 84, '+300', COLORS.ember, 17);
  return { screen: SCREEN_PLAY, best: 24000 };
}

function stageOver(world) {
  world.reset();
  const state = quietArena(world);
  state.wave = 6;
  state.score = 18740;
  state.kills = 132;
  state.bestCombo = 34;
  state.combo = 0;
  state.comboTime = 0;
  state.lives = 0;
  state.player.alive = false;
  state.player.hp = 0;
  state.player.bombs = 0;
  world.spawnEnemy('chaser', 430, 300);
  world.spawnEnemy('chaser', 1010, 260);
  world.spawnEnemy('weaver', 900, 620);
  world.spawnEnemy('splitter', 300, 610);
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
