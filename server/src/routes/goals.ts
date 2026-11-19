import { Router } from 'express';
import { userIdOf } from '../auth.js';
import type { Db, Queryable } from '../db.js';
import { goalsSchema } from '../validation.js';

export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const DEFAULT_GOALS: Goals = { calories: 2000, protein: 100, carbs: 250, fat: 65 };

export async function getGoals(db: Queryable, userId: number): Promise<Goals> {
  const { rows } = await db.query<Goals>('SELECT calories, protein, carbs, fat FROM goals WHERE user_id = $1', [
    userId,
  ]);
  return rows[0] ?? DEFAULT_GOALS;
}

export function goalsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ goals: await getGoals(db, userIdOf(req)) });
  });

  router.put('/', async (req, res) => {
    const g = goalsSchema.parse(req.body);
    const { rows } = await db.query<Goals>(
      `INSERT INTO goals (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         calories = EXCLUDED.calories, protein = EXCLUDED.protein,
         carbs = EXCLUDED.carbs, fat = EXCLUDED.fat, updated_at = now()
       RETURNING calories, protein, carbs, fat`,
      [userIdOf(req), g.calories, g.protein, g.carbs, g.fat],
    );
    res.json({ goals: rows[0] });
  });

  return router;
}
