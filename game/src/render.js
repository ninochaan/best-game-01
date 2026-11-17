// All drawing for Neon Swarm. Ships and enemies are pre-rendered once to offscreen sprite
// canvases (with their neon glow baked in), so a frame is mostly drawImage calls and the game
// stays smooth with hundreds of particles. The canvas is letterboxed: the 1440x900 world is
// scaled to fit the window, and the renderer owns the transform — input asks it to convert
// mouse points back into world coordinates. HUD and screen overlays are drawn unshaken, on
// top of the shaken world, under a soft vignette.

import { BOLT, COLORS, DRONE, ENEMY, H, PLAYER, SNIPER, W } from './config.js';
import { upgradeById } from './upgrades.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The draft cards' rectangles in world coordinates, for offers 0, 1 and 2. */
export function draftCardRects() {
  const w = 372;
  const h = 238;
  const gap = 26;
  const x0 = (W - (3 * w + 2 * gap)) / 2;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y: 306, w, h }));
}

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

/** Trace a polygon from [x, y] pairs, closed. */
function poly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

function shipPath(ctx, r) {
  poly(ctx, [r + 4, 0, -r + 2, r - 2, -r + 6, 0, -r + 2, -r + 2]);
}

function kindPath(ctx, kind, r) {
  if (kind === 'chaser') poly(ctx, [r, 0, -r + 3, r - 4, -r + 7, 0, -r + 3, -r + 4]);
  else if (kind === 'weaver') poly(ctx, [r, 0, -r, r + 2, -r + 5, 0, -r, -r - 2]);
  else if (kind === 'splitter') {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (kind === 'mini') poly(ctx, [r, 0, -r, r - 3, -r, -r + 3]);
  else if (kind === 'sniper') {
    // A long needle hull with a forked tail: it reads as a marksman, not a brawler.
    poly(ctx, [r + 7, 0, -r + 2, r - 5, -r - 3, r + 2, -r + 5, 0, -r - 3, -r - 2, -r + 2, -r + 5]);
  }
  else if (kind === 'tank') {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (kind === 'boss') {
    poly(ctx, [r, 0, r - 18, r - 6, -r + 16, r + 14, -r - 8, r - 16, -r + 6, 0, -r - 8, -r + 16, -r + 16, -r - 14, r - 18, -r + 6]);
  }
}

/** Render one glowing sprite: the shape filled dark, stroked bright, glow baked by shadow. */
function makeSprite(size, color, draw, flash = false) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.shadowColor = flash ? '#ffffff' : color;
  ctx.shadowBlur = size * 0.16;
  ctx.fillStyle = flash ? '#ffffff' : 'rgba(8, 10, 26, 0.92)';
  ctx.strokeStyle = flash ? '#ffffff' : color;
  ctx.lineWidth = Math.max(2, size * 0.035);
  draw(ctx);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  draw(ctx);
  ctx.stroke();
  return canvas;
}

function buildSprites() {
  const sprites = { enemy: {}, flash: {} };
  for (const kind of Object.keys(ENEMY)) {
    const spec = ENEMY[kind];
    const size = Math.ceil(spec.radius * 4.4);
    const draw = (ctx) => {
      kindPath(ctx, kind, spec.radius);
      if (kind === 'boss') {
        // A reactor core ring inside the dreadnought's hull.
        ctx.moveTo(spec.radius * 0.38, 0);
        ctx.arc(0, 0, spec.radius * 0.38, 0, Math.PI * 2);
      }
    };
    sprites.enemy[kind] = makeSprite(size, spec.color, draw);
    sprites.flash[kind] = makeSprite(size, spec.color, draw, true);
  }
  const playerSize = Math.ceil(PLAYER.radius * 4.6);
  sprites.player = makeSprite(playerSize, COLORS.cyan, (ctx) => shipPath(ctx, PLAYER.radius));
  sprites.playerFlash = makeSprite(playerSize, COLORS.cyan, (ctx) => shipPath(ctx, PLAYER.radius), true);
  const dot = (color) => {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 24, 24);
    return c;
  };
  sprites.bullet = dot(COLORS.cyan);
  sprites.bolt = dot(COLORS.ember);
  // The wingman drone: a pocket version of the player's hull in magenta, and its paler shot.
  const droneSize = Math.ceil(PLAYER.radius * 0.62 * 4.6);
  sprites.drone = makeSprite(droneSize, COLORS.magenta, (ctx) => shipPath(ctx, PLAYER.radius * 0.62));
  sprites.droneBullet = dot(COLORS.lilac);
  return sprites;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const sprites = buildSprites();
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let bgGradient = null;
  let vignette = null;
  let nebLayer = null;
  let nebFor = null;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const scale = Math.min(cw / W, ch / H);
    view = { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, dpr };
    bgGradient = null;
    vignette = null;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Convert a client (CSS pixel) point into world coordinates. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.ox) / view.scale,
      y: (clientY - rect.top - view.oy) / view.scale,
    };
  }

  function drawNebula(state) {
    if (nebFor !== state) {
      nebFor = state;
      nebLayer = document.createElement('canvas');
      nebLayer.width = W;
      nebLayer.height = H;
      const g = nebLayer.getContext('2d');
      for (const neb of state.nebs) {
        const grad = g.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
        grad.addColorStop(0, neb.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.5;
        g.fillStyle = grad;
        g.fillRect(neb.x - neb.r, neb.y - neb.r, neb.r * 2, neb.r * 2);
      }
    }
    ctx.drawImage(nebLayer, 0, 0);
    // A second, nearer dust layer drifting slowly across the baked nebula: the parallax
    // between the two sells the depth of the field.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i += 1) {
      const neb = state.nebs[i];
      const dx = Math.sin(state.time * 0.021 * (i + 1) + neb.x) * 46;
      const dy = Math.cos(state.time * 0.017 * (i + 1) + neb.y) * 30;
      const grad = ctx.createRadialGradient(neb.x + dx, neb.y + dy, 0, neb.x + dx, neb.y + dy, neb.r * 0.55);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = grad;
      ctx.fillRect(neb.x + dx - neb.r, neb.y + dy - neb.r, neb.r * 2, neb.r * 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawStars(state) {
    for (const star of state.stars) {
      const speed = [7, 15, 30][star.z];
      const y = (star.y + state.time * speed) % H;
      const twinkle = 0.7 + 0.3 * Math.sin(state.time * 2.4 + star.x * 0.7);
      ctx.globalAlpha = [0.35, 0.6, 0.95][star.z] * twinkle;
      ctx.fillStyle = star.z === 2 ? '#ffffff' : COLORS.dim;
      ctx.fillRect(star.x, y, star.s, star.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawSprite(img, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  function drawPowerup(up) {
    const blink = up.life < 2 ? (Math.sin(up.t * 18) > 0 ? 1 : 0.25) : 1;
    const bob = Math.sin(up.t * 3.2) * 3;
    ctx.save();
    ctx.translate(up.x, up.y + bob);
    ctx.globalAlpha = blink;
    const look = {
      spread: [COLORS.cyan, 'S'],
      shield: [COLORS.green, 'O'],
      bomb: [COLORS.amber, 'B'],
      lance: [COLORS.violet, 'L'],
      nova: [COLORS.magenta, 'N'],
    }[up.kind] ?? [COLORS.cyan, '?'];
    const color = look[0];
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(8,10,26,0.9)';
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look[1], 0, 1);
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p || !p.alive) return;
    if (p.invulnT > 0 && Math.sin(state.time * 26) > 0.35) {
      // Respawn flicker: the ship blinks while it cannot be hurt.
    } else {
      drawSprite(p.flashT > 0.03 ? sprites.playerFlash : sprites.player, p.x, p.y, p.angle);
    }
    // Cockpit heart.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (p.flashT > 0) {
      // Muzzle flash, swelling with the freshness of the shot.
      const nx = p.x + Math.cos(p.angle) * (p.r + 10);
      const ny = p.y + Math.sin(p.angle) * (p.r + 10);
      const s = p.lanceT > 0 ? 38 : 24 + p.flashT * 160;
      ctx.drawImage(sprites.bullet, nx - s / 2, ny - s / 2, s, s);
    }
    if (p.shieldT > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.green;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(state.time * 6);
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORS.green;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The wingman drones: a faint orbit ring, the pocket hull, and a blink when it fires. */
  function drawDrones(state) {
    const p = state.player;
    if (!p || !state.drones.length) return;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, DRONE.orbit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (const d of state.drones) {
      drawSprite(sprites.drone, d.x, d.y, d.face);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      if (d.flashT > 0) {
        const nx = d.x + Math.cos(d.face) * 14;
        const ny = d.y + Math.sin(d.face) * 14;
        ctx.drawImage(sprites.droneBullet, nx - 9, ny - 9, 18, 18);
      }
    }
  }

  function drawBeams(state) {
    if (!state.beams.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const beam of state.beams) {
      const fade = Math.max(0, beam.life / beam.maxLife);
      ctx.globalAlpha = 0.28 * fade;
      ctx.strokeStyle = COLORS.violet;
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.globalAlpha = 0.95 * fade;
      ctx.strokeStyle = '#efe8ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawWorld(state) {
    drawNebula(state);
    drawStars(state);
    for (const up of state.ups) drawPowerup(up);
    // Sniper sight lines first, under everything: the telegraph a pilot dodges by.
    const p = state.player;
    if (p && p.alive) {
      for (const e of state.enemies) {
        if (e.kind !== 'sniper' || e.charge <= 0) continue;
        const heat = 1 - e.charge / SNIPER.chargeTime;
        ctx.save();
        ctx.globalAlpha = 0.14 + 0.5 * heat;
        ctx.strokeStyle = COLORS.acid;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowColor = COLORS.acid;
        ctx.shadowBlur = 10 + 14 * heat;
        ctx.fillStyle = COLORS.acid;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(e.angle) * (e.r + 4), e.y + Math.sin(e.angle) * (e.r + 4), 2.5 + 3 * heat, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    for (const b of state.ebullets) {
      if (b.big) ctx.drawImage(sprites.bolt, b.x - 18, b.y - 18, 36, 36);
      else ctx.drawImage(sprites.bolt, b.x - 12, b.y - 12);
    }
    for (const e of state.enemies) {
      drawSprite(e.flashT > 0 ? sprites.flash[e.kind] : sprites.enemy[e.kind], e.x, e.y, e.angle);
      if (e.kind === 'boss' && e.enraged) {
        // A rotating warning ring around the enraged hull.
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(state.time * 7);
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 12;
        ctx.setLineDash([26, 18]);
        ctx.lineDashOffset = -state.time * 60;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.kind === 'tank' || e.kind === 'sniper') {
        // A slim damage bar over the heavies and the marksmen.
        const w = e.r * 1.7;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w, 4);
        ctx.fillStyle = ENEMY[e.kind].color;
        ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w * Math.max(0, e.hp / e.maxHp), 4);
      }
    }
    for (const b of state.bullets) {
      if (b.src === 'drone') ctx.drawImage(sprites.droneBullet, b.x - 9, b.y - 9, 18, 18);
      else ctx.drawImage(sprites.bullet, b.x - 12, b.y - 12);
    }
    drawBeams(state);
    drawPlayer(state);
    drawDrones(state);
    // Particles burn additively.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const part of state.parts) {
      ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Floating score text.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.font = `700 ${t.size}px ${MONO}`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.min(1, Math.max(0, frac)), h);
  }

  function drawHud(state, mult, muted) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Score block, top-left.
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('SCORE', 26, 36);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(String(state.score).padStart(6, '0'), 24, 68);
    // Wave, top-centre.
    ctx.textAlign = 'center';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('WAVE', W / 2, 36);
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(String(state.wave), W / 2, 66);
    // Combo, top-right.
    if (state.combo > 1) {
      ctx.textAlign = 'right';
      ctx.font = `700 24px ${MONO}`;
      ctx.fillStyle = COLORS.amber;
      ctx.fillText(`x${mult}`, W - 26, 58);
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(`${state.combo} CHAIN`, W - 26, 76);
      bar(W - 146, 84, 120, 4, state.comboTime / 2.5, COLORS.amber);
    }
    // Boss health, top-centre under the wave.
    if (state.boss) {
      const w = 520;
      const enraged = state.boss.hp <= state.boss.maxHp * 0.4;
      ctx.textAlign = 'center';
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = enraged ? COLORS.red : COLORS.ember;
      ctx.fillText(enraged ? '— DREADNOUGHT ENRAGED —' : '— DREADNOUGHT —', W / 2, 96);
      bar(W / 2 - w / 2, 104, w, 8, state.boss.hp / state.boss.maxHp, enraged ? COLORS.red : COLORS.ember);
    }
    if (!p) return;
    // The build so far, under the score: one chip per upgrade kind taken, with its level.
    if (state.taken && state.taken.length) {
      const seen = [];
      for (const id of state.taken) if (!seen.includes(id)) seen.push(id);
      ctx.textAlign = 'left';
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('BUILD', 26, 100);
      seen.forEach((id, i) => {
        const up = upgradeById(id);
        if (!up) return;
        const cx = 66 + i * 27;
        ctx.beginPath();
        ctx.arc(cx, 96, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,10,26,0.9)';
        ctx.fill();
        ctx.strokeStyle = up.color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = up.color;
        ctx.font = `800 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(up.glyph, cx, 99.5);
        ctx.textAlign = 'left';
        const lvl = state.levels[id] ?? 1;
        if (lvl > 1) {
          ctx.font = `700 9px ${MONO}`;
          ctx.fillStyle = COLORS.ink;
          ctx.fillText(String(lvl), cx + 8, 90);
        }
        ctx.font = `600 10px ${FONT}`;
      });
    }
    // Hull + lives, bottom-left.
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('HULL', 26, H - 58);
    const hpFrac = Math.max(0, p.hp / (p.maxHp ?? PLAYER.maxHp));
    const hpColor = hpFrac > 0.5 ? COLORS.green : hpFrac > 0.25 ? COLORS.amber : COLORS.red;
    bar(26, H - 48, 220, 13, hpFrac, hpColor);
    for (let i = 0; i < state.lives; i += 1) {
      ctx.save();
      ctx.translate(38 + i * 26, H - 82);
      ctx.scale(0.55, 0.55);
      ctx.drawImage(sprites.player, -sprites.player.width / 2, -sprites.player.height / 2);
      ctx.restore();
    }
    // Active power-up timers, above the hull bar.
    let ty = H - 108;
    const timers = [
      ['SPREAD', p.spreadT, 12, COLORS.cyan],
      ['SHIELD', p.shieldT, 10, COLORS.green],
      ['LANCE', p.lanceT, 10, COLORS.violet],
      ['NOVA', p.novaT, 10, COLORS.magenta],
    ];
    for (const [label, left, full, color] of timers) {
      if (left <= 0) continue;
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(label, 26, ty + 3);
      bar(86, ty - 6, 90, 6, left / full, color);
      ty -= 18;
    }
    // Bombs, bottom-right.
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('BOMBS [Q]', W - 26, H - 58);
    for (let i = 0; i < p.bombs; i += 1) {
      ctx.beginPath();
      ctx.arc(W - 38 - i * 26, H - 38, 9, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.amber;
      ctx.fill();
      ctx.fillStyle = '#131313';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('B', W - 38 - i * 26, H - 34);
      ctx.textAlign = 'right';
    }
    if (muted) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.textAlign = 'center';
      ctx.fillText('MUTED', W / 2, H - 20);
    }
  }

  function centerText(text, y, font, color, glow = 0) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillText(text, W / 2, y);
    ctx.shadowBlur = 0;
  }

  function dimScreen(alpha) {
    ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle(state, best) {
    dimScreen(0.34);
    // The two-tone title: NEON in cyan, SWARM in magenta, one centred line.
    ctx.textBaseline = 'middle';
    ctx.font = `800 108px ${FONT}`;
    const left = 'NEON ';
    const right = 'SWARM';
    const total = ctx.measureText(left + right).width;
    ctx.textAlign = 'left';
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 34;
    ctx.fillStyle = COLORS.cyan;
    ctx.fillText(left, W / 2 - total / 2, 268);
    ctx.shadowColor = COLORS.magenta;
    ctx.fillStyle = COLORS.magenta;
    ctx.fillText(right, W / 2 - total / 2 + ctx.measureText(left).width, 268);
    ctx.shadowBlur = 0;
    centerText('A R E N A   S U R V I V A L', 340, `600 21px ${FONT}`, COLORS.dim);
    const blink = Math.sin(state.time * 3.4) > -0.2;
    if (blink) centerText('CLICK OR PRESS ENTER TO LAUNCH', 428, `700 24px ${FONT}`, COLORS.ink, 12);
    ctx.font = `500 17px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = 'center';
    const lines = [
      'WASD / ARROWS — steer        MOUSE — aim        HOLD CLICK / SPACE — fire',
      'Q / RIGHT CLICK — bomb        P — pause        M — mute',
      'Survive the waves. Chain kills to raise your multiplier.',
      'Clear a wave and draft 1 of 3 upgrades — drones, damage, repair — your build carries the run.',
      'Grab S spread, O shield, B bombs, L the piercing lance, N the nova burst.',
      'Dodge the acid snipers\u2019 sight lines — and a boss comes every fifth wave.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 498 + i * 28));
    if (best > 0) centerText(`BEST ${best}`, 668, `700 19px ${MONO}`, COLORS.amber);
  }

  /**
   * The draft overlay: three upgrade cards over the dimmed, frozen arena. The card
   * geometry lives here and is exported, so the shell hit-tests clicks against exactly
   * the rectangles on screen.
   */
  function drawDraft(state) {
    dimScreen(0.62);
    centerText(`WAVE ${state.wave} CLEARED`, 218, `800 46px ${FONT}`, COLORS.ink, 18);
    centerText('CHOOSE AN UPGRADE — YOUR SHIP KEEPS IT FOR THE REST OF THE RUN', 262, `600 16px ${FONT}`, COLORS.amber);
    const rects = draftCardRects();
    state.draft.forEach((id, i) => {
      const up = upgradeById(id);
      if (!up) return;
      const r = rects[i];
      ctx.save();
      ctx.fillStyle = 'rgba(10, 13, 34, 0.96)';
      ctx.strokeStyle = up.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = up.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Icon medallion.
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + 58, 27, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,26,0.9)';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = up.color;
      ctx.font = `800 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(up.glyph, r.x + r.w / 2, r.y + 59);
      ctx.fillStyle = COLORS.ink;
      ctx.font = `800 21px ${FONT}`;
      ctx.fillText(up.name, r.x + r.w / 2, r.y + 108);
      // Level pips: filled for levels already held, hollow up to the cap.
      const lvl = state.levels[id] ?? 0;
      for (let k = 0; k < up.max; k += 1) {
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2 + (k - (up.max - 1) / 2) * 16, r.y + 132, 4.5, 0, Math.PI * 2);
        if (k < lvl) { ctx.fillStyle = up.color; ctx.fill(); }
        else { ctx.strokeStyle = up.color; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
      ctx.fillStyle = COLORS.dim;
      ctx.font = `500 15px ${FONT}`;
      wrapText(up.blurb, r.x + r.w / 2, r.y + 162, r.w - 44, 21);
      ctx.fillStyle = up.color;
      ctx.font = `700 15px ${MONO}`;
      ctx.fillText(`[ ${i + 1} ]`, r.x + r.w / 2, r.y + r.h - 22);
      ctx.restore();
    });
    centerText('PRESS 1 · 2 · 3 OR CLICK A CARD', 640, `600 15px ${FONT}`, COLORS.dim);
  }

  /** Word-wrap a short string onto centred lines (the draft card blurbs). */
  function wrapText(text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width > maxWidth && line) { lines.push(line); line = word; }
      else line = trial;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
  }

  function drawPaused() {
    dimScreen(0.55);
    centerText('PAUSED', 400, `800 64px ${FONT}`, COLORS.ink, 18);
    centerText('P or ESC to resume — ENTER also works', 470, `500 18px ${FONT}`, COLORS.dim);
  }

  /**
   * Game over, with the run summary: the score and best, the run's vital statistics in
   * two columns, and the build the pilot drafted — every upgrade taken, with its level —
   * so the screen reads as the story of a run, not just a number.
   */
  function drawOver(state, best) {
    dimScreen(0.6);
    centerText('GAME OVER', 216, `800 76px ${FONT}`, COLORS.red, 30);
    const isBest = state.score >= best && state.score > 0;
    centerText(`SCORE  ${state.score}`, 288, `700 32px ${MONO}`, COLORS.ink);
    if (isBest) centerText('NEW BEST!', 324, `700 18px ${FONT}`, COLORS.amber, 10);
    // The summary panel.
    const px = W / 2 - 350;
    const py = 356;
    const pw = 700;
    const ph = 252;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 13, 34, 0.94)';
    ctx.strokeStyle = 'rgba(143, 163, 200, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const acc = state.stats && state.stats.fired > 0
      ? Math.min(100, Math.round((100 * state.stats.hit) / state.stats.fired))
      : 0;
    const rows = [
      ['WAVE REACHED', String(state.wave), 'KILLS', String(state.kills)],
      ['BEST CHAIN', `x${Math.min(8, 1 + Math.floor(state.bestCombo / 10))} (${state.bestCombo})`, 'ACCURACY', `${acc}%`],
      ['BEST SCORE', String(Math.max(best, state.score)), 'TIME', `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`],
    ];
    ctx.textBaseline = 'middle';
    rows.forEach((row, i) => {
      const y = py + 40 + i * 38;
      ctx.textAlign = 'left';
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(row[0], px + 36, y);
      ctx.fillText(row[2], px + 386, y);
      ctx.font = `700 21px ${MONO}`;
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(row[1], px + 168, y);
      ctx.fillText(row[3], px + 518, y);
    });
    // The build line: every upgrade taken this run, in the order it was drafted.
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('UPGRADES TAKEN', px + 36, py + 162);
    if (state.taken && state.taken.length) {
      const seen = [];
      for (const id of state.taken) if (!seen.includes(id)) seen.push(id);
      seen.slice(0, 9).forEach((id, i) => {
        const up = upgradeById(id);
        if (!up) return;
        const cx = px + 48 + i * 46;
        const cy = py + 204;
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,10,26,0.9)';
        ctx.fill();
        ctx.strokeStyle = up.color;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = up.color;
        ctx.font = `800 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(up.glyph, cx, cy + 0.5);
        const lvl = state.levels[id] ?? 1;
        if (lvl > 1) {
          ctx.font = `700 11px ${MONO}`;
          ctx.fillStyle = COLORS.ink;
          ctx.fillText(`x${lvl}`, cx + 17, cy - 10);
        }
      });
      ctx.textAlign = 'left';
    } else {
      ctx.font = `500 15px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('None — the swarm took the ship before the first draft.', px + 36, py + 204);
    }
    const blink = Math.sin(state.time * 3.4) > -0.2;
    if (blink) centerText('PRESS ENTER OR CLICK TO FLY AGAIN', 668, `700 20px ${FONT}`, COLORS.ink, 10);
  }

  function drawBanner(state) {
    if (state.phase !== 'announce') return;
    const bossWave = state.wave % 5 === 0;
    const alpha = Math.min(1, state.phaseT / 0.6, (bossWave ? 3.0 : 2.1 - state.phaseT) / 0.4 + 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (bossWave) {
      centerText('⚠ WARNING ⚠', 380, `800 54px ${FONT}`, COLORS.ember, 26);
      centerText('A DREADNOUGHT APPROACHES', 442, `600 22px ${FONT}`, COLORS.ink);
    } else {
      centerText(`WAVE ${state.wave}`, 396, `800 58px ${FONT}`, COLORS.ink, 22);
    }
    ctx.restore();
  }

  function draw(state, screen, best, mult = 1, muted = false) {
    const { dpr, scale, ox, oy } = view;
    if (!bgGradient) {
      bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, COLORS.bgTop);
      bgGradient.addColorStop(1, COLORS.bgBottom);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // World, with screen shake.
    const shX = state.shake ? Math.sin(state.time * 91) * state.shake * 0.55 : 0;
    const shY = state.shake ? Math.cos(state.time * 83) * state.shake * 0.55 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + shX * scale), dpr * (oy + shY * scale));
    drawWorld(state);
    // HUD and overlays, steady.
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(state, mult, muted);
      drawBanner(state);
      if (screen === SCREEN_PLAY && state.phase === 'draft' && state.draft) drawDraft(state);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) {
      drawHud(state, mult, muted);
      drawOver(state, best);
    }
    // Impact flash.
    if (state.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.65, state.flash);
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // Low-hull warning: the screen edges breathe red while the ship is close to death.
    const pl = state.player;
    if (screen === SCREEN_PLAY && pl && pl.alive && pl.hp > 0 && pl.hp <= PLAYER.maxHp * 0.3) {
      const pulse = 0.1 + 0.08 * Math.sin(state.time * 6.5);
      const warn = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.92);
      warn.addColorStop(0, 'rgba(255,56,96,0)');
      warn.addColorStop(1, `rgba(255,56,96,${pulse.toFixed(3)})`);
      ctx.fillStyle = warn;
      ctx.fillRect(0, 0, W, H);
    }
    // Vignette.
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  return { draw, toLogical, view: () => view };
}
