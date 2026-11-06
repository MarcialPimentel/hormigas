// The members' board and the supercolony's open joint raids (docs/23-supercolonies.md § Joint raids).
import { useCallback, useEffect, useState } from 'react';
import type { Coords, UnitCounts } from '@hormigas/shared';
import { api } from './api';
import { useGame } from './game';

export interface JointRaidView {
  id: number;
  leaderId: number;
  leaderName: string;
  target: Coords;
  targetColonyId: number;
  targetName: string;
  kind: 'nest' | 'mound' | 'den';
  level: number;
  playersNeeded: number;
  landAt: number;
  retreatPct: number;
  joined: { playerId: number; username: string; units: UnitCounts; unitCount: number; worth: number }[];
  playerCount: number;
  mine: boolean;
}

export interface BoardPost {
  id: number;
  playerId: number | null;
  username: string | null;
  kind: 'post' | 'joint_open' | 'joint_result' | 'joint_called_off' | 'joint_cancelled';
  text: string;
  data: any;
  at: number;
}

export interface Board {
  supercolony: { id: number; name: string } | null;
  posts: BoardPost[];
  jointRaids: JointRaidView[];
}

/** The board, refreshed whenever the game state refreshes. `enabled` false skips the fetch (not in a supercolony). */
export function useBoard(enabled: boolean): { board: Board | null; reload: () => void } {
  const { state } = useGame();
  const [board, setBoard] = useState<Board | null>(null);
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    if (!enabled) {
      setBoard(null);
      return;
    }
    let live = true;
    api
      .get('/api/board')
      .then((r) => live && setBoard(r))
      .catch(() => live && setBoard(null));
    return () => {
      live = false;
    };
  }, [enabled, n, state?.serverNow, state?.player.supercolony?.supercolonyId]);
  return { board, reload };
}

export const sameSpot = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;
