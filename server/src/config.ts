const production = process.env.NODE_ENV === 'production';

export const config = {
  production,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://hormigas:hormigas@localhost:5432/hormigas',
  /** Use TLS for the database connection (needed for most hosted Postgres when connecting over the public internet). */
  databaseSsl: process.env.DATABASE_SSL === 'true',
  /** Speed of the world created on first start. Live = 1; local development defaults to 5. */
  worldSpeed: Number(process.env.WORLD_SPEED ?? (production ? 1 : 5)),
  worldName: process.env.WORLD_NAME ?? 'The Backyard',
  /** Secure (HTTPS-only) cookies. On by default in production. */
  secureCookies: process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === 'true' : production,
  /** Behind a hosting proxy (Railway, Render, Fly…) so client IPs come from X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === 'true' : production,
  /** Folder with the built client to serve, if it exists (npm workspaces run the server from /server). */
  clientDist: process.env.CLIENT_DIST ?? '../client/dist',
  sessionDays: 30,
  /** Secret for the private feedback page (routes/feedbackPage.ts). Unset or under 16 characters = page off. */
  feedbackKey: process.env.FEEDBACK_KEY ?? '',
};
