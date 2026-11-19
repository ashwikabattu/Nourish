import type { Db } from './db.js';

interface Migration {
  id: string;
  statements: string[];
}

// Append new migrations to the end; never edit one that has shipped.
const migrations: Migration[] = [
  {
    id: '001_init',
    statements: [
      `CREATE TABLE users (
        id            serial PRIMARY KEY,
        email         text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE goals (
        user_id    integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        calories   integer NOT NULL DEFAULT 2000,
        protein    real    NOT NULL DEFAULT 100,
        carbs      real    NOT NULL DEFAULT 250,
        fat        real    NOT NULL DEFAULT 65,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE food_entries (
        id         serial PRIMARY KEY,
        user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       text    NOT NULL,
        meal       text    NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
        calories   integer NOT NULL CHECK (calories >= 0),
        protein    real    NOT NULL DEFAULT 0 CHECK (protein >= 0),
        carbs      real    NOT NULL DEFAULT 0 CHECK (carbs >= 0),
        fat        real    NOT NULL DEFAULT 0 CHECK (fat >= 0),
        eaten_on   date    NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX food_entries_user_date_idx ON food_entries (user_id, eaten_on)`,
    ],
  },
  {
    id: '002_profiles',
    statements: [
      `CREATE TABLE profiles (
        user_id    integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sex        text NOT NULL CHECK (sex IN ('female', 'male')),
        age        integer NOT NULL CHECK (age BETWEEN 19 AND 100),
        height_cm  double precision NOT NULL CHECK (height_cm BETWEEN 90 AND 250),
        weight_kg  double precision NOT NULL CHECK (weight_kg BETWEEN 25 AND 300),
        activity   text NOT NULL CHECK (activity IN ('inactive', 'low_active', 'active', 'very_active')),
        units      text NOT NULL DEFAULT 'imperial' CHECK (units IN ('imperial', 'metric')),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
];

/**
 * Applies pending migrations in one transaction. The advisory lock stops two
 * instances that start at the same time from migrating at once.
 */
export async function migrate(db: Db): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(727274)');
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id         text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));

    const ran: string[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      for (const sql of migration.statements) await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      ran.push(migration.id);
    }
    return ran;
  });
}
