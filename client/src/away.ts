// "While you were away": remembers what the colony looked like when the player last had the game open,
// and on return lists what changed (chambers, research, stores) plus the reports filed meanwhile.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RESOURCE_IDS, type Resources } from '@hormigas/shared';
import { api } from './api';
import type { ServerColony, ServerState } from './game';

/** Away at least this long (real time) before the summary shows. */
const AWAY_MIN_MS = 20 * 60_000;

interface Snapshot {
  at: number;
  colonyId: number;
  chambers: Record<string, number>;
  research: Record<string, number>;
  resources: Resources;
}

export interface AwaySummary {
  since: number;
  chambers: { id: string; from: number; to: number }[];
  research: { id: string; from: number; to: number }[];
  /** net change in stores while away (production, gifts and loot minus losses and spending) */
  stores: Resources;
  reports: { id: number; type: string; title: string }[];
}

const keyFor = (playerId: number) => `hormigas.seen.${playerId}`;

function read(key: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function write(key: string, s: Snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* storage unavailable: no summary, nothing else breaks */
  }
}

function levelUps(before: Record<string, number>, after: Record<string, number>) {
  return Object.keys(after)
    .filter((id) => (after[id] ?? 0) > (before[id] ?? 0))
    .map((id) => ({ id, from: before[id] ?? 0, to: after[id] }));
}

export function useAway(state: ServerState | null, colony: ServerColony | null, now: number) {
  const [summary, setSummary] = useState<AwaySummary | null>(null);
  const latest = useRef({ state, colony, now });
  latest.current = { state, colony, now };
  const checked = useRef(false);

  const snap = useCallback((): Snapshot | null => {
    const { state: s, colony: c, now: t } = latest.current;
    if (!s || !c) return null;
    return { at: t, colonyId: c.id, chambers: { ...c.chambers } as any, research: { ...s.player.research }, resources: { ...c.resources } };
  }, []);

  /** Compare the stored snapshot with now; show a summary if the player was gone long enough. */
  const check = useCallback(async () => {
    const { state: s, colony: c, now: t } = latest.current;
    if (!s || !c) return;
    const before = read(keyFor(s.player.id));
    const cur = snap();
    if (cur) write(keyFor(s.player.id), cur);
    if (!before || t - before.at < AWAY_MIN_MS) return;
    let reports: AwaySummary['reports'] = [];
    try {
      const r = await api.get<{ reports: any[] }>('/api/reports?limit=100');
      reports = r.reports.filter((x) => x.createdAt > before.at).map((x) => ({ id: x.id, type: x.type, title: x.title }));
    } catch {
      /* show the rest anyway */
    }
    const same = before.colonyId === c.id;
    const stores = Object.fromEntries(RESOURCE_IDS.map((r) => [r, same ? Math.floor(c.resources[r] - before.resources[r]) : 0])) as Resources;
    const out: AwaySummary = {
      since: before.at,
      chambers: same ? levelUps(before.chambers, c.chambers as any) : [],
      research: levelUps(before.research, s.player.research),
      stores,
      reports,
    };
    const anything = out.chambers.length || out.research.length || out.reports.length || RESOURCE_IDS.some((r) => stores[r] !== 0);
    if (anything) setSummary(out);
  }, [snap]);

  // first state of the session: compare with the last visit
  useEffect(() => {
    if (!state || !colony || checked.current) return;
    checked.current = true;
    check();
  }, [state, colony, check]);

  // keep the snapshot fresh while the game is in view; compare again when it comes back into view
  useEffect(() => {
    if (!state) return;
    const key = keyFor(state.player.id);
    // background tabs keep polling, so only save while in view, and once more on the way out
    const save = (force = false) => {
      if (!force && document.visibilityState !== 'visible') return;
      const s = snap();
      if (s) write(key, s);
    };
    const onVis = () => (document.visibilityState === 'visible' ? check() : save(true));
    const onHide = () => save(true);
    const t = setInterval(save, 30_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [state?.player.id, snap, check]);

  return { away: summary, dismissAway: () => setSummary(null) };
}
