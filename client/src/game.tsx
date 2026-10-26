// Game state: fetched from the server, then advanced locally every second with the shared rules.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CHAMBERS,
  RESEARCH,
  RESOURCE_IDS,
  queueEndsAt,
  storageCapacity,
  syncColony,
  type ChamberId,
  type ColonyState,
  type ResearchId,
} from '@hormigas/shared';
import { api, ApiError } from './api';
import { pushNotification, setTitleBadge } from './notify';

export interface ServerColony extends ColonyState {
  id: number;
  name: string;
  coords: { region: number; patch: number; spot: number };
  baseSpace: number;
  buildJob: null | { chamber: string; level: number; startAt: number; endAt: number; cost: any };
}

export interface ServerState {
  serverNow: number;
  world: { id: number; name: string; speed: number };
  player: {
    id: number;
    username: string;
    research: Record<string, number>;
    researchJob: null | { research: string; level: number; startAt: number; endAt: number; colonyId: number };
    points: { total: number; economy: number; research: number; military: number };
    protectedUntil: number;
    timeMultiplier: number;
  };
  colonies: { id: number; name: string; coords: { region: number; patch: number; spot: number } }[];
  colony: ServerColony | null;
  [extra: string]: any;
}

interface Toast {
  id: number;
  kind: 'error' | 'ok';
  text: string;
}

interface GameCtx {
  state: ServerState | null;
  /** The current colony advanced to "now" */
  colony: ServerColony | null;
  /** Server-time "now" in epoch ms, ticking every second */
  now: number;
  loggedIn: boolean | null;
  refresh: () => Promise<void>;
  selectColony: (id: number) => void;
  /** Run an API action, refresh state, show errors as toasts. Returns true on success. */
  act: (fn: () => Promise<unknown>, okText?: string) => Promise<boolean>;
  toasts: Toast[];
  toast: (kind: Toast['kind'], text: string) => void;
  setLoggedIn: (v: boolean) => void;
}

const Ctx = createContext<GameCtx | null>(null);

const storedColony = () => {
  try {
    return Number(localStorage.getItem('hormigas.colony')) || 0;
  } catch {
    return 0;
  }
};

/** Collect the timers whose completion should trigger a refresh. */
function upcomingTimers(s: ServerState): number[] {
  const out: number[] = [];
  if (s.colony?.buildJob) out.push(s.colony.buildJob.endAt);
  if (s.player.researchJob) out.push(s.player.researchJob.endAt);
  const qe = s.colony ? queueEndsAt(s.colony.unitQueue) : null;
  if (qe) out.push(qe);
  for (const m of s.missions ?? []) out.push(m.status === 'outbound' ? m.arriveAt : m.returnAt);
  for (const m of s.incoming ?? []) out.push(m.arriveAt);
  return out;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerState | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [colonyId, setColonyId] = useState(storedColony);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const refreshing = useRef(false);
  const lastTimerRefresh = useRef(0);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const s = await api.get<ServerState>(`/api/state${colonyId ? `?colony=${colonyId}` : ''}`);
      setOffset(s.serverNow - Date.now());
      setState(s);
      setLoggedIn(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setLoggedIn(false);
        setState(null);
      }
    } finally {
      refreshing.current = false;
    }
  }, [colonyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 1 s local clock
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // poll every 20 s, and right after any timer finishes
  useEffect(() => {
    if (!loggedIn) return;
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [loggedIn, refresh]);

  const now = tick + offset;

  useEffect(() => {
    if (!state) return;
    const due = upcomingTimers(state).filter((t) => t <= now && t > lastTimerRefresh.current);
    if (due.length) {
      lastTimerRefresh.current = Math.max(...due);
      setTimeout(refresh, 600);
    }
  }, [now, state, refresh]);

  // refresh when the tab becomes visible again
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && loggedIn && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loggedIn, refresh]);

  // live push from the server: refresh immediately, notify about reports / incoming / returns
  useEffect(() => {
    if (!loggedIn) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 1000;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.onopen = () => (retry = 1000);
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'hello') return;
        refresh();
        if (msg.type === 'report') pushNotification(msg.report.title, undefined, `report-${msg.report.id}`);
        if (msg.type === 'incoming' && (msg.missionType === 'raid' || msg.missionType === 'scout')) {
          const text = msg.missionType === 'raid' ? `Raid incoming from ${msg.from}!` : `Enemy scouts heading for ${msg.colony}`;
          if (!pushNotification(text, `Arrives ${new Date(msg.arriveAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'incoming'))
            toast('error', text);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [loggedIn, refresh, toast]);

  // notifications for things that finished while the tab was in the background
  const prev = useRef<ServerState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!p || !state || !p.colony || !state.colony || p.colony.id !== state.colony.id) return;
    if (p.colony.buildJob && !state.colony.buildJob && (state.colony.chambers as any)[p.colony.buildJob.chamber] === p.colony.buildJob.level)
      pushNotification(`${CHAMBERS[p.colony.buildJob.chamber as ChamberId].name} reached level ${p.colony.buildJob.level}`, undefined, 'build');
    if (p.player.researchJob && !state.player.researchJob && (state.player.research as any)[p.player.researchJob.research] === p.player.researchJob.level)
      pushNotification(`Research complete: ${RESEARCH[p.player.researchJob.research as ResearchId].name} ${p.player.researchJob.level}`, undefined, 'research');
    if (p.colony.unitQueue.length > 0 && state.colony.unitQueue.length === 0) pushNotification('The Brood Hall has finished raising units', undefined, 'brood');
  }, [state]);

  const colony = useMemo(() => (state?.colony ? syncColony(state.colony, now, state.world.speed) : null), [state, now]);

  // storage full
  const fullRef = useRef<Set<string>>(new Set());
  const fullInit = useRef<number | null>(null);
  useEffect(() => {
    if (!colony) return;
    const first = fullInit.current !== colony.id; // don't notify for storage that was already full on load
    fullInit.current = colony.id;
    const caps = storageCapacity(colony.chambers);
    for (const r of RESOURCE_IDS) {
      const full = colony.resources[r] >= caps[r];
      const key = `${colony.id}:${r}`;
      if (full && !fullRef.current.has(key)) {
        if (!first) pushNotification(`${r[0].toUpperCase()}${r.slice(1)} storage is full`, 'Production has stopped. Spend it or build more storage.', `full-${r}`);
        fullRef.current.add(key);
      } else if (!full) fullRef.current.delete(key);
    }
  }, [colony]);

  // tab title: unread reports + hostile incoming
  useEffect(() => {
    if (!state) return setTitleBadge(0);
    const hostile = (state.incoming ?? []).filter((i: any) => i.hostile);
    const raid = hostile.some((i: any) => i.type === 'raid');
    setTitleBadge((state.unreadReports ?? 0) + hostile.length, raid ? 'Raid incoming!' : hostile.length ? 'Scouts incoming' : undefined);
  }, [state]);

  const selectColony = useCallback((id: number) => {
    try {
      localStorage.setItem('hormigas.colony', String(id));
    } catch {
      /* storage unavailable */
    }
    setColonyId(id);
  }, []);

  const act = useCallback(
    async (fn: () => Promise<unknown>, okText?: string) => {
      try {
        await fn();
        if (okText) toast('ok', okText);
        await refresh();
        return true;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Something went wrong.');
        if (e instanceof ApiError && e.status === 401) setLoggedIn(false);
        return false;
      }
    },
    [refresh, toast],
  );

  const value: GameCtx = { state, colony, now, loggedIn, refresh, selectColony, act, toasts, toast, setLoggedIn };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGame outside GameProvider');
  return c;
}
