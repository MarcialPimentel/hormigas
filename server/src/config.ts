export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://hormigas:hormigas@localhost:5432/hormigas',
  /** Speed of the world created on first start. Docs default is 1; testing default is 5. */
  worldSpeed: Number(process.env.WORLD_SPEED ?? 5),
  worldName: process.env.WORLD_NAME ?? 'The Backyard',
  /** Set to "true" in production behind HTTPS so cookies are Secure. */
  secureCookies: process.env.SECURE_COOKIES === 'true',
  /** Folder with the built client to serve, if it exists (npm workspaces run the server from /server). */
  clientDist: process.env.CLIENT_DIST ?? '../client/dist',
  sessionDays: 30,
};
