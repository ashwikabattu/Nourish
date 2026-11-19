import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createPgliteDb, type Db } from '../src/db.js';
import { createFdcClient, normalizeFood, tidyCase } from '../src/foods.js';
import { migrate } from '../src/migrate.js';

// Trimmed copies of real FoodData Central search results.
const nutrients = (kcal: number | null, protein: number, fat: number, carbs: number, energyId = 1008) => [
  ...(kcal == null ? [] : [{ nutrientId: energyId, unitName: 'KCAL', value: kcal }]),
  { nutrientId: 1003, unitName: 'G', value: protein },
  { nutrientId: 1004, unitName: 'G', value: fat },
  { nutrientId: 1005, unitName: 'G', value: carbs },
];

const bananaRaw = {
  fdcId: 2709224,
  description: 'Banana, raw',
  dataType: 'Survey (FNDDS)',
  foodNutrients: nutrients(97, 0.74, 0.28, 22.71),
  foodMeasures: [
    { disseminationText: '1 cup, mashed', gramWeight: 225 },
    { disseminationText: '1 banana', gramWeight: 126 },
    { disseminationText: 'Quantity not specified', gramWeight: 126 },
  ],
};
const chickenLunchmeat = {
  fdcId: 2514747,
  description: 'Lunchmeat, chicken breast, sliced',
  dataType: 'Foundation',
  foodNutrients: nutrients(100, 16.4, 2.46, 3.1, 2047), // Foundation foods may only have Atwater energy
  foodMeasures: [],
};
const brandedYogurt = {
  fdcId: 2012128,
  description: 'GREEK YOGURT, PLAIN',
  dataType: 'Branded',
  brandOwner: 'SOME DAIRY CO.',
  servingSize: 170,
  servingSizeUnit: 'GRM',
  householdServingFullText: '1 CONTAINER',
  foodNutrients: nutrients(59, 10.2, 0.4, 3.6),
};
const brandedMilk = {
  fdcId: 3000001,
  description: 'Oat Milk',
  dataType: 'Branded',
  brandName: 'Oaty',
  servingSize: 240,
  servingSizeUnit: 'ml',
  householdServingFullText: '1 cup',
  foodNutrients: nutrients(50, 1, 2.1, 6.7),
};

function fakeFdc(byType: { generic?: unknown[]; branded?: unknown[]; status?: number }) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (byType.status) return new Response('nope', { status: byType.status });
    const body = JSON.parse(String(init?.body));
    const foods = body.dataType.includes('Branded') ? byType.branded ?? [] : byType.generic ?? [];
    return Response.json({ foods });
  });
}

describe('normalizeFood', () => {
  it('extracts per-100 g macros and portions from survey foods', () => {
    expect(normalizeFood(bananaRaw)).toEqual({
      fdcId: 2709224,
      name: 'Banana, raw',
      brand: null,
      source: 'generic',
      baseUnit: 'g',
      per100: { calories: 97, protein: 0.7, carbs: 22.7, fat: 0.3 },
      portions: [
        { label: '1 cup, mashed (225 g)', amount: 225 },
        { label: '1 banana (126 g)', amount: 126 },
        { label: 'typical serving (126 g)', amount: 126 },
      ],
    });
  });

  it('falls back to Atwater energy when kcal is missing', () => {
    expect(normalizeFood(chickenLunchmeat)?.per100.calories).toBe(100);
  });

  it('estimates calories from macros when no energy value exists', () => {
    const food = { ...chickenLunchmeat, foodNutrients: nutrients(null, 10, 5, 20) };
    expect(normalizeFood(food)?.per100.calories).toBe(10 * 4 + 20 * 4 + 5 * 9);
  });

  it('uses the label serving for branded foods and tidies upper-case names', () => {
    const r = normalizeFood(brandedYogurt);
    expect(r).toMatchObject({
      name: 'Greek Yogurt, Plain',
      brand: 'Some Dairy Co.',
      source: 'branded',
      baseUnit: 'g',
      portions: [{ label: 'serving (1 container, 170 g)', amount: 170 }],
    });
  });

  it('keeps liquids in ml', () => {
    expect(normalizeFood(brandedMilk)).toMatchObject({
      baseUnit: 'ml',
      brand: 'Oaty',
      portions: [{ label: 'serving (1 cup, 240 ml)', amount: 240 }],
    });
  });

  it('skips foods with no usable nutrition', () => {
    expect(normalizeFood({ fdcId: 1, description: 'Mystery', dataType: 'Branded', foodNutrients: [] })).toBeNull();
  });
});

describe('tidyCase', () => {
  it('title-cases shouting text and leaves normal text alone', () => {
    expect(tidyCase('PEANUT BUTTER (CREAMY)')).toBe('Peanut Butter (Creamy)');
    expect(tidyCase('Banana, raw')).toBe('Banana, raw');
  });
});

describe('createFdcClient', () => {
  it('lists generic foods before branded ones and removes duplicates', async () => {
    const fetch = fakeFdc({ generic: [bananaRaw, chickenLunchmeat], branded: [brandedYogurt, bananaRaw] });
    const client = createFdcClient({ apiKey: 'k', fetch });
    const results = await client.search('banana');
    expect(results.map((r) => r.fdcId)).toEqual([2709224, 2514747, 2012128]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches results by normalized query', async () => {
    const fetch = fakeFdc({ generic: [bananaRaw] });
    const client = createFdcClient({ apiKey: 'k', fetch });
    await client.search('Banana');
    await client.search('  banana ');
    expect(fetch).toHaveBeenCalledTimes(2); // one search = generic + branded requests
  });

  it('still returns generic results if the branded request fails', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      String(init?.body).includes('Branded') ? new Response('err', { status: 500 }) : Response.json({ foods: [bananaRaw] }),
    );
    const results = await createFdcClient({ apiKey: 'k', fetch }).search('banana');
    expect(results).toHaveLength(1);
  });

  it('reports rate limiting', async () => {
    const client = createFdcClient({ apiKey: 'k', fetch: fakeFdc({ status: 429 }) });
    await expect(client.search('banana')).rejects.toMatchObject({ rateLimited: true });
  });
});

describe('GET /api/foods/search', () => {
  let db: Db;
  let token: string;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    const setup = createApp({ db, jwtSecret: 'test-secret' });
    const res = await request(setup).post('/api/auth/register').send({ email: 'foods@example.com', password: 'password123' });
    token = res.body.token;
  });
  afterAll(() => db.close());

  const appWith = (fetch: ReturnType<typeof fakeFdc>) =>
    createApp({ db, jwtSecret: 'test-secret', foodSearch: createFdcClient({ apiKey: 'k', fetch }) });

  it('returns normalized foods', async () => {
    const res = await request(appWith(fakeFdc({ generic: [bananaRaw] })))
      .get('/api/foods/search?q=banana')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.foods[0]).toMatchObject({ name: 'Banana, raw', per100: { calories: 97 } });
  });

  it('requires sign-in and a real query', async () => {
    const app = appWith(fakeFdc({}));
    await request(app).get('/api/foods/search?q=banana').expect(401);
    await request(app).get('/api/foods/search?q=b').set('Authorization', `Bearer ${token}`).expect(400);
  });

  it('turns upstream failures into a friendly error', async () => {
    const res = await request(appWith(fakeFdc({ status: 500 })))
      .get('/api/foods/search?q=banana')
      .set('Authorization', `Bearer ${token}`)
      .expect(502);
    expect(res.body.error).toMatch(/enter nutrition yourself/);
  });
});
