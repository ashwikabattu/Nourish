import { Router } from 'express';
import { userIdOf } from '../auth.js';
import type { Db } from '../db.js';
import { calculateDri, type Body } from '../dri.js';
import { profileSchema } from '../validation.js';
import type { Goals } from './goals.js';

interface Profile extends Body {
  units: 'imperial' | 'metric';
}

const PROFILE_COLUMNS = `sex, age, height_cm AS "heightCm", weight_kg AS "weightKg", activity, units`;

/**
 * GET /api/profile  -> { profile: null } or { profile, recommendations }
 * PUT /api/profile  -> saves the profile; by default also sets daily goals from the recommendations
 */
export function profileRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { rows } = await db.query<Profile>(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = $1`, [
      userIdOf(req),
    ]);
    const profile = rows[0];
    res.json(profile ? { profile, recommendations: calculateDri(profile) } : { profile: null });
  });

  router.put('/', async (req, res) => {
    const { applyToGoals, ...input } = profileSchema.parse(req.body);
    const userId = userIdOf(req);
    const recommendations = calculateDri(input);

    const result = await db.transaction(async (tx) => {
      const { rows } = await tx.query<Profile>(
        `INSERT INTO profiles (user_id, sex, age, height_cm, weight_kg, activity, units)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           sex = EXCLUDED.sex, age = EXCLUDED.age, height_cm = EXCLUDED.height_cm,
           weight_kg = EXCLUDED.weight_kg, activity = EXCLUDED.activity, units = EXCLUDED.units,
           updated_at = now()
         RETURNING ${PROFILE_COLUMNS}`,
        [userId, input.sex, input.age, input.heightCm, input.weightKg, input.activity, input.units],
      );

      let goals: Goals | undefined;
      if (applyToGoals) {
        const g = recommendations.suggestedGoals;
        const updated = await tx.query<Goals>(
          `INSERT INTO goals (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             calories = EXCLUDED.calories, protein = EXCLUDED.protein,
             carbs = EXCLUDED.carbs, fat = EXCLUDED.fat, updated_at = now()
           RETURNING calories, protein, carbs, fat`,
          [userId, g.calories, g.protein, g.carbs, g.fat],
        );
        goals = updated.rows[0];
      }
      return { profile: rows[0], goals };
    });

    res.json({ ...result, recommendations });
  });

  return router;
}
