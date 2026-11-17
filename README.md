# Neon Swarm

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/ninochaan/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/ninochaan/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Neon Swarm** is a 2D arena survival shooter in vanilla JavaScript and Canvas — no
libraries, no assets, no network. You pilot the last ship over a neon deep-space arena while
waves of machines close in: magenta **chasers** run you down, amber **weavers** snake past
your fire, violet **splitters** burst into minis, ember **tanks** shell you from range, and
acid **snipers** keep their distance, pin you with a sight line, and fire one heavy charged
bolt. Every fifth wave a **Dreadnought** boss fills the top of the screen with radial bullet
bursts — and below 40% hull it enrages, adding a twin spiral barrage. Chain kills to raise
your score multiplier, grab power-ups, and drop a bomb when the swarm gets too close.

## How to play

| Input | Action |
| --- | --- |
| WASD / arrow keys | Steer |
| Mouse | Aim |
| Hold left click / Space | Fire |
| Q / right click | Detonate a bomb (clears bullets, 60 damage to everything on screen) |
| P / Esc | Pause |
| M | Mute |

- **Power-ups** drop from wrecks: **S** spread shot (12 s), **O** shield (10 s), **B** +1 bomb
  (max 3), **L** lance (10 s — a piercing beam that skewers everything in a line), **N** nova
  (10 s — a ring of bullets bursts from your ship every 1.3 s).
- **Combo:** every kill within 2.5 s of the last raises your chain; every 10 chain raises the
  score multiplier, up to ×8.
- You have 3 ships and 100 hull per ship. Ramming hurts both of you — the other guy usually
  comes off worse.

## Run it

The game is the static `game/` folder: serve it with any static server, or use the bundled
one (Node 22):

```sh
node serve.ts          # then open http://localhost:8080
```

Deterministic stills for the screenshots live behind query parameters, e.g.
`?shot=play&seed=7` renders a composed mid-game scene (menu / play / boss / over).

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with
the vendored make.fun library (`vendor/makefun-game.ts`).

## Layout

- `game/index.html`, `game/style.css` — the page shell
- `game/src/world.js` — the whole simulation (fixed 1/60 s steps, seeded rng)
- `game/src/render.js` — canvas renderer with pre-rendered neon sprites
- `game/src/audio.js` — procedural WebAudio sound effects, no audio files
- `game/src/input.js`, `game/src/main.js`, `game/src/shots.js`, `game/src/config.js`, `game/src/random.js`
