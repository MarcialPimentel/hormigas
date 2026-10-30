// npm run combat [-- castes | defenses | nests | all] [--budget 44000] [--runs 100]
// Balance tables from the real combat code and the numbers in docs/data (docs/05-castes-units.md):
//   castes    every soldier caste against every other at equal spend, and against an even mix
//   defenses  each soldier caste raiding a defended nest, with and without a Narrow Tunnel
//   nests     the fair armies against every wild nest, termite mound and spider den
// Re-run after changing castes.json, defenses.json, npc.json or combat.ts.
import {
  CASTES, NEST_SPECIES, FAIR_NEST_ARMIES, FAIR_MOUND_ARMIES, FAIR_DEN_ARMIES, PLAYER_SOLDIERS,
  casteMatrix, defenseMatrix, evenMix, matchup, nestCheck, speciesOfKind, buyCaste, type Matchup, type NestCheck,
} from '../src';

const args = process.argv.slice(2);
const flag = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const mode = args.find((a) => !a.startsWith('--') && Number.isNaN(Number(a))) ?? 'all';
const budget = flag('budget', 44000);
const runs = flag('runs', 100);

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
const k = (x: number) => `${(x / 1000).toFixed(1)}k`.padStart(7);
function table(title: string, rows: Matchup[]) {
  console.log(`\n${title}`);
  const w = Math.max(...rows.map((r) => r.attacker.length + r.defender.length)) + 4;
  console.log(`${'attacker → defender'.padEnd(w)}  wins  fell back  attacker lost  defender lost`);
  for (const r of rows)
    console.log(`${`${r.attacker} → ${r.defender}`.padEnd(w)} ${pct(r.winRate)}  ${pct(r.retreatRate).padStart(9)}  ${k(r.attackerLost).padStart(13)}  ${k(r.defenderLost).padStart(13)}`);
}

if (mode === 'castes' || mode === 'all') {
  table(`Castes at equal spend (${budget.toLocaleString()} a side, ${runs} battles each)`, casteMatrix(budget, PLAYER_SOLDIERS, runs));
  const triangle = PLAYER_SOLDIERS.filter((id) => id !== 'trap_jaw');
  const mix = evenMix(budget, triangle);
  const rows: Matchup[] = [];
  for (const id of triangle) {
    rows.push(matchup('Even mix', mix, CASTES[id].name, buyCaste(id, budget), {}, { runs }));
    rows.push(matchup(CASTES[id].name, buyCaste(id, budget), 'Even mix', mix, {}, { runs }));
  }
  table(`Even mix (${triangle.map((id) => CASTES[id].name).join(', ')}) against each`, rows);
}

if (mode === 'defenses' || mode === 'all') {
  const nest = { soil_wall: 1, pit_trap: 8, acid_sentry: 5 };
  table('Raiding a defended nest (about 70% of destroyed defenses rebuild for free)', defenseMatrix(budget, nest, runs));
  table('… with a Narrow Tunnel', defenseMatrix(budget, { ...nest, narrow_tunnel: 1 }, runs));
}

if (mode === 'nests' || mode === 'all') {
  const line = (c: NestCheck) => `L${c.level} ${pct(c.fair.winRate)}/${pct(c.fair.lossShare).trim()} half ${pct(c.half.lossShare).trim()}`;
  console.log('\nWild nests: fair army win rate / share of it lost, and what half the army loses (targets: ≥90% wins, <45% lost; half loses >45%)');
  for (const sp of NEST_SPECIES) console.log(`${sp.padEnd(10)} ${[1, 2, 3, 4, 5, 6].map((l) => line(nestCheck(sp, l, FAIR_NEST_ARMIES[l], runs))).join(' | ')}`);
  const mound = speciesOfKind('mound');
  const den = speciesOfKind('den');
  console.log(`${'mound'.padEnd(10)} ${FAIR_MOUND_ARMIES.map((a, i) => line(nestCheck(mound, i + 1, a, runs))).join(' | ')}`);
  console.log(`${'den'.padEnd(10)} ${FAIR_DEN_ARMIES.map((a, i) => line(nestCheck(den, i + 1, a, runs))).join(' | ')}`);
}

if (!['castes', 'defenses', 'nests', 'all'].includes(mode)) console.log('Usage: npm run combat [-- castes | defenses | nests | all] [--budget 44000] [--runs 100]');
console.log('');
