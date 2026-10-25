import { buildApp } from './app';
import { config } from './config';
import { getPool } from './db';
import { migrate } from './migrate';
import { startEventLoop } from './events';
import { getWorld } from './world';

async function main() {
  const applied = await migrate();
  if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
  const world = await getWorld(getPool());
  console.log(`World "${world.name}" (speed ×${world.speed})`);
  const app = await buildApp({ logger: true });
  startEventLoop();
  await app.listen({ port: config.port, host: config.host });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
