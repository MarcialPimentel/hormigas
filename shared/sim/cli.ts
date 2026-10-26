// npm run sim [-- worldSpeed]   → prints the milestone map for an engaged player
import { simulate, fmtTime } from './simulate';

const speed = Number(process.argv[2] ?? 1);
const { milestones, final } = simulate({ worldSpeed: speed, days: speed > 1 ? 40 / speed : 40 });
console.log(`\nMilestone map — engaged player, world speed ×${speed}\n`);
for (const m of milestones) console.log(`${fmtTime(m.at).padStart(10)}  ${m.label}`);
const p = final.perHour;
console.log(`\nAfter the run: ${Math.round(p.foliage)} Foliage / ${Math.round(p.protein)} Protein / ${Math.round(p.nectar)} Nectar per hour`);
console.log('Typical players check in less often: expect roughly 1.5–2× these times.\n');
