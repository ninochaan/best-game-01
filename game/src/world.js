// The Neon Swarm simulation: player, bullets, six enemy kinds plus the boss (which enrages
// into a spiral barrage at low hull), the lance beam and nova ring weapons, particles,
// floating score text, power-up drops, waves and the combo multiplier. Clearing a wave opens
// the upgrade draft — three choices from the catalogue in upgrades.js that reshape the rest
// of the run: gun damage and fire rate, hull repair and plating, a tractor field, chain
// insurance, longer weapon power-ups, a bigger bomb rack, and wingman drones that orbit the
// ship and fire on their own. Everything advances in fixed steps and every random choice
// comes from the seeded rng handed in at creation, so a seed always plays the same game —
// that is what makes the screenshot scenes repeatable.
// step() returns a bitmask of events; the shell turns them into sounds and announcements.

import { BOLT, COLORS, DRONE, ENEMY, H, LANCE, MAGNET, NOVA, PLAYER, POWER_KINDS, SNIPER, W } from './config.js';
import { UPGRADES } from './upgrades.js';
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
export const EVENT_LANCE = 2048;
export const EVENT_NOVA = 4096;
export const EVENT_ENRAGE = 8192;
export const EVENT_SNIPE = 16384;
export const EVENT_DRAFT = 32768;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** The draft modifiers at their untaken values; applyUpgrade grows them from here. */
function freshMods() {
  return { damage: 1, fireRate: 1, regen: 0, magnet: 0, saver: 0, weaponTime: 1, bombMax: 3 };
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
    // The run's build: levels taken per upgrade id, the derived modifiers the systems
    // read, the ordered list of picks (the game-over summary shows it), the live drones,
    // the three draft offers while the draft is open, and the gun accuracy tally.
    maxHp: PLAYER.maxHp,
    levels: {},
    mods: freshMods(),
    taken: [],
    drones: [],
    draft: null,
    chainSaved: false,
    stats: { fired: 0, hit: 0 },
    player: null,
    bullets: [],
    ebullets: [],
    beams: [],
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
      r: PLAYER.radius, hp: state.maxHp, maxHp: state.maxHp, fireCd: 0, flashT: 0,
      spreadT: 0, shieldT: 0, lanceT: 0, novaT: 0, novaCd: 0,
      bombs: 1, invulnT: 0, alive: true, trailT: 0,
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
      charge: 0, enraged: false, spiralT: 0.5, spiralA: 0,
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
    if (n >= 3) kinds.push('splitter', 'sniper');
    if (n >= 4) kinds.push('tank');
    const cost = { chaser: 1, weaver: 2, splitter: 3, sniper: 3, tank: 4 };
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

  /**
   * Open the draft: draw three distinct, not-yet-maxed upgrades from the seeded rng and
   * hold the run in the 'draft' phase until chooseDraft is called. When everything is
   * maxed (a very long run) there is nothing to offer and the next wave just rolls in.
   */
  function openDraft() {
    const pool = UPGRADES.filter((up) => (state.levels[up.id] ?? 0) < up.max);
    if (pool.length === 0) {
      state.phase = 'intermission';
      state.phaseT = 1.2;
      return 0;
    }
    const offers = [];
    while (offers.length < Math.min(3, pool.length)) {
      const i = Math.floor(rng() * pool.length);
      offers.push(pool.splice(i, 1)[0].id);
    }
    state.draft = offers;
    state.phase = 'draft';
    return EVENT_DRAFT;
  }

  /** Apply one taken upgrade: grow its modifier, and run any immediate effect. */
  function applyUpgrade(id) {
    const p = state.player;
    state.levels[id] = (state.levels[id] ?? 0) + 1;
    state.taken.push(id);
    const m = state.mods;
    if (id === 'damage') m.damage *= 1.35;
    else if (id === 'rapid') m.fireRate *= 1.25;
    else if (id === 'regen') m.regen += 1.4;
    else if (id === 'magnet') m.magnet += 1;
    else if (id === 'saver') m.saver += 1;
    else if (id === 'amp') m.weaponTime *= 1.4;
    else if (id === 'plating') {
      state.maxHp += 25;
      if (p) {
        p.maxHp = state.maxHp;
        p.hp = Math.min(state.maxHp, p.hp + 25);
      }
    } else if (id === 'bombs') {
      m.bombMax += 1;
      if (p) p.bombs = Math.min(m.bombMax, p.bombs + 1);
    } else if (id === 'drone') {
      state.drones.push({ angle: rng() * TAU, x: p ? p.x : W / 2, y: p ? p.y : H / 2, face: 0, fireCd: 0.4, flashT: 0 });
    }
  }

  /**
   * Take draft offer `index` (0..2): apply it, close the draft and launch the next wave.
   * Returns the wave-start events so the shell can make its noises; a no-op outside draft.
   */
  function chooseDraft(index) {
    if (state.phase !== 'draft' || !state.draft) return 0;
    const id = state.draft[index];
    if (!id) return 0;
    state.draft = null;
    applyUpgrade(id);
    return startWave(state.wave + 1) | EVENT_POWER;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTime = 0;
    state.bestCombo = 0;
    state.kills = 0;
    state.lives = PLAYER.lives;
    state.maxHp = PLAYER.maxHp;
    state.levels = {};
    state.mods = freshMods();
    state.taken = [];
    state.drones = [];
    state.draft = null;
    state.chainSaved = false;
    state.stats = { fired: 0, hit: 0 };
    state.player = freshPlayer();
    state.bullets.length = 0;
    state.ebullets.length = 0;
    state.beams.length = 0;
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
    // Every fresh ten-chain earns the insurance back: the save is once per chain.
    if (state.combo % 10 === 0) state.chainSaved = false;
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

  /**
   * One lance shot: an instant beam from the ship's nose along its aim that pierces
   * everything in its path. The beam visual is left in state.beams for the renderer to
   * fade; the damage is applied here, back to front, so a splitter bursting into minis
   * does not shield whatever stood behind it.
   */
  function fireLance(p, events) {
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    const x0 = p.x + dx * (p.r + 6);
    const y0 = p.y + dy * (p.r + 6);
    state.beams.push({
      x1: x0, y1: y0,
      x2: x0 + dx * LANCE.length, y2: y0 + dy * LANCE.length,
      life: 0.1, maxLife: 0.1,
    });
    for (let ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
      const e = state.enemies[ei];
      const along = (e.x - x0) * dx + (e.y - y0) * dy;
      const t = Math.max(0, Math.min(LANCE.length, along));
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const rr = e.r + LANCE.width;
      if (dist2(cx, cy, e.x, e.y) >= rr * rr) continue;
      e.hp -= LANCE.damage * state.mods.damage;
      e.flashT = 0.08;
      burst(cx, cy, COLORS.violet, 3, 170, 0.3, 2.2);
      burst(cx, cy, COLORS.ink, 1, 110, 0.2, 1.6);
      if (e.hp <= 0) {
        state.enemies.splice(ei, 1);
        events = killEnemy(e, events);
      } else {
        events |= EVENT_HITMARK;
      }
    }
    state.shake = Math.min(16, state.shake + 1.2);
    return events | EVENT_LANCE;
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
    // Nano repair: a slow, steady patch that never overheals the plated maximum.
    if (state.mods.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + state.mods.regen * dt);
    p.fireCd -= dt;
    p.flashT = Math.max(0, p.flashT - dt);
    p.spreadT = Math.max(0, p.spreadT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.lanceT = Math.max(0, p.lanceT - dt);
    p.novaT = Math.max(0, p.novaT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    // Engine trail: a two-tone exhaust plume behind the hull, denser the faster she flies.
    p.trailT -= dt;
    const thrust = Math.hypot(p.vx, p.vy);
    if (thrust > 30 && p.trailT <= 0) {
      p.trailT = 0.024;
      const back = Math.atan2(-p.vy, -p.vx);
      const bx = p.x + Math.cos(back) * (p.r - 2);
      const by = p.y + Math.sin(back) * (p.r - 2);
      state.parts.push({
        x: bx + range(rng, -3, 3), y: by + range(rng, -3, 3),
        vx: Math.cos(back) * 70 + range(rng, -20, 20), vy: Math.sin(back) * 70 + range(rng, -20, 20),
        life: 0.36, maxLife: 0.36, size: range(rng, 1.8, 3.4), color: COLORS.cyan,
      });
      state.parts.push({
        x: bx, y: by,
        vx: Math.cos(back) * 44 + range(rng, -12, 12), vy: Math.sin(back) * 44 + range(rng, -12, 12),
        life: 0.5, maxLife: 0.5, size: range(rng, 1.2, 2.2), color: COLORS.lilac,
      });
    }
    // The nova, while it lasts: a full ring of bullets every interval, trigger or not.
    if (p.novaT > 0) {
      p.novaCd -= dt;
      if (p.novaCd <= 0) {
        p.novaCd = NOVA.interval;
        const base = rng() * TAU;
        for (let i = 0; i < NOVA.bullets; i += 1) {
          const a = base + (i / NOVA.bullets) * TAU;
          state.bullets.push({
            x: p.x + Math.cos(a) * (p.r + 4), y: p.y + Math.sin(a) * (p.r + 4),
            vx: Math.cos(a) * NOVA.bulletSpeed, vy: Math.sin(a) * NOVA.bulletSpeed,
            life: NOVA.bulletLife, dmg: state.mods.damage, src: 'nova',
          });
        }
        burst(p.x, p.y, COLORS.magenta, 10, 150, 0.35, 2.4);
        events |= EVENT_NOVA;
      }
    }
    if (ctl.fire && p.fireCd <= 0) {
      if (p.lanceT > 0) {
        p.fireCd = 1 / LANCE.fireRate;
        p.flashT = 0.05;
        events = fireLance(p, events);
      } else {
        p.fireCd = 1 / (PLAYER.fireRate * state.mods.fireRate);
        p.flashT = 0.05;
        const angles = p.spreadT > 0 ? [-0.16, 0, 0.16] : [0];
        for (const off of angles) {
          const a = p.angle + off;
          state.bullets.push({
            x: p.x + Math.cos(p.angle) * (p.r + 6), y: p.y + Math.sin(p.angle) * (p.r + 6),
            vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
            life: PLAYER.bulletLife, dmg: state.mods.damage, src: 'gun',
          });
          state.stats.fired += 1;
        }
        events |= EVENT_SHOOT;
      }
    }
    if (ctl.bomb) events = detonateBomb(events);
    return events;
  }

  /**
   * The wingman drones: each one rides its orbit around the ship, faces the nearest
   * hostile inside its range and fires at a steady cadence. Drone shots ride the same
   * bullet list as the gun's (tagged src 'drone') at a fraction of the gun's damage, so
   * collisions, trails and the accuracy tally treat them like any other shot.
   */
  function stepDrones(dt, events) {
    const p = state.player;
    for (const d of state.drones) {
      d.angle += dt * 1.9;
      d.x = p.x + Math.cos(d.angle) * DRONE.orbit;
      d.y = p.y + Math.sin(d.angle) * DRONE.orbit;
      d.flashT = Math.max(0, d.flashT - dt);
      d.fireCd -= dt;
      let target = null;
      let bestD2 = DRONE.range * DRONE.range;
      for (const e of state.enemies) {
        const dd = dist2(d.x, d.y, e.x, e.y);
        if (dd < bestD2) { bestD2 = dd; target = e; }
      }
      d.face = target ? Math.atan2(target.y - d.y, target.x - d.x) : d.angle + Math.PI / 2;
      if (!target || !p.alive || d.fireCd > 0) continue;
      d.fireCd = 1 / DRONE.fireRate;
      d.flashT = 0.05;
      const a = d.face;
      state.bullets.push({
        x: d.x + Math.cos(a) * 12, y: d.y + Math.sin(a) * 12,
        vx: Math.cos(a) * DRONE.bulletSpeed, vy: Math.sin(a) * DRONE.bulletSpeed,
        life: 1.1, dmg: DRONE.damage * state.mods.damage, src: 'drone',
      });
      state.stats.fired += 1;
      events |= EVENT_SHOOT;
    }
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
        // Below 40% hull the Dreadnought enrages: it presses lower and faster, and a
        // twin spiral barrage joins its aimed spread and radial bursts.
        if (!e.enraged && e.hp <= e.maxHp * 0.4) {
          e.enraged = true;
          burst(e.x, e.y, COLORS.ember, 42, 330, 0.8, 3.4);
          burst(e.x, e.y, COLORS.ink, 16, 200, 0.5, 2.4);
          floatText(e.x, e.y + e.r + 30, 'DREADNOUGHT ENRAGED', COLORS.red, 24);
          state.shake = Math.min(18, state.shake + 8);
          events |= EVENT_ENRAGE;
        }
        const targetX = W / 2 + Math.sin(e.age * 0.35) * 400;
        const targetY = e.enraged ? 224 + Math.sin(e.age * 1.25) * 42 : 202 + Math.sin(e.age * 0.9) * 26;
        const ease = e.enraged ? 1.05 : 0.8;
        e.x += (targetX - e.x) * Math.min(1, dt * ease);
        e.y += (targetY - e.y) * Math.min(1, dt * ease);
        e.angle = Math.atan2(dy, dx);
        e.spreadT -= dt;
        e.burstT -= dt;
        if (p.alive && e.spreadT <= 0) {
          e.spreadT = e.enraged ? 1.15 : 1.5;
          for (const off of [-0.18, 0, 0.18]) {
            const a = Math.atan2(dy, dx) + off;
            state.ebullets.push({ x: e.x, y: e.y + 30, vx: Math.cos(a) * BOLT.speed, vy: Math.sin(a) * BOLT.speed, life: BOLT.life });
          }
        }
        if (p.alive && e.burstT <= 0) {
          e.burstT = e.enraged ? 2.5 : 3.1;
          const base = rng() * TAU;
          for (let i = 0; i < 14; i += 1) {
            const a = base + (i / 14) * TAU;
            state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * BOLT.speed * 0.8, vy: Math.sin(a) * BOLT.speed * 0.8, life: BOLT.life });
          }
        }
        if (p.alive && e.enraged) {
          e.spiralT -= dt;
          if (e.spiralT <= 0) {
            e.spiralT = 0.16;
            e.spiralA += 0.45;
            for (const off of [0, Math.PI]) {
              const a = e.spiralA + off;
              state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * BOLT.speed * 0.78, vy: Math.sin(a) * BOLT.speed * 0.78, life: BOLT.life });
            }
          }
        }
        continue;
      }
      if (e.kind === 'sniper') {
        // Keep the band: close in beyond maxRange, back off inside minRange, strafe
        // between. When the refire timer runs out in sight range it stops, charges
        // (the renderer draws the sight line), and looses one fast, heavy bolt.
        let vx = 0;
        let vy = 0;
        if (e.charge > 0) {
          e.charge -= dt;
          vx = e.vx * 0.2;
          vy = e.vy * 0.2;
          if (e.charge <= 0 && p.alive) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            state.ebullets.push({
              x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
              vx: Math.cos(a) * SNIPER.boltSpeed, vy: Math.sin(a) * SNIPER.boltSpeed,
              life: BOLT.life, dmg: SNIPER.boltDamage, big: true,
            });
            e.fireT = range(rng, SNIPER.refireMin, SNIPER.refireMax);
            burst(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, COLORS.acid, 5, 150, 0.3, 2.2);
            events |= EVENT_SNIPE;
          }
        } else {
          if (d > SNIPER.maxRange) { vx = ux * spec.speed; vy = uy * spec.speed; }
          else if (d < SNIPER.minRange) { vx = -ux * spec.speed * 0.85; vy = -uy * spec.speed * 0.85; }
          else {
            const dir = Math.sin(e.seed) > 0 ? 1 : -1;
            vx = -uy * dir * spec.speed * 0.45;
            vy = ux * dir * spec.speed * 0.45;
          }
          e.fireT -= dt;
          if (e.fireT <= 0 && p.alive && d < SNIPER.sightRange) e.charge = SNIPER.chargeTime;
          else if (e.fireT <= 0) e.fireT = 0.4;
        }
        e.vx += (vx - e.vx) * Math.min(1, dt * 3.2);
        e.vy += (vy - e.vy) * Math.min(1, dt * 3.2);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.angle = Math.atan2(p.y - e.y, p.x - e.x);
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
          e.hp -= b.dmg ?? 1;
          if (b.src !== 'nova') state.stats.hit += 1;
          e.flashT = 0.07;
          // A visible shove on the light hulls; heavies and the boss shrug it off.
          if (e.kind !== 'boss' && e.kind !== 'tank') {
            const bl = Math.hypot(b.vx, b.vy) || 1;
            e.vx += (b.vx / bl) * 55;
            e.vy += (b.vy / bl) * 55;
          }
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
          events = damagePlayer(b.dmg ?? BOLT.damage, events);
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
          if (up.kind === 'bomb') { p.bombs = Math.min(state.mods.bombMax, p.bombs + 1); floatText(p.x, p.y - 26, '+1 BOMB', COLORS.amber, 16); }
          if (up.kind === 'lance') { p.lanceT = LANCE.duration * state.mods.weaponTime; floatText(p.x, p.y - 26, 'LANCE ONLINE', COLORS.violet, 16); }
          if (up.kind === 'nova') { p.novaT = NOVA.duration * state.mods.weaponTime; p.novaCd = 0; floatText(p.x, p.y - 26, 'NOVA BURST', COLORS.magenta, 16); }
          events |= EVENT_POWER;
        }
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (let i = state.beams.length - 1; i >= 0; i -= 1) {
      state.beams[i].life -= dt;
      if (state.beams[i].life <= 0) state.beams.splice(i, 1);
    }
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
    const p = state.player;
    for (let i = state.ups.length - 1; i >= 0; i -= 1) {
      const up = state.ups[i];
      up.t += dt;
      up.life -= dt;
      up.y += 26 * dt;
      up.x += Math.sin(up.t * 2.4) * 12 * dt;
      // Tractor field: inside its radius a drifting drop homes on the ship instead.
      if (p && p.alive && state.mods.magnet > 0) {
        const radius = MAGNET.radiusPerLevel * state.mods.magnet;
        const d2 = dist2(up.x, up.y, p.x, p.y);
        if (d2 < radius * radius && d2 > 4) {
          const d = Math.sqrt(d2);
          up.x += ((p.x - up.x) / d) * MAGNET.pullSpeed * dt;
          up.y += ((p.y - up.y) / d) * MAGNET.pullSpeed * dt;
        }
      }
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
    // The draft holds the run: only the backdrop and the effects keep breathing while
    // the pilot chooses, and the chain timer waits with everything else.
    if (state.phase === 'draft') {
      stepFx(dt);
      return events;
    }
    if (state.comboTime > 0) {
      state.comboTime -= dt;
      if (state.comboTime <= 0) {
        // Chain insurance: a level of the saver turns one break per chain into a halving.
        if (state.mods.saver > 0 && !state.chainSaved && state.combo >= 8 && state.player) {
          state.combo = Math.floor(state.combo / 2);
          state.comboTime = 1.6;
          state.chainSaved = true;
          floatText(state.player.x, state.player.y - 36, 'CHAIN SAVED', COLORS.amber, 15);
        } else {
          state.combo = 0;
        }
      }
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
        // Wave cleared: the draft opens before the next wave rolls in.
        events |= openDraft();
      }
    } else if (state.phase === 'intermission') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) events |= startWave(state.wave + 1);
    }
    events = stepPlayer(dt, ctl, events);
    events = stepDrones(dt, events);
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
  return { state, reset, step, chooseDraft, spawnEnemy, burst, floatText, multiplier: () => multiplier() };
}
