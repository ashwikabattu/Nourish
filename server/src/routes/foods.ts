import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { FoodSearchError, type FoodSearch } from '../foods.js';

const searchQuery = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100, 'Search is too long'),
});

/** GET /api/foods/search?q=banana -> { foods: FoodResult[] } */
export function foodsRouter(foodSearch: FoodSearch | undefined): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    const { q } = searchQuery.parse(req.query);
    if (!foodSearch) throw new HttpError(503, 'Food search is not configured on this server');

    try {
      res.json({ foods: await foodSearch.search(q) });
    } catch (err) {
      if (!(err instanceof FoodSearchError)) throw err;
      console.error(JSON.stringify({ level: 'warn', msg: 'food search failed', error: err.message }));
      throw new HttpError(
        err.rateLimited ? 503 : 502,
        err.rateLimited
          ? 'Food search is busy right now. Try again in a little while, or enter nutrition yourself.'
          : 'Food search is unavailable right now. You can still enter nutrition yourself.',
      );
    }
  });

  return router;
}
