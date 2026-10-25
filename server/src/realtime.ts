// WebSocket push: tells a player's open tabs that something happened so they refresh right away.
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE, playerIdFromToken } from './auth';
import { setReportListener } from './game/reports';

type Sock = { send: (data: string) => void; readyState: number };
const sockets = new Map<number, Set<Sock>>();

export function notify(playerId: number, msg: object) {
  const set = sockets.get(playerId);
  if (!set) return;
  const data = JSON.stringify(msg);
  // small delay so the transaction that triggered this has committed before clients re-fetch
  setTimeout(() => {
    for (const s of set) if (s.readyState === 1) s.send(data);
  }, 250);
}

export const connectedPlayers = () => sockets.size;

export async function realtimeRoutes(app: FastifyInstance) {
  setReportListener((playerId, r) => notify(playerId, { type: 'report', report: r }));

  app.get('/api/ws', { websocket: true }, async (socket, req) => {
    const playerId = await playerIdFromToken(req.cookies[SESSION_COOKIE]);
    if (!playerId) {
      socket.close(4401, 'unauthorized');
      return;
    }
    let set = sockets.get(playerId);
    if (!set) sockets.set(playerId, (set = new Set()));
    set.add(socket);
    socket.send(JSON.stringify({ type: 'hello' }));
    const ping = setInterval(() => socket.readyState === 1 && socket.ping(), 25_000);
    socket.on('close', () => {
      clearInterval(ping);
      set!.delete(socket);
      if (set!.size === 0) sockets.delete(playerId);
    });
  });
}
