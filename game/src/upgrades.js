// The between-wave upgrade draft: the catalogue the world offers three-at-a-time whenever
// a wave is cleared. Each entry is one system the run can grow — gun damage, fire rate,
// hull repair, a tractor field, chain insurance, longer weapon power-ups, wingman drones,
// hull plating, a bigger bomb rack. `max` caps how many times it may be taken; the world
// tracks the levels taken, applies the effects, and the renderer reads the same catalogue
// to draw the draft cards and the build chips, so what a card promises is what the code does.

import { COLORS } from './config.js';

export const UPGRADES = [
  { id: 'damage', glyph: 'D', name: 'HEAVY ROUNDS', color: COLORS.ember, max: 4, blurb: 'Bullet and beam damage +35%. The swarm feels every hit.' },
  { id: 'rapid', glyph: 'R', name: 'RAPID CYCLER', color: COLORS.cyan, max: 4, blurb: 'Fire rate +25%. More lead in the air, all the time.' },
  { id: 'drone', glyph: 'W', name: 'WINGMAN DRONE', color: COLORS.magenta, max: 2, blurb: 'An orbiting drone that aims and fires on its own.' },
  { id: 'regen', glyph: 'N', name: 'NANO REPAIR', color: COLORS.green, max: 3, blurb: 'Hull regenerates +1.4 per second, even mid-fight.' },
  { id: 'plating', glyph: 'H', name: 'HULL PLATING', color: COLORS.ink, max: 4, blurb: '+25 max hull, and 25 patched back right now.' },
  { id: 'magnet', glyph: 'T', name: 'TRACTOR FIELD', color: COLORS.lilac, max: 2, blurb: 'Power-ups drift toward your ship from afar.' },
  { id: 'saver', glyph: 'C', name: 'CHAIN INSURANCE', color: COLORS.amber, max: 2, blurb: 'A dying chain halves instead of breaking, once per chain.' },
  { id: 'amp', glyph: 'A', name: 'WEAPON AMP', color: COLORS.violet, max: 3, blurb: 'Lance and nova power-ups last 40% longer.' },
  { id: 'bombs', glyph: 'B', name: 'BOMB RACK', color: '#ff9f43', max: 3, blurb: '+1 bomb aboard now, and room for one more.' },
];

/** The catalogue entry for an upgrade id, or undefined. */
export function upgradeById(id) {
  return UPGRADES.find((up) => up.id === id);
}
