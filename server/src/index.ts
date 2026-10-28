import { buildApp } from './app';
import { config } from './config';
import { closePool, getPool, tx } from './db';
import { migrate } from './migrate';
import { startEventLoop, unknownPendingEventTypes } from './events';
import { getWorld } from './world';
import { refreshAllPoints } from './game/points';
import { ensureWildNests } from './game/nests';
import { ensureNestEvents } from './game/nestEvents';
import { now } from './clock';
import { syncFeedbackToGitHub } from './game/feedbackGithub';

async function main() {
  const applied = await migrate();
  if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
  const world = await getWorld(getPool());
  console.log(`World "${world.name}" (speed ×${world.speed})${config.production ? ' — production' : ''}`);
  const nests = await tx((q) => ensureWildNests(q, world.id, now()));
  if (nests) console.log(`Wild nests spawned in ${nests} patch${nests === 1 ? '' : 'es'}`);
  const armed = await tx((q) => ensureNestEvents(q, world.id, now()));
  if (armed) console.log(`Nest events scheduled for ${armed} colon${armed === 1 ? 'y' : 'ies'}`);
  const app = await buildApp({ logger: true });
  const unknown = await unknownPendingEventTypes(getPool());
  if (unknown.length) console.warn(`Pending events with no handler on this build (left alone): ${unknown.join(', ')}`);
  const stopEvents = startEventLoop();
  // keep rankings / strength protection current
  let pointsTimer: NodeJS.Timeout;
  const refresh = () =>
    refreshAllPoints(getPool())
      .catch((e) => console.error('points refresh failed', e))
      .finally(() => (pointsTimer = setTimeout(refresh, 60_000)));
  pointsTimer = setTimeout(refresh, 5_000);
  // post in-game feedback to GitHub, catching up on anything that failed before
  const feedbackTimer = config.feedbackGithubToken ? setInterval(() => void syncFeedbackToGitHub(getPool()), 5 * 60_000) : undefined;
  if (feedbackTimer) void syncFeedbackToGitHub(getPool());
  else console.log('FEEDBACK_GITHUB_TOKEN not set: feedback stays in the database only');
  await app.listen({ port: config.port, host: config.host });

  // Hosts stop the old instance with SIGTERM on every deploy: finish in-flight work, then exit.
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopEvents();
    clearTimeout(pointsTimer);
    clearInterval(feedbackTimer);
    await app.close().catch(() => {});
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
