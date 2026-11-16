// The Neon Swarm simulation: player, bullets, five enemy kinds plus the boss, particles,
// floating score text, power-up drops, waves and the combo multiplier. Everything advances in
// fixed steps and every random choice comes from the seeded rng handed in at creation, so a
// seed always plays the same game — that is what makes the screenshot scenes repeatable.
// step() returns a bitmask of events; the shell turns them into sounds and announcements.

import { BOLT, COLORS, ENEMY, H, PLAYER, POWER_KINDS, W } from './config.js';
import { chance, pick, range } from './random.js';

export const EVENT_SHOOT = 1;
export const EVENT_HITMARK = 2;
export const EVENT_KILL = 4;
export const EVENT_HURT = 8;
export const EVENT_DEATH = 16;
export const EVENT_OVER = 32;
export const EVENT_POWER = 64;
export const EVENT_BOMB = 128;
export const EVENT_WAVE = 256;
export const EVENT_BOSS = 512;
export const EVENT_BOSSDOWN = 1024;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(rng) {
  const state = {
    time: 0,
    wave: 0,
    score: 0,
    combo: 0,
    comboTime: 0,
    bestCombo: 0,
    lives: PLAYER.lives,
    kills: 0,
    player: null,
    bullets: [],
    ebullets: [],
    enemies: [],
    parts: [],
    texts: [],
    ups: [],
    shake: 0,
    flash: 0,
    flashColor: COLORS.cyan,
    phase: 'announce',
    phaseT: 0,
    queue: [],
    spawnT: 0,
    trickleT: 0,
    boss: null,
    stars: [],
    nebs: [],
  };

  // The backdrop: three star layers (parallax speeds by depth) and soft nebula blobs, all
  // placed once from the seed. Star positions are bases; the renderer scrolls them by time.
  for (let layer = 0; layer < 3; layer += 1) {
    const count = [90, 60, 36][layer];
    for (let i = 0; i < count; i += 1) {
      state.stars.push({ x: rng() * W, y: rng() * H, z: layer, s: range(rng, 0.7, 1.9 - layer * 0.3) });
    }
  }
  const nebColors = ['#232a6e', '#3a1c5e', '#0d3a4a', '#2a1450', '#123a5e'];
  for (let i = 0; i < 6; i += 1) {
    state.nebs.push({ x: rng() * W, y: rng() * H, r: range(rng, 240, 520), color: nebColors[i % nebColors.length] });
  }

  function freshPlayer() {
    return {
      x: W / 2, y: H * 0.64, vx: 0, vy: 0, angle: -Math.PI / 2,
      r: PLAYER.radius, hp: PLAYER.maxHp, fireCd: 0, flashT: 0,
      spreadT: 0, shieldT: 0, bombs: 1, invulnT: 0, alive: true, trailT: 0,
    };
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      if (state.parts.length > 460) return;
      const a = rng() * TAU;
      const v = range(rng, speed * 0.25, speed);
      state.parts.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: range(rng, life * 0.4, life), maxLife: life,
        size: range(rng, size * 0.5, size), color,
      });
    }
  }

  function floatText(x, y, text, color, size = 17) {
    state.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9 });
  }

  function spawnEnemy(kind, x, y) {
    const spec = ENEMY[kind];
    const hp = kind === 'boss' ? spec.hp + state.wave * 26 : spec.hp;
    const enemy = {
      kind, x, y, vx: 0, vy: 0, hp, maxHp: hp, r: spec.radius,
      age: range(rng, 0, 10), seed: rng() * TAU, fireT: range(rng, 1.2, 2.6),
      burstT: 2.4, spreadT: 1.2, flashT: 0, angle: Math.PI / 2,
    };
    state.enemies.push(enemy);
    if (kind === 'boss') state.boss = enemy;
    return enemy;
  }

  function edgeSpawn(kind) {
    const p = state.player;
    for (let tries = 0; tries < 8; tries += 1) {
      const side = rng();
      let x;
      let y;
      if (side < 0.5) { x = rng() * W; y = -30; }
      else if (side < 0.75) { x = -30; y = rng() * H * 0.6; }
      else { x = W + 30; y = rng() * H * 0.6; }
      if (!p || dist2(x, y, p.x, p.y) > 300 * 300 || tries === 7) return spawnEnemy(kind, x, y);
    }
    return null;
  }

  function startWave(n) {
    state.wave = n;
    state.phase = 'announce';
    state.queue = [];
    state.boss = null;
    if (n % 5 === 0) {
      state.phaseT = 3.0;
      state.queue.push('boss');
      state.trickleT = 5;
      return EVENT_BOSS;
    }
    state.phaseT = 2.1;
    let budget = 6 + n * 3;
    const kinds = ['chaser'];
    if (n >= 2) kinds.push('weaver');
    if (n >= 3) kinds.push('splitter');
    if (n >= 4) kinds.push('tank');
    const cost = { chaser: 1, weaver: 2, splitter: 3, tank: 4 };
    while (budget > 0) {
      const kind = pick(rng, kinds);
      if (cost[kind] > budget && kind !== 'chaser') continue;
      state.queue.push(kind);
      budget -= cost[kind];
    }
    // Shuffle the queue so waves feel mixed rather than sorted.
    for (let i = state.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
    }
    return EVENT_WAVE;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTime = 0;
    state.bestCombo = 0;
    state.kills = 0;
    state.lives = PLAYER.lives;
    state.player = freshPlayer();
    state.bullets.length = 0;
    state.ebullets.length = 0;
    state.enemies.length = 0;
    state.parts.length = 0;
    state.texts.length = 0;
    state.ups.length = 0;
    state.shake = 0;
    state.flash = 0;
    startWave(1);
  }

  function multiplier() {
    return Math.min(8, 1 + Math.floor(state.combo / 10));
  }

  function dropRoll(x, y, generous) {
    if (!chance(rng, generous ? 0.14 : 0.05)) return;
    const kind = pick(rng, POWER_KINDS);
    state.ups.push({ kind, x, y, t: 0, life: 9 });
  }

  function killEnemy(enemy, events) {
    const spec = ENEMY[enemy.kind];
    state.combo += 1;
    state.comboTime = 2.5;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gained = spec.score * multiplier();
    state.score += gained;
    state.kills += 1;
    floatText(enemy.x, enemy.y - enemy.r, `+${gained}`, spec.color, enemy.kind === 'boss' ? 30 : 17);
    burst(enemy.x, enemy.y, spec.color, enemy.kind === 'boss' ? 90 : 10 + enemy.r, enemy.kind === 'boss' ? 380 : 240, 0.7, 3.2);
    burst(enemy.x, enemy.y, COLORS.ink, enemy.kind === 'boss' ? 30 : 4, 160, 0.4, 2);
    state.shake = Math.min(16, state.shake + (enemy.kind === 'boss' ? 16 : enemy.r * 0.16));
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 3; i += 1) {
        const mini = spawnEnemy('mini', enemy.x + range(rng, -14, 14), enemy.y + range(rng, -14, 14));
        const a = (i / 3) * TAU + rng();
        mini.vx = Math.cos(a) * 130;
        mini.vy = Math.sin(a) * 130;
      }
    }
    if (enemy.kind === 'boss') {
      state.boss = null;
      state.flash = 0.55;
      state.flashColor = COLORS.ember;
      dropRoll(enemy.x - 30, enemy.y, true);
      dropRoll(enemy.x + 30, enemy.y, true);
      return events | EVENT_BOSSDOWN;
    }
    dropRoll(enemy.x, enemy.y, enemy.kind !== 'mini');
    return events | EVENT_KILL;
  }

  function damagePlayer(dmg, events) {
    const p = state.player;
    if (!p.alive || p.invulnT > 0) return events;
    if (p.shieldT > 0) {
      burst(p.x, p.y, COLORS.green, 8, 200, 0.35, 2.4);
      return events | EVENT_HITMARK;
    }
    p.hp -= dmg;
    p.invulnT = PLAYER.hitInvuln;
    state.shake = Math.min(18, state.shake + 9);
    state.flash = Math.max(state.flash, 0.28);
    state.flashColor = COLORS.red;
    burst(p.x, p.y, COLORS.red, 14, 260, 0.5, 3);
    events |= EVENT_HURT;
    if (p.hp > 0) return events;
    // Ship lost.
    state.lives -= 1;
    burst(p.x, p.y, COLORS.cyan, 60, 340, 0.9, 3.6);
    burst(p.x, p.y, COLORS.amber, 30, 220, 0.7, 3);
    state.shake = 18;
    events |= EVENT_DEATH;
    if (state.lives <= 0) {
      p.alive = false;
      return events | EVENT_OVER;
    }
    const keepBombs = p.bombs;
    state.player = freshPlayer();
    state.player.bombs = keepBombs;
    state.player.invulnT = PLAYER.respawnInvuln;
    return events;
  }

  function detonateBomb(events) {
    const p = state.player;
    if (!p.alive || p.bombs <= 0) return events;
    p.bombs -= 1;
    state.flash = 0.7;
    state.flashColor = COLORS.amber;
    state.shake = 16;
    state.ebullets.length = 0;
    const snapshot = [...state.enemies];
    for (const enemy of snapshot) {
      enemy.hp -= 60;
      if (enemy.hp <= 0 && state.enemies.includes(enemy)) {
        state.enemies.splice(state.enemies.indexOf(enemy), 1);
        events = killEnemy(enemy, events);
      } else {
        burst(enemy.x, enemy.y, COLORS.amber, 8, 220, 0.4, 2.6);
      }
    }
    return events | EVENT_BOMB;
  }

  function stepPlayer(dt, ctl, events) {
    const p = state.player;
    if (!p.alive) return events;
    p.vx += ctl.move.x * PLAYER.accel * dt;
    p.vy += ctl.move.y * PLAYER.accel * dt;
    const damp = Math.max(0, 1 - PLAYER.drag * dt);
    p.vx *= damp;
    p.vy *= damp;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > PLAYER.speed) {
      p.vx = (p.vx / speed) * PLAYER.speed;
      p.vy = (p.vy / speed) * PLAYER.speed;
    }
    p.x = Math.min(W - p.r, Math.max(p.r, p.x + p.vx * dt));
    p.y = Math.min(H - p.r, Math.max(p.r, p.y + p.vy * dt));
    p.angle = Math.atan2(ctl.aim.y - p.y, ctl.aim.x - p.x);
    p.fireCd -= dt;
    p.flashT = Math.max(0, p.flashT - dt);
    p.spreadT = Math.max(0, p.spreadT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    // Engine trail while thrusting.
    p.trailT -= dt;
    if ((ctl.move.x !== 0 || ctl.move.y !== 0) && p.trailT <= 0) {
      p.trailT = 0.03;
      const back = p.angle + Math.PI;
      state.parts.push({
        x: p.x + Math.cos(back) * p.r, y: p.y + Math.sin(back) * p.r,
        vx: Math.cos(back) * 60 + range(rng, -16, 16), vy: Math.sin(back) * 60 + range(rng, -16, 16),
        life: 0.3, maxLife: 0.3, size: 2.2, color: COLORS.cyan,
      });
    }
    if (ctl.fire && p.fireCd <= 0) {
      p.fireCd = 1 / PLAYER.fireRate;
      p.flashT = 0.05;
      const angles = p.spreadT > 0 ? [-0.16, 0, 0.16] : [0];
      for (const off of angles) {
        const a = p.angle + off;
        state.bullets.push({
          x: p.x + Math.cos(p.angle) * (p.r + 6), y: p.y + Math.sin(p.angle) * (p.r + 6),
          vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
          life: PLAYER.bulletLife,
        });
      }
      events |= EVENT_SHOOT;
    }
    if (ctl.bomb) events = detonateBomb(events);
    return events;
  }

  function stepEnemies(dt, events) {
    const p = state.player;
    for (const e of state.enemies) {
      e.age += dt;
      e.flashT = Math.max(0, e.flashT - dt);
      const spec = ENEMY[e.kind];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      if (e.kind === 'boss') {
        const targetX = W / 2 + Math.sin(e.age * 0.35) * 400;
        const targetY = 202 + Math.sin(e.age * 0.9) * 26;
        e.x += (targetX - e.x) * Math.min(1, dt * 0.8);
        e.y += (targetY - e.y) * Math.min(1, dt * 0.8);
        e.angle = Math.atan2(dy, dx);
        e.spreadT -= dt;
        e.burstT -= dt;
        if (p.alive && e.spreadT <= 0) {
          e.spreadT = 1.5;
          for (const off of [-0.18, 0, 0.18]) {
            const a = Math.atan2(dy, dx) + off;
            state.ebullets.push({ x: e.x, y: e.y + 30, vx: Math.cos(a) * BOLT.speed, vy: Math.sin(a) * BOLT.speed, life: BOLT.life });
          }
        }
        if (p.alive && e.burstT <= 0) {
          e.burstT = 3.1;
          const base = rng() * TAU;
          for (let i = 0; i < 14; i += 1) {
            const a = base + (i / 14) * TAU;
            state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * BOLT.speed * 0.8, vy: Math.sin(a) * BOLT.speed * 0.8, life: BOLT.life });
          }
        }
        continue;
      }
      let vx = ux * spec.speed;
      let vy = uy * spec.speed;
      if (e.kind === 'weaver') {
        const px = -uy;
        const py = ux;
        const w = Math.sin(e.age * 5.2 + e.seed) * 120;
        vx += px * w;
        vy += py * w;
      }
      if (e.kind === 'mini') {
        vx += Math.cos(e.age * 9 + e.seed) * 40;
        vy += Math.sin(e.age * 7.7 + e.seed) * 40;
      }
      e.vx += (vx - e.vx) * Math.min(1, dt * 3.2);
      e.vy += (vy - e.vy) * Math.min(1, dt * 3.2);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle = Math.atan2(e.vy, e.vx);
      if (e.kind === 'tank' && p.alive) {
        e.fireT -= dt;
        if (e.fireT <= 0 && d < 640) {
          e.fireT = range(rng, 2.0, 2.8);
          state.ebullets.push({ x: e.x, y: e.y, vx: ux * BOLT.speed, vy: uy * BOLT.speed, life: BOLT.life });
        }
      }
    }
    // Gentle separation so swarms read as individuals, not one blob.
    const list = state.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const rr = a.r + b.r;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          const px = (a.x - b.x) * push;
          const py = (a.y - b.y) * push;
          if (a.kind !== 'boss') { a.x += px; a.y += py; }
          if (b.kind !== 'boss') { b.x -= px; b.y -= py; }
        }
      }
    }
    return events;
  }

  function stepCollisions(events) {
    const p = state.player;
    // Player bullets vs enemies.
    for (let bi = state.bullets.length - 1; bi >= 0; bi -= 1) {
      const b = state.bullets[bi];
      let consumed = false;
      for (let ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
        const e = state.enemies[ei];
        const rr = e.r + 4;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          consumed = true;
          e.hp -= 1;
          e.flashT = 0.07;
          burst(b.x, b.y, ENEMY[e.kind].color, 2, 130, 0.25, 1.8);
          if (e.hp <= 0) {
            state.enemies.splice(ei, 1);
            events = killEnemy(e, events);
          } else {
            events |= EVENT_HITMARK;
          }
          break;
        }
      }
      if (consumed) state.bullets.splice(bi, 1);
    }
    if (p.alive) {
      // Enemy bolts vs player.
      for (let bi = state.ebullets.length - 1; bi >= 0; bi -= 1) {
        const b = state.ebullets[bi];
        const rr = p.r + BOLT.radius;
        if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
          state.ebullets.splice(bi, 1);
          events = damagePlayer(BOLT.damage, events);
          if (!p.alive) break;
        }
      }
      // Enemies vs player (ramming).
      if (p.alive) {
        for (let ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
          const e = state.enemies[ei];
          const rr = p.r + e.r - 2;
          if (dist2(p.x, p.y, e.x, e.y) < rr * rr) {
            if (e.kind === 'boss') {
              events = damagePlayer(ENEMY.boss.damage, events);
              p.vx = -e.vx * 4 - (p.x - e.x) * 6;
              p.vy = (p.y - e.y) * 6;
            } else {
              state.enemies.splice(ei, 1);
              burst(e.x, e.y, ENEMY[e.kind].color, 12, 230, 0.5, 2.8);
              events = damagePlayer(ENEMY[e.kind].damage, events);
            }
            if (!p.alive) break;
          }
        }
      }
      // Power-ups vs player.
      for (let ui = state.ups.length - 1; ui >= 0; ui -= 1) {
        const up = state.ups[ui];
        const rr = p.r + 20;
        if (dist2(p.x, p.y, up.x, up.y) < rr * rr) {
          state.ups.splice(ui, 1);
          if (up.kind === 'spread') { p.spreadT = 12; floatText(p.x, p.y - 26, 'SPREAD SHOT', COLORS.cyan, 16); }
          if (up.kind === 'shield') { p.shieldT = 10; floatText(p.x, p.y - 26, 'SHIELD UP', COLORS.green, 16); }
          if (up.kind === 'bomb') { p.bombs = Math.min(3, p.bombs + 1); floatText(p.x, p.y - 26, '+1 BOMB', COLORS.amber, 16); }
          events |= EVENT_POWER;
        }
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (let i = state.parts.length - 1; i >= 0; i -= 1) {
      const part = state.parts[i];
      part.life -= dt;
      if (part.life <= 0) { state.parts.splice(i, 1); continue; }
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vx *= 1 - 2.4 * dt;
      part.vy *= 1 - 2.4 * dt;
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.life -= dt;
      t.y -= 44 * dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    for (let i = state.ups.length - 1; i >= 0; i -= 1) {
      const up = state.ups[i];
      up.t += dt;
      up.life -= dt;
      up.y += 26 * dt;
      up.x += Math.sin(up.t * 2.4) * 12 * dt;
      if (up.life <= 0 || up.y > H + 24) state.ups.splice(i, 1);
    }
  }

  /**
   * Advance the world one step. `ctl` is { move, aim, fire, bomb }; in attract mode (the
   * title screen) enemies drift decoratively and nothing can be hurt.
   */
  function step(dt, ctl, attract = false) {
    let events = 0;
    state.time += dt;
    state.shake = Math.max(0, state.shake - 60 * dt);
    state.flash = Math.max(0, state.flash - 1.8 * dt);
    if (state.comboTime > 0) {
      state.comboTime -= dt;
      if (state.comboTime <= 0) state.combo = 0;
    }
    stepFx(dt);
    if (attract) {
      // Decorative drift for the title screen: enemies circle slowly, nobody fights.
      for (const e of state.enemies) {
        e.age += dt;
        e.x += Math.cos(e.age * 0.4 + e.seed) * 14 * dt;
        e.y += Math.sin(e.age * 0.3 + e.seed) * 10 * dt;
        e.angle += dt * 0.4;
      }
      return 0;
    }
    // Wave phase machine.
    if (state.phase === 'announce') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        state.phase = 'active';
        state.spawnT = 0;
      }
    } else if (state.phase === 'active') {
      if (state.queue.length > 0) {
        state.spawnT -= dt;
        if (state.spawnT <= 0) {
          state.spawnT = 0.42;
          edgeSpawn(state.queue.shift());
        }
      } else if (state.wave % 5 === 0 && state.boss) {
        state.trickleT -= dt;
        if (state.trickleT <= 0 && state.enemies.length < 5) {
          state.trickleT = 6;
          edgeSpawn('chaser');
        }
      } else if (state.enemies.length === 0) {
        state.phase = 'intermission';
        state.phaseT = 1.7;
      }
    } else if (state.phase === 'intermission') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) events |= startWave(state.wave + 1);
    }
    events = stepPlayer(dt, ctl, events);
    events = stepEnemies(dt, events);
    // Bullets fly.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) state.bullets.splice(i, 1);
    }
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) state.ebullets.splice(i, 1);
    }
    events = stepCollisions(events);
    return events;
  }

  reset();
  return { state, reset, step, spawnEnemy, burst, floatText, multiplier: () => multiplier() };
}
