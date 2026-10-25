export function fmtNum(n: number): string {
  const v = Math.floor(n);
  const a = Math.abs(v);
  if (a < 10_000) return v.toLocaleString('en-US');
  if (a < 1_000_000) return `${(v / 1000).toFixed(a < 100_000 ? 1 : 0)}k`;
  if (a < 1_000_000_000) return `${(v / 1_000_000).toFixed(a < 10_000_000 ? 2 : 1)}M`;
  return `${(v / 1_000_000_000).toFixed(2)}B`;
}

export const fmtFull = (n: number) => Math.floor(n).toLocaleString('en-US');

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export const fmtCoords = (c: { region: number; patch: number; spot: number }) => `${c.region}:${c.patch}:${c.spot}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtFull(n)} ${n === 1 ? one : many}`;
