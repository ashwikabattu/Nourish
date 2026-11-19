import fs from 'node:fs';
import pg from 'pg';

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Runs `fn` inside a transaction on a single connection; rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Production database: a connection pool to a real Postgres server (AWS RDS, Docker, etc.). */
export function createPgDb(connectionString: string, sslCaPath?: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    ssl: sslCaPath ? { ca: fs.readFileSync(sslCaPath, 'utf8') } : undefined,
  });

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(text: string, params?: unknown[]) {
      const result = await client.query(text, params);
      return { rows: result.rows as T[] };
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Embedded Postgres (PGlite, compiled to WebAssembly). Used for tests and for
 * zero-setup local development. Pass no directory for a throwaway in-memory database.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(dataDir);

  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await db.query<T>(text, params as unknown[]);
      return { rows: result.rows };
    },
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          async query<T>(text: string, params?: unknown[]) {
            return { rows: (await tx.query<T>(text, params as unknown[])).rows };
          },
        }),
      ),
    close: () => db.close(),
  };
}
