import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDb, createPgliteDb } from './db.js';
import { createFdcClient } from './foods.js';
import { migrate } from './migrate.js';

const config = loadConfig();

const db = config.databaseUrl
  ? createPgDb(config.databaseUrl, config.databaseSslCa)
  : await createPgliteDb(config.pgliteDir);

const ran = await migrate(db);
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'database ready',
    driver: config.databaseUrl ? 'postgres' : `pglite (${config.pgliteDir})`,
    migrationsApplied: ran,
  }),
);

const app = createApp({
  db,
  jwtSecret: config.jwtSecret,
  staticDir: config.staticDir,
  logRequests: true,
  trustProxy: config.trustProxy,
  foodSearch: createFdcClient({ apiKey: config.fdcApiKey }),
});

if (config.fdcApiKey === 'DEMO_KEY') {
  console.log(
    JSON.stringify({
      level: 'warn',
      msg: 'FDC_API_KEY not set; food search is using DEMO_KEY, which allows only a few searches per hour. Get a free key at https://fdc.nal.usda.gov/api-key-signup',
    }),
  );
}

const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', msg: `listening on http://localhost:${config.port}` }));
});

// Let in-flight requests finish when the platform stops the container during a deploy.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(JSON.stringify({ level: 'info', msg: `${signal} received, shutting down` }));
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
