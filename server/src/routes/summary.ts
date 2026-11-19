import { Router } from 'express';
import { userIdOf } from '../auth.js';
import type { Db } from '../db.js';
import { rangeQuery } from '../validation.js';
import { getGoals } from './goals.js';

/**
 * GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Daily totals for every day in the range (days with no entries come back as zeros),
 * plus the user's goals so the client can chart progress in one request.
 */
export function summaryRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { from, to } = rangeQuery.parse(req.query);
    const userId = userIdOf(req);

    const [days, goals] = await Promise.all([
      db.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS date,
                COUNT(e.id)::int                                   AS "entryCount",
                COALESCE(SUM(e.calories), 0)::int                  AS calories,
                ROUND(COALESCE(SUM(e.protein), 0)::numeric, 1)::float8 AS protein,
                ROUND(COALESCE(SUM(e.carbs), 0)::numeric, 1)::float8   AS carbs,
                ROUND(COALESCE(SUM(e.fat), 0)::numeric, 1)::float8     AS fat
         FROM generate_series($2::date, $3::date, interval '1 day') AS day
         LEFT JOIN food_entries e ON e.user_id = $1 AND e.eaten_on = day::date
         GROUP BY day
         ORDER BY day`,
        [userId, from, to],
      ),
      getGoals(db, userId),
    ]);

    res.json({ goals, days: days.rows });
  });

  return router;
}
