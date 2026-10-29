// The research tech tree (docs/18-art-direction.md, "The tech tree"; rules in docs/21-tech-tree.md).
// Columns follow the Pheromone Chamber level a research needs; a research that builds on another at the same
// chamber level sits one step to its right. Lanes are the four branches. Trails are drawn from every
// `research.<id>` key in `unlock`, so the tree always matches docs/data/research.json.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHAMBERS,
  RESEARCH,
  RESEARCH_BRANCHES,
  RESEARCH_BRANCH_IDS,
  RESEARCH_IDS,
  canAfford,
  lvl,
  missingRequirements,
  researchCost,
  researchMaxLevel,
  researchSeconds,
  type ChamberId,
  type ResearchBranchId,
  type ResearchId,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration } from '../format';
import { whyShort } from '../describe';
import { Cost, Pic } from './ui';

const NODE_W = 112; // a research: picture tile, name, one status line
const COL_W = 156;
const ROW_H = 128;
const LANE_TOP = 26; // room for the branch name
const LANE_BOTTOM = 6;
const X0 = 18;
const TILE_IN = 24; // where trails meet the tile, from the node's left edge
const TILE_OUT = 88;
const TILE_MID = 36; // tile centre, from the node's top
const CHANNEL = 116; // a trail that skips columns runs this far below its upper row, between rows

type Need = { id: ResearchId; need: number };
const needsOf = (id: ResearchId): Need[] =>
  Object.entries(RESEARCH[id].unlock)
    .filter(([k]) => k.startsWith('research.') && k.slice(9) in RESEARCH)
    .map(([k, need]) => ({ id: k.slice(9) as ResearchId, need }));
const leadsTo = (id: ResearchId) => RESEARCH_IDS.filter((o) => needsOf(o).some((n) => n.id === id));

interface Edge { from: ResearchId; to: ResearchId; need: number; d: string; tagX: number; tagY: number }
interface Layout {
  pos: Record<ResearchId, { x: number; y: number; col: number }>;
  lanes: { id: string; name: string; blurb: string; top: number; height: number }[];
  groups: { pher: number; x: number; width: number }[];
  edges: Edge[];
  width: number;
  height: number;
}

/** Where everything goes. Pure: depends only on the research data. */
export function layoutTree(): Layout {
  // the chamber level each research really needs (its own, or its prerequisites' if higher), and its step within that level
  const pher = {} as Record<ResearchId, number>;
  const step = {} as Record<ResearchId, number>;
  const pherOf = (id: ResearchId): number =>
    (pher[id] ??= Math.max(RESEARCH[id].unlock.pheromone_chamber ?? 1, ...needsOf(id).map((n) => pherOf(n.id))));
  const stepOf = (id: ResearchId): number =>
    (step[id] ??= Math.max(0, ...needsOf(id).filter((n) => pherOf(n.id) === pherOf(id)).map((n) => stepOf(n.id) + 1)));
  RESEARCH_IDS.forEach((id) => (pherOf(id), stepOf(id)));

  const levels = [...new Set(RESEARCH_IDS.map((id) => pher[id]))].sort((a, b) => a - b);
  const groups: Layout['groups'] = [];
  const firstCol: Record<number, number> = {};
  let c = 0;
  for (const p of levels) {
    const width = 1 + Math.max(...RESEARCH_IDS.filter((id) => pher[id] === p).map((id) => step[id]));
    firstCol[p] = c;
    groups.push({ pher: p, x: X0 + c * COL_W, width: width * COL_W });
    c += width;
  }
  const colOf = (id: ResearchId) => firstCol[pher[id]] + step[id];
  const cols = c;

  // lanes: one per branch, rows inside a lane ordered so trails cross as little as possible
  const pos = {} as Layout['pos'];
  const lanes: Layout['lanes'] = [];
  let top = 0;
  for (const b of laneOrder()) {
    const mine = RESEARCH_IDS.filter((id) => RESEARCH[id].branch === b);
    if (!mine.length) continue;
    let rows = 1;
    for (let col = 0; col < cols; col++) {
      const here = mine.filter((id) => colOf(id) === col);
      const bary = (id: ResearchId) => {
        const ys = needsOf(id).map((n) => pos[n.id]?.y).filter((y): y is number => y !== undefined);
        return ys.length ? ys.reduce((a, y) => a + y, 0) / ys.length : Infinity;
      };
      here.sort((a, z) => bary(a) - bary(z) || RESEARCH_IDS.indexOf(a) - RESEARCH_IDS.indexOf(z));
      here.forEach((id, i) => (pos[id] = { x: X0 + col * COL_W, y: top + LANE_TOP + i * ROW_H, col }));
      rows = Math.max(rows, here.length);
    }
    const height = LANE_TOP + rows * ROW_H + LANE_BOTTOM;
    lanes.push({ id: b, name: RESEARCH_BRANCHES[b].name, blurb: RESEARCH_BRANCHES[b].blurb, top, height });
    top += height;
  }

  // trails: arrivals spread down the tile's left edge, so several prerequisites never share a point
  const edges: Edge[] = [];
  const inGap: Record<number, number> = {};
  for (const to of RESEARCH_IDS) {
    const ins = needsOf(to).sort((a, z) => pos[a.id].y - pos[z.id].y || pos[a.id].x - pos[z.id].x);
    ins.forEach((n, i) => {
      const a = pos[n.id], t = pos[to];
      const x1 = a.x + TILE_OUT, y1 = a.y + TILE_MID;
      const x2 = t.x + TILE_IN, y2 = t.y + TILE_MID + (i - (ins.length - 1) / 2) * 20;
      let d: string;
      if (t.col - a.col > 1) {
        // trails sharing a gap run side by side, a few pixels apart
        const gap = Math.min(a.y, t.y);
        const k = (inGap[gap] = (inGap[gap] ?? -1) + 1) % 4;
        const yc = gap + CHANNEL + k * 5, g1 = a.x + NODE_W + 2, g2 = t.x - 4;
        d = `M${x1},${y1} L${g1},${y1} C${g1 + 18},${y1} ${g1 + 12},${yc} ${g1 + 30},${yc} L${g2 - 30},${yc} C${g2 - 12},${yc} ${g2 - 18},${y2} ${g2},${y2} L${x2},${y2}`;
      } else {
        const mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      edges.push({ from: n.id, to, need: n.need, d, tagX: x2 - 38, tagY: y2 });
    });
  }
  return { pos, lanes, groups, edges, width: X0 + cols * COL_W, height: top };
}

/** Branches in the order that keeps cross-branch trails shortest (ties keep the data's order). */
function laneOrder(): ResearchBranchId[] {
  const links: [ResearchBranchId, ResearchBranchId][] = [];
  for (const id of RESEARCH_IDS) for (const n of needsOf(id)) if (RESEARCH[n.id].branch !== RESEARCH[id].branch) links.push([RESEARCH[n.id].branch, RESEARCH[id].branch]);
  const perms = (xs: ResearchBranchId[]): ResearchBranchId[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  let best = [...RESEARCH_BRANCH_IDS], bestCost = Infinity;
  for (const p of perms([...RESEARCH_BRANCH_IDS])) {
    const cost = links.reduce((s, [a, b]) => s + Math.abs(p.indexOf(a) - p.indexOf(b)), 0);
    if (cost < bestCost) (best = p), (bestCost = cost);
  }
  return best;
}

const LAYOUT = layoutTree();

/** Everything a research needs and everything that builds on it, with itself. */
function lineage(id: ResearchId) {
  const out = new Set<ResearchId>([id]);
  const up = (x: ResearchId) => needsOf(x).forEach((n) => !out.has(n.id) && (out.add(n.id), up(n.id)));
  const seen = new Set<ResearchId>();
  const down = (x: ResearchId) => leadsTo(x).forEach((o) => !seen.has(o) && (seen.add(o), out.add(o), down(o)));
  up(id);
  down(id);
  return out;
}

type NodeState = 'later' | 'maxed' | 'active' | 'locked' | 'ready' | 'open';

export function ResearchTree({ blurbs }: { blurbs: Record<string, string> }) {
  const { colony, state, act } = useGame();
  const [hover, setHover] = useState<ResearchId | null>(null);
  const [pinned, setPinned] = useState<ResearchId | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const job = state?.player.researchJob ?? null;
  const pher = colony ? lvl(colony.chambers, 'pheromone_chamber') : 0;

  // open scrolled to the research being learned, or to the edge of what this colony's chamber reaches
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const active = job ? LAYOUT.pos[job.research as ResearchId] : undefined;
    const fx = frontierX(pher);
    if (active) el.scrollLeft = Math.max(0, active.x + NODE_W / 2 - el.clientWidth / 2);
    else if (fx !== undefined) el.scrollLeft = Math.max(0, fx - el.clientWidth * 0.8);
  }, []); // only on first show

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const focus = hover ?? pinned;
  const lit = useMemo(() => (focus ? lineage(focus) : null), [focus]);
  if (!colony || !state) return null;
  const research = state.player.research;

  const info = (id: ResearchId) => {
    const level = lvl(research, id);
    const next = level + 1;
    const missing = missingRequirements(RESEARCH[id].unlock, colony.chambers, research);
    const cost = researchCost(id, next);
    const max = researchMaxLevel(id);
    let st: NodeState;
    if (!RESEARCH[id].mvp) st = 'later';
    else if (level >= max) st = 'maxed';
    else if (job?.research === id) st = 'active';
    else if (missing.length) st = 'locked';
    else if (!job && canAfford(colony.resources, cost)) st = 'ready';
    else st = 'open';
    return { level, next, missing, cost, max, st };
  };

  const pick = (id: ResearchId) => {
    setPinned((p) => (p === id && !phone() ? null : id));
    scroller.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  const fx = frontierX(pher);

  return (
    <div className="tt-wrap">
      <div className="tt-main">
        <div className="tt-scroll" ref={scroller} onPointerLeave={() => setHover(null)}>
          <div className="tt-heads" style={{ width: LAYOUT.width }}>
            {LAYOUT.groups.map((g) => (
              <span key={g.pher} className={`tt-head${g.pher <= pher ? ' reached' : ''}`} style={{ left: g.x, width: g.width - (COL_W - NODE_W) }}>
                Pheromone <b>Lv {g.pher}</b>
              </span>
            ))}
          </div>
          <div className={`tt-tree${lit ? ' focusing' : ''}`} style={{ width: LAYOUT.width, height: LAYOUT.height }}>
            {LAYOUT.lanes.map((l) => (
              <div key={l.id} className="tt-lane" style={{ top: l.top, height: l.height }}>
                <span className="tt-lane-name" title={l.blurb}>{l.name}</span>
              </div>
            ))}
            {fx !== undefined && <div className="tt-frontier" style={{ left: fx }} title={`Your Pheromone Chamber here: Lv ${pher}`} />}
            <svg className="tt-trails" width={LAYOUT.width} height={LAYOUT.height} aria-hidden="true">
              {LAYOUT.edges.map((e) => {
                const on = lvl(research, e.from) >= e.need;
                const hot = !!lit && lit.has(e.from) && lit.has(e.to);
                const cls = `${on ? 'on' : 'off'}${lit ? (hot ? ' hot' : ' dim') : ''}`;
                return (
                  <g key={`${e.from}-${e.to}`}>
                    <path className={`tt-trail ${cls}`} d={e.d} />
                    <g className={`tt-need ${cls}`}>
                      <rect x={e.tagX} y={e.tagY - 9} width={34} height={18} rx={9} />
                      <text x={e.tagX + 17} y={e.tagY + 4} textAnchor="middle">Lv {e.need}</text>
                    </g>
                  </g>
                );
              })}
            </svg>
            {RESEARCH_IDS.map((id) => {
              const p = LAYOUT.pos[id];
              const { level, next, missing, max, st } = info(id);
              const sub =
                st === 'later' ? 'coming later'
                : st === 'maxed' ? 'max level'
                : st === 'active' ? `learning Lv ${next}`
                : st === 'locked' ? `needs ${missing[0].name} ${missing[0].need}${missing.length > 1 ? ` +${missing.length - 1}` : ''}`
                : `next: Lv ${next}${max < Infinity ? ` of ${max}` : ''}`;
              const dim = lit && !lit.has(id);
              return (
                <button
                  key={id}
                  data-id={id}
                  type="button"
                  className={`tt-node ${st}${dim ? ' dim' : ''}${pinned === id ? ' sel' : ''}`}
                  style={{ left: p.x, top: p.y }}
                  aria-label={`${RESEARCH[id].name}, level ${level}, ${sub}`}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(id)}
                  onFocus={() => setHover(id)}
                  onBlur={() => setHover(null)}
                  onClick={() => pick(id)}
                >
                  <span className="tt-tile">
                    <Pic kind="research" id={id} />
                    {level > 0 && <span className="tt-lv">{level}</span>}
                    {(st === 'locked' || st === 'later') && <span className="tt-lock" aria-hidden="true">{LOCK}</span>}
                  </span>
                  <span className="tt-name">{RESEARCH[id].name}</span>
                  <span className="tt-sub">{sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="tt-legend" aria-hidden="true">
          <span><svg width="30" height="8"><path d="M2,4 H28" className="tt-trail on" /></svg>trail laid</span>
          <span><svg width="30" height="8"><path d="M2,4 H28" className="tt-trail off" /></svg>still to lay</span>
          <span><i className="tt-key ready" />can research now</span>
          <span><i className="tt-key active" />learning</span>
          <span><i className="tt-key frontier" />your Pheromone Chamber</span>
        </div>
      </div>
      {pinned && <div className="tt-backdrop" onClick={() => setPinned(null)} />}
      <aside className={`tt-card${pinned ? ' open' : ''}`} aria-live="polite">
        {focus ? (
          <Card id={focus} info={info(focus)} blurb={blurbs[focus]} onGo={pick} onClose={() => setPinned(null)}
            onResearch={() => act(() => api.post('/api/research', { colonyId: colony.id, research: focus }))}
            why={whyNot(focus)} />
        ) : job && LAYOUT.pos[job.research as ResearchId] ? (
          <Card id={job.research as ResearchId} info={info(job.research as ResearchId)} blurb={blurbs[job.research]} onGo={pick} onClose={() => setPinned(null)} onResearch={() => {}} why="Researching now" />
        ) : (
          <div className="tt-hint">
            <h3>Four branches</h3>
            <p className="muted small">Hover or tap a research to see what it does, what it needs and what it leads to.</p>
            <ul>
              {RESEARCH_BRANCH_IDS.map((b) => (
                <li key={b}><b>{RESEARCH_BRANCHES[b].name}:</b> <span className="muted">{RESEARCH_BRANCHES[b].blurb}</span></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );

  /** Why the Research button is off, or '' when it's on. Same rules as the list. */
  function whyNot(id: ResearchId): string {
    const { level, missing, cost, max } = info(id);
    if (!RESEARCH[id].mvp) return 'Coming in a later build';
    if (level >= max) return 'Highest level reached';
    if (missing.length) return `Needs ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}`;
    if (job) return job.research === id ? 'Researching now' : 'Another research is running';
    if (colony!.buildJob?.chamber === 'pheromone_chamber') return 'Pheromone Chamber is being enlarged';
    if (!canAfford(colony!.resources, cost)) return whyShort(colony!, cost, state!.world.speed);
    return '';
  }
}

function Card(props: {
  id: ResearchId;
  info: { level: number; next: number; cost: ReturnType<typeof researchCost>; max: number; st: NodeState };
  blurb?: string;
  why: string;
  onGo: (id: ResearchId) => void;
  onClose: () => void;
  onResearch: () => void;
}) {
  const { id, info, blurb, why, onGo } = props;
  const { colony, state } = useGame();
  if (!colony || !state) return null;
  const research = state.player.research;
  const pher = lvl(colony.chambers, 'pheromone_chamber');
  const secs = researchSeconds(id, info.next, { worldSpeed: state.world.speed, pheromone: pher, timeMultiplier: state.player.timeMultiplier, research });
  const leads = leadsTo(id);
  const r = RESEARCH[id];
  return (
    <>
      <div className="tt-card-head">
        <Pic kind="research" id={id} />
        <div>
          <h3>{r.name}</h3>
          <span className="muted small">
            {info.level ? `Level ${info.level}` : 'Not learned'}
            {info.max < Infinity ? ` of ${info.max}` : ''} · {RESEARCH_BRANCHES[r.branch].name}
          </span>
        </div>
        <button type="button" className="btn small tt-close" onClick={props.onClose}>Close</button>
      </div>
      {blurb && <p className="small">{blurb}</p>}
      {info.st !== 'later' && info.st !== 'maxed' && (
        <div className="tt-next">
          <h4>Level {info.next}</h4>
          <div className="tt-cost">
            <Cost cost={info.cost} have={colony.resources} />
            <span className="muted small">{fmtDuration(secs * 1000)}</span>
          </div>
          <div className="tt-act">
            <button type="button" className="btn primary" disabled={!!why} onClick={props.onResearch}>Research {info.next}</button>
            {why && <span className="why">{why}</span>}
          </div>
        </div>
      )}
      {(info.st === 'later' || info.st === 'maxed') && <p className="muted small">{why}</p>}
      <div>
        <h4>Needs</h4>
        <ul className="tt-links">
          {Object.entries(r.unlock).map(([k, need]) => {
            const isR = k.startsWith('research.');
            const rid = k.slice(9) as ResearchId;
            const have = isR ? lvl(research, rid) : lvl(colony.chambers, k as ChamberId);
            const ok = have >= need;
            const mark = ok ? <span className="ok">✓ Lv {need}</span> : <span className="no">Lv {need} · you {have}</span>;
            return isR && RESEARCH[rid] ? (
              <li key={k}>
                <button type="button" onClick={() => onGo(rid)}><Pic kind="research" id={rid} /><span>{RESEARCH[rid].name}</span>{mark}</button>
              </li>
            ) : (
              <li key={k} className="plain">
                <Pic kind="chamber" id={k} /><span>{CHAMBERS[k as ChamberId]?.name ?? k} <span className="muted">(this colony)</span></span>{mark}
              </li>
            );
          })}
        </ul>
      </div>
      {leads.length > 0 ? (
        <div>
          <h4>Leads to</h4>
          <ul className="tt-links">
            {leads.map((o) => (
              <li key={o}>
                <button type="button" onClick={() => onGo(o)}><Pic kind="research" id={o} /><span>{RESEARCH[o].name}</span><span className="muted small">at Lv {RESEARCH[o].unlock[`research.${id}`]}</span></button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted small">Nothing builds on this yet.</p>
      )}
    </>
  );
}

/** The x of the dashed line after the last column this chamber level reaches, or undefined if it reaches all or none. */
function frontierX(pher: number): number | undefined {
  const reached = LAYOUT.groups.filter((g) => g.pher <= pher);
  if (!reached.length || reached.length === LAYOUT.groups.length) return undefined;
  const g = reached[reached.length - 1];
  return g.x + g.width - (COL_W - NODE_W) / 2;
}

const phone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 759px)').matches;

const LOCK = (
  <svg viewBox="0 0 12 12">
    <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" />
    <path d="M4,5.5 V4 a2,2 0 0 1 4,0 V5.5" fill="none" strokeWidth="1.6" />
  </svg>
);
