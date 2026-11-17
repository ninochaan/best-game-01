// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between four screens: title, play, paused and game over. World events from each
// step are turned into the synthesized sound effects here.
//
// ?seed=N fixes the random stream. ?shot=menu|play|boss|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.

import { BEST_KEY, STEP, W } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOMB, EVENT_BOSS, EVENT_BOSSDOWN, EVENT_DEATH, EVENT_ENRAGE,
  EVENT_HITMARK, EVENT_HURT, EVENT_KILL, EVENT_LANCE, EVENT_NOVA, EVENT_OVER,
  EVENT_POWER, EVENT_SHOOT, EVENT_SNIPE,
} from './world.js';
import { ACTION_BOMB, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

/** A decorative cast for the live title screen, the same ring the menu still uses. */
function titleCast() {
  const cast = [
    ['chaser', W / 2 - 430, 300],
    ['weaver', W / 2 + 430, 280],
    ['splitter', W / 2 - 360, 640],
    ['tank', W / 2 + 380, 620],
    ['mini', W / 2 + 120, 190],
    ['sniper', W / 2 + 580, 450],
  ];
  for (const [kind, x, y] of cast) world.spawnEnemy(kind, x, y);
  world.state.queue = [];
  world.state.phase = 'active';
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.multiplier(), false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toLogical);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  titleCast();

  // Sound starts only after a real gesture; every click or keypress offers one.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ui();
    announce('Playing. 3 ships. Survive the waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_HITMARK) audio.hit();
    if (events & EVENT_KILL) audio.explosion(false);
    if (events & EVENT_BOSSDOWN) audio.explosion(true);
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_DEATH) audio.explosion(true);
    if (events & EVENT_POWER) audio.power();
    if (events & EVENT_BOMB) audio.bomb();
    if (events & EVENT_BOSS) audio.bossWarn();
    if (events & EVENT_LANCE) audio.lance();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_ENRAGE) audio.enrage();
    if (events & EVENT_SNIPE) audio.snipe();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    const ctl = {
      move: input.direction(),
      aim: input.mouse,
      fire: input.firing(),
      bomb: (actions & ACTION_BOMB) !== 0,
    };
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        const events = world.step(STEP, ctl, false);
        ctl.bomb = false; // One queued bomb per press, not per step.
        playEvents(events);
        if (events & EVENT_OVER) endGame();
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      while (accumulator >= STEP) {
        world.step(STEP, ctl, true);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.multiplier(), audio.muted);
  }

  // Leaving the tab pauses a running game rather than letting the swarm feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A handle for automated smoke tests: the world and the current screen.
  window.__neon = { world, screen: () => screen };
  announce('Neon Swarm. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
