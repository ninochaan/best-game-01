// The best-game-01 entry "Neon Swarm" (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline (game/index.html
// and its ES modules, no library and no network request), and the program hands it in. It copies
// game/ and screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Neon Swarm is a 2D arena survival shooter drawn in neon vector style on a canvas: steer with
// WASD or the arrow keys, aim with the mouse, hold the mouse button or Space to fire. Waves of
// chasers, weavers, splitters, snipers and armored tanks close in, a boss arrives every fifth
// wave — and enrages into a spiral barrage when its hull runs low — and downed enemies drop
// spread-shot, shield, bomb, piercing-lance and nova-burst power-ups. Clearing a wave opens an
// upgrade draft (1 of 3 from nine systems: damage, fire rate, wingman drones, hull repair and
// plating, a tractor field, chain insurance, weapon amp, bomb capacity) that permanently
// reshapes the run, and the game-over screen closes with a full run summary. It has a title
// screen, pause, combo scoring, procedural WebAudio sound effects, game over and restart.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
