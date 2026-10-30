// Everything under way, at a glance (the war room's right column, the Missions list on phones, and the card on
// the Colony screen): parties coming at you first, then your own missions, each with a real progress bar
// (out to the target, the tick where it arrives, and home again), a countdown and Recall.
import { CASTES, MISSION_TYPES, type MissionType } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtDuration, fmtFull } from '../format';
import { Empty, TRIP_LOAD, tripAnt } from './ui';
import { useMotion } from '../motion';
import type { Caste } from '../art/ants';

type Coords = { region: number; patch: number; spot: number };
/** A row was clicked: show its column. `key` is the patch scene's party key ('m12', 'i7'). */
export type FocusParty = (key: string, at: Coords, alsoAt?: Coords) => void;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + (b ?? 0), 0);
/** Draw a party as soldiers when fighters are most of it (raids, holds), else as workers. */
const soldierLed = (units: Record<string, number>) => {
  let f = 0, all = 0;
  for (const [id, c] of Object.entries(units ?? {})) {
    all += c;
    if ((CASTES as Record<string, { role?: string }>)[id]?.role === 'soldier') f += c;
  }
  return all > 0 && f * 2 >= all;
};
const label = (t: string) => (MISSION_TYPES as Record<string, { label: string }>)[t]?.label ?? t;
const INCOMING: Record<string, string> = { swarm: 'Army ant swarm', raid: 'Raid', scout: 'Enemy scouts', hold: 'Allied soldiers', transport: 'Delivery' };

/** How far along a trip is, 0…1 across the whole bar, and what it's doing now. */
export function tripProgress(m: { status: string; departAt: number; arriveAt: number; returnAt?: number | null; type: string }, now: number) {
  const oneWay = !!(MISSION_TYPES as Record<string, { oneWay?: boolean }>)[m.type]?.oneWay;
  const out = clamp01((now - m.departAt) / Math.max(1, m.arriveAt - m.departAt));
  if (m.status === 'holding') return { x: oneWay ? 1 : 0.5, phase: 'holding' as const, oneWay };
  if (m.status === 'outbound') return { x: oneWay ? out : out * 0.5, phase: 'out' as const, oneWay };
  const back = clamp01((now - m.arriveAt) / Math.max(1, (m.returnAt ?? m.arriveAt) - m.arriveAt));
  return { x: 0.5 + back * 0.5, phase: 'back' as const, oneWay };
}

/** The party itself walks along the bar: a few small ants, facing home on the way back, carrying what they found. */
const ANT_PX = 24;
const PARTY_W = 3 * (ANT_PX + 2) + 4;
function Bar({ x, oneWay, tone, back, caste = 'worker', loads = [], still }: {
  x: number;
  oneWay: boolean;
  tone: 'ours' | 'hostile' | 'friend';
  back?: boolean;
  caste?: Caste;
  loads?: string[];
  still?: boolean;
}) {
  const { reduced } = useMotion();
  const walk = !reduced && !still;
  return (
    <span className={`mbar ${tone}${back ? ' back' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x * 100)}>
      <span className="mbar-track">
        <span className="mbar-fill" style={{ width: `${(x * 100).toFixed(2)}%` }} />
        {!oneWay && <span className="mbar-tick" aria-hidden="true" />}
      </span>
      {/* the whole party stays on the bar: it slides across the room the bar has left over */}
      <span className={`mbar-party${back ? ' back' : ''}`} style={{ left: `calc((100% - ${PARTY_W}px) * ${x.toFixed(4)})` }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} dangerouslySetInnerHTML={{ __html: tripAnt(caste, i, walk, tone === 'hostile' && caste !== 'army', loads.length ? TRIP_LOAD[loads[i % loads.length]] : undefined, ANT_PX) }} />
        ))}
      </span>
    </span>
  );
}

export function UnderWay({ onFocus, compact, limit }: { onFocus?: FocusParty; compact?: boolean; limit?: number }) {
  const { state, colony, act, now } = useGame();
  if (!state || !colony) return null;
  const homes = new Map((state.colonies ?? []).map((c) => [c.id, c]));
  const incoming = ((state.incoming ?? []) as any[]).slice().sort((a, b) => Number(b.hostile) - Number(a.hostile) || a.arriveAt - b.arriveAt);
  const missions = ((state.missions ?? []) as any[]).slice().sort((a, b) => (a.status === 'outbound' ? a.arriveAt : a.returnAt ?? Infinity) - (b.status === 'outbound' ? b.arriveAt : b.returnAt ?? Infinity));
  if (!incoming.length && !missions.length) return <Empty>Nothing under way. Tap a spot on the patch to send ants there.</Empty>;
  const rows = [...incoming.map((i) => ({ kind: 'in' as const, i })), ...missions.map((m) => ({ kind: 'm' as const, m }))];
  const shown = limit ? rows.slice(0, limit) : rows;
  const click = (key: string, at: Coords, alsoAt?: Coords) => onFocus && (() => onFocus(key, at, alsoAt));
  return (
    <>
      <ul className={`underway${compact ? ' compact' : ''}`}>
        {shown.map((r) => {
          if (r.kind === 'in') {
            const i = r.i;
            const target: Coords = i.herd ?? homes.get(i.targetColonyId)?.coords ?? colony.coords;
            const x = i.departAt ? clamp01((now - i.departAt) / Math.max(1, i.arriveAt - i.departAt)) : 0.5;
            const go = click(`i${i.id}`, target, i.origin);
            return (
              <li key={`i${i.id}`} className={i.hostile ? 'hostile' : 'friend'}>
                <div className="uw-head">
                  {go ? (
                    <button className="linkish uw-title" onClick={go} title="Show it on the patch">
                      {INCOMING[i.type] ?? i.type}
                    </button>
                  ) : (
                    <strong className="uw-title">{INCOMING[i.type] ?? i.type}</strong>
                  )}
                  <span className="uw-time">{i.arriveAt > now ? fmtDuration(i.arriveAt - now) : 'now'}</span>
                </div>
                <Bar x={x} oneWay tone={i.hostile ? 'hostile' : 'friend'} caste={i.type === 'swarm' ? 'army' : i.type === 'raid' || i.type === 'hold' ? 'soldier' : 'worker'} />
                {i.hostile && (i.type === 'swarm' || (i.type === 'raid' && (i.wild || i.herd))) && (
                  <p className="uw-advice">
                    {i.type === 'swarm'
                      ? "Sized so the army you have at home now usually wins. Keep your soldiers in to fight it and win corpses to haul, or send them away and let it take some unprotected food. It never touches chambers."
                      : i.herd
                        ? "They're after your tenders and the honeydew. Send more soldiers to tend it, or call your tenders home before they land."
                        : 'Wild ants. Keep soldiers at home to fight them off, or send your army away until they’ve gone.'}
                  </p>
                )}
                <p className="uw-sub">
                  {i.from}{i.unitCount && i.type !== 'scout' ? ` · ${fmtFull(i.unitCount)} ${i.type === 'swarm' ? 'ants' : 'units'}` : ''} → {i.herd ? 'your aphid herd' : homes.get(i.targetColonyId)?.name ?? 'you'}
                </p>
              </li>
            );
          }
          const m = r.m;
          const p = tripProgress(m, now);
          const n = sum(m.units);
          const from = homes.get(m.originColonyId);
          const ends = p.phase === 'out' ? m.arriveAt : p.phase === 'back' ? m.returnAt : null;
          const verb = p.phase === 'holding' ? (m.type === 'tend' ? 'Tending' : 'Holding') : p.phase === 'out' ? (p.oneWay ? 'Arrives' : 'There') : 'Home';
          const go = click(`m${m.id}`, from?.coords ?? colony.coords, m.target);
          // your own colonies by name; anywhere else by its coordinates
          const mine = (state.colonies ?? []).find((c) => c.coords.region === m.target.region && c.coords.patch === m.target.patch && c.coords.spot === m.target.spot);
          const where = mine?.name ?? fmtCoords(m.target);
          const what = Object.entries(m.units as Record<string, number>).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([id, c]) => `${fmtFull(c)} ${(CASTES as Record<string, { name: string }>)[id]?.name ?? id}`).join(', ');
          return (
            <li key={`m${m.id}`} className={`ours phase-${p.phase}`}>
              <div className="uw-head">
                {go ? (
                  <button className="linkish uw-title" onClick={go} title="Show it on the patch">
                    {label(m.type as MissionType)} {p.phase === 'back' ? '←' : '→'} {where}
                  </button>
                ) : (
                  <strong className="uw-title">{label(m.type as MissionType)} {p.phase === 'back' ? '←' : '→'} {where}</strong>
                )}
                <span className="uw-time" title={ends ? `${verb} ${fmtClock(ends)}` : undefined}>
                  {ends ? `${verb} ${ends > now ? `in ${fmtDuration(ends - now)}` : 'now'}` : verb}
                </span>
              </div>
              <Bar
                x={p.x}
                oneWay={p.oneWay}
                tone="ours"
                back={p.phase === 'back'}
                still={p.phase === 'holding'}
                caste={m.type === 'colonize' ? 'alate' : soldierLed(m.units) ? 'soldier' : 'worker'}
                loads={p.phase === 'back' ? Object.keys(TRIP_LOAD).filter((r) => (m.cargo?.[r] ?? 0) > 0) : []}
              />
              <p className="uw-sub">
                {homes.size > 1 && from ? `From ${from.name} · ` : ''}
                {compact ? `${fmtFull(n)} ants` : what || `${fmtFull(n)} ants`}
                {m.result?.recalled ? ' · recalled' : m.result?.turnedBack ? ' · turned back' : ''}
                {p.phase === 'back' && m.cargo && sum(m.cargo) > 0 ? ` · carrying ${fmtFull(sum(m.cargo))}` : ''}
                {!compact && (p.phase === 'holding' || (p.phase === 'out' && now < m.arriveAt)) && (
                  <button
                    className="btn ghost small uw-recall"
                    onClick={() => act(() => api.post(`/api/missions/${m.id}/recall`), p.phase === 'holding' ? 'Called home.' : 'Mission recalled.')}
                  >
                    {p.phase === 'holding' ? 'Call home' : 'Recall'}
                  </button>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      {limit && rows.length > limit && <p className="muted small">and {rows.length - limit} more</p>}
    </>
  );
}
