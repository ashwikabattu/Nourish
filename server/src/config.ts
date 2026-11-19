export interface Config {
  port: number;
  isProduction: boolean;
  databaseUrl: string | undefined;
  databaseSslCa: string | undefined;
  pgliteDir: string;
  jwtSecret: string;
  staticDir: string | undefined;
  /** Number of reverse proxies in front of the app (load balancer, CloudFront, ...). */
  trustProxy: number;
  /** api.data.gov key for USDA FoodData Central. DEMO_KEY works but allows only a few requests per hour. */
  fdcApiKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProduction ? '' : 'dev-only-secret-change-me-in-production-please');

  if (isProduction) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
    if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }

  return {
    port: Number(env.PORT ?? 3000),
    isProduction,
    databaseUrl: env.DATABASE_URL || undefined,
    databaseSslCa: env.DATABASE_SSL_CA || undefined,
    pgliteDir: env.PGLITE_DIR ?? './.data',
    jwtSecret,
    staticDir: env.STATIC_DIR || undefined,
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    fdcApiKey: env.FDC_API_KEY || 'DEMO_KEY',
  };
}
