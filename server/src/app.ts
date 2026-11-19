import path from 'node:path';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { authRouter, requireAuth } from './auth.js';
import type { Db } from './db.js';
import { errorHandler } from './errors.js';
import type { FoodSearch } from './foods.js';
import { entriesRouter } from './routes/entries.js';
import { foodsRouter } from './routes/foods.js';
import { goalsRouter } from './routes/goals.js';
import { profileRouter } from './routes/profile.js';
import { summaryRouter } from './routes/summary.js';

export interface AppOptions {
  db: Db;
  jwtSecret: string;
  /** Built frontend to serve (the Vite `dist` folder). Omit to run the API alone. */
  staticDir?: string;
  /** Max auth attempts per IP per 15 minutes. */
  authRateLimit?: number;
  logRequests?: boolean;
  /** Reverse proxies in front of the app; used to find the real client IP for rate limiting. */
  trustProxy?: number;
  /** Food database lookup (USDA FoodData Central). Omit to disable /api/foods/search. */
  foodSearch?: FoodSearch;
}

const requestLogger: RequestHandler = (req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Math.round(performance.now() - start),
      }),
    );
  });
  next();
};

export function createApp({ db, jwtSecret, staticDir, authRateLimit = 20, logRequests = false, trustProxy = 1, foodSearch }: AppOptions) {
  const app = express();

  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // HTTPS is enforced at the edge (CloudFront). Upgrading asset URLs here would blank the page on plain HTTP.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(express.json({ limit: '50kb' }));
  if (logRequests) app.use(requestLogger);

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again in a few minutes' },
  });
  const auth = requireAuth(jwtSecret);

  app.use('/api/auth', authLimiter, authRouter(db, jwtSecret));
  app.use('/api/entries', auth, entriesRouter(db));
  app.use('/api/goals', auth, goalsRouter(db));
  app.use('/api/summary', auth, summaryRouter(db));
  app.use('/api/profile', auth, profileRouter(db));
  app.use(
    '/api/foods',
    auth,
    // Protects the shared USDA API quota from one client hammering search.
    rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Too many searches, slow down a little' } }),
    foodsRouter(foodSearch),
  );
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (staticDir) {
    const root = path.resolve(staticDir);
    app.use(
      express.static(root, {
        index: false,
        setHeaders(res, filePath) {
          // Vite fingerprints everything in /assets, so those never change.
          const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Single-page app: any other GET returns index.html and the client renders it.
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(root, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
