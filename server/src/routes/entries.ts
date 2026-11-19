import { Router } from 'express';
import { userIdOf } from '../auth.js';
import type { Db } from '../db.js';
import { HttpError } from '../errors.js';
import { dateQuery, entryPatchSchema, entrySchema, idParam } from '../validation.js';

export const ENTRY_COLUMNS = `id, name, meal, calories, protein, carbs, fat,
  to_char(eaten_on, 'YYYY-MM-DD') AS date, created_at AS "createdAt"`;

// API field -> database column. Doubles as the allow-list for PATCH.
const COLUMN_FOR = {
  name: 'name',
  meal: 'meal',
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  date: 'eaten_on',
} as const;

export function entriesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date } = dateQuery.parse(req.query);
    const { rows } = await db.query(
      `SELECT ${ENTRY_COLUMNS} FROM food_entries
       WHERE user_id = $1 AND eaten_on = $2
       ORDER BY created_at, id`,
      [userIdOf(req), date],
    );
    res.json({ entries: rows });
  });

  router.post('/', async (req, res) => {
    const e = entrySchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO food_entries (user_id, name, meal, calories, protein, carbs, fat, eaten_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${ENTRY_COLUMNS}`,
      [userIdOf(req), e.name, e.meal, e.calories, e.protein, e.carbs, e.fat, e.date],
    );
    res.status(201).json({ entry: rows[0] });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = entryPatchSchema.parse(req.body);

    const fields = Object.entries(patch) as [keyof typeof COLUMN_FOR, unknown][];
    const sets = fields.map(([field], i) => `${COLUMN_FOR[field]} = $${i + 3}`);
    const { rows } = await db.query(
      `UPDATE food_entries SET ${sets.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING ${ENTRY_COLUMNS}`,
      [id, userIdOf(req), ...fields.map(([, value]) => value)],
    );
    if (!rows[0]) throw new HttpError(404, 'Entry not found');
    res.json({ entry: rows[0] });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await db.query('DELETE FROM food_entries WHERE id = $1 AND user_id = $2 RETURNING id', [
      id,
      userIdOf(req),
    ]);
    if (!rows[0]) throw new HttpError(404, 'Entry not found');
    res.status(204).end();
  });

  return router;
}
