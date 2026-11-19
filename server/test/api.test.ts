import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPgliteDb, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';

let db: Db;
let app: ReturnType<typeof createApp>;
let userCounter = 0;

beforeAll(async () => {
  db = await createPgliteDb(); // fresh in-memory Postgres
  await migrate(db);
  app = createApp({ db, jwtSecret: 'test-secret', authRateLimit: 1000 });
});

afterAll(() => db.close());

async function signUp() {
  const email = `user${++userCounter}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' }).expect(201);
  return { email, token: res.body.token as string, auth: { Authorization: `Bearer ${res.body.token}` } };
}

const oatmeal = { name: 'Oatmeal', meal: 'breakfast', calories: 300, protein: 10, carbs: 54, fat: 5, date: '2026-11-16' };

describe('health and routing', () => {
  it('reports healthy when the database responds', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it('keeps a strict CSP without forcing assets onto HTTPS', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    await request(app).get('/api/nope').expect(404, { error: 'Not found' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });
});

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });
});

describe('auth', () => {
  it('registers, logs in, and returns the current user', async () => {
    const { email, auth } = await signUp();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(200);
    expect(login.body.token).toEqual(expect.any(String));

    const me = await request(app).get('/api/auth/me').set(auth).expect(200);
    expect(me.body.user.email).toBe(email);
  });

  it('normalizes email case and whitespace', async () => {
    await request(app).post('/api/auth/register').send({ email: '  Mixed@Example.COM ', password: 'password123' }).expect(201);
    await request(app).post('/api/auth/login').send({ email: 'mixed@example.com', password: 'password123' }).expect(200);
  });

  it('rejects duplicate emails', async () => {
    const { email } = await signUp();
    await request(app).post('/api/auth/register').send({ email, password: 'password123' }).expect(409);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const { email } = await signUp();
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrongpassword' }).expect(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('validates credentials', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'password']);
  });

  it('requires a valid token on protected routes', async () => {
    await request(app).get('/api/entries?date=2026-11-16').expect(401);
    await request(app).get('/api/entries?date=2026-11-16').set('Authorization', 'Bearer garbage').expect(401);
  });
});

describe('entries', () => {
  it('creates and lists entries for a given day only', async () => {
    const { auth } = await signUp();
    const created = await request(app).post('/api/entries').set(auth).send(oatmeal).expect(201);
    expect(created.body.entry).toMatchObject({ ...oatmeal, id: expect.any(Number) });

    await request(app).post('/api/entries').set(auth).send({ ...oatmeal, date: '2026-11-15' }).expect(201);

    const list = await request(app).get('/api/entries?date=2026-11-16').set(auth).expect(200);
    expect(list.body.entries).toHaveLength(1);
    expect(list.body.entries[0].date).toBe('2026-11-16');
  });

  it('defaults macros to zero', async () => {
    const { auth } = await signUp();
    const res = await request(app)
      .post('/api/entries')
      .set(auth)
      .send({ name: 'Apple', meal: 'snack', calories: 95, date: '2026-11-16' })
      .expect(201);
    expect(res.body.entry).toMatchObject({ protein: 0, carbs: 0, fat: 0 });
  });

  it('validates entries', async () => {
    const { auth } = await signUp();
    const res = await request(app)
      .post('/api/entries')
      .set(auth)
      .send({ ...oatmeal, name: '', calories: -5, meal: 'brunch', date: '2026-02-30' })
      .expect(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['calories', 'date', 'meal', 'name']);
  });

  it('updates part of an entry', async () => {
    const { auth } = await signUp();
    const { body } = await request(app).post('/api/entries').set(auth).send(oatmeal).expect(201);
    const res = await request(app)
      .patch(`/api/entries/${body.entry.id}`)
      .set(auth)
      .send({ calories: 350, date: '2026-11-17' })
      .expect(200);
    expect(res.body.entry).toMatchObject({ ...oatmeal, calories: 350, date: '2026-11-17' });
  });

  it('rejects an empty patch', async () => {
    const { auth } = await signUp();
    const { body } = await request(app).post('/api/entries').set(auth).send(oatmeal).expect(201);
    await request(app).patch(`/api/entries/${body.entry.id}`).set(auth).send({}).expect(400);
  });

  it('deletes an entry', async () => {
    const { auth } = await signUp();
    const { body } = await request(app).post('/api/entries').set(auth).send(oatmeal).expect(201);
    await request(app).delete(`/api/entries/${body.entry.id}`).set(auth).expect(204);
    await request(app).delete(`/api/entries/${body.entry.id}`).set(auth).expect(404);
  });

  it("does not let one user read, edit, or delete another user's entries", async () => {
    const alice = await signUp();
    const bob = await signUp();
    const { body } = await request(app).post('/api/entries').set(alice.auth).send(oatmeal).expect(201);
    const id = body.entry.id;

    const bobList = await request(app).get('/api/entries?date=2026-11-16').set(bob.auth).expect(200);
    expect(bobList.body.entries).toEqual([]);
    await request(app).patch(`/api/entries/${id}`).set(bob.auth).send({ calories: 1 }).expect(404);
    await request(app).delete(`/api/entries/${id}`).set(bob.auth).expect(404);

    const aliceList = await request(app).get('/api/entries?date=2026-11-16').set(alice.auth).expect(200);
    expect(aliceList.body.entries[0].calories).toBe(300);
  });
});

describe('goals', () => {
  it('starts with defaults and can be updated', async () => {
    const { auth } = await signUp();
    const initial = await request(app).get('/api/goals').set(auth).expect(200);
    expect(initial.body.goals).toEqual({ calories: 2000, protein: 100, carbs: 250, fat: 65 });

    const next = { calories: 2200, protein: 140, carbs: 220, fat: 70 };
    await request(app).put('/api/goals').set(auth).send(next).expect(200, { goals: next });
    await request(app).get('/api/goals').set(auth).expect(200, { goals: next });
  });

  it('validates goals', async () => {
    const { auth } = await signUp();
    await request(app).put('/api/goals').set(auth).send({ calories: 100, protein: 1, carbs: 1, fat: 1 }).expect(400);
  });
});

describe('profile', () => {
  const me = { sex: 'female', age: 21, heightCm: 149.86, weightKg: 40.37, activity: 'low_active', units: 'imperial' };

  it('is empty until set up', async () => {
    const { auth } = await signUp();
    await request(app).get('/api/profile').set(auth).expect(200, { profile: null });
  });

  it('saves the profile, returns recommendations, and updates goals', async () => {
    const { auth } = await signUp();
    const res = await request(app).put('/api/profile').set(auth).send(me).expect(200);
    expect(res.body.profile).toEqual(me);
    expect(res.body.recommendations.calories).toBe(1908);
    expect(res.body.goals).toEqual({ calories: 1908, protein: 32, carbs: 263, fat: 58 });

    const goals = await request(app).get('/api/goals').set(auth).expect(200);
    expect(goals.body.goals).toEqual(res.body.goals);

    const again = await request(app).get('/api/profile').set(auth).expect(200);
    expect(again.body.profile).toEqual(me);
    expect(again.body.recommendations.macros.protein).toBe(32);
  });

  it('can leave goals untouched', async () => {
    const { auth } = await signUp();
    const res = await request(app).put('/api/profile').set(auth).send({ ...me, applyToGoals: false }).expect(200);
    expect(res.body.goals).toBeUndefined();
    const goals = await request(app).get('/api/goals').set(auth).expect(200);
    expect(goals.body.goals.calories).toBe(2000);
  });

  it('updates an existing profile', async () => {
    const { auth } = await signUp();
    await request(app).put('/api/profile').set(auth).send(me).expect(200);
    const res = await request(app).put('/api/profile').set(auth).send({ ...me, activity: 'very_active' }).expect(200);
    expect(res.body.profile.activity).toBe('very_active');
    expect(res.body.recommendations.calories).toBeGreaterThan(1908);
  });

  it('validates the profile', async () => {
    const { auth } = await signUp();
    const res = await request(app)
      .put('/api/profile')
      .set(auth)
      .send({ sex: 'other', age: 15, heightCm: 20, weightKg: 1000, activity: 'couch' })
      .expect(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'activity',
      'age',
      'heightCm',
      'sex',
      'weightKg',
    ]);
  });
});

describe('summary', () => {
  it('returns a row for every day, with zeros for days without entries', async () => {
    const { auth } = await signUp();
    await request(app).post('/api/entries').set(auth).send(oatmeal).expect(201);
    await request(app)
      .post('/api/entries')
      .set(auth)
      .send({ name: 'Chicken salad', meal: 'lunch', calories: 450, protein: 35.3, carbs: 12.1, fat: 22.2, date: '2026-11-16' })
      .expect(201);

    const res = await request(app).get('/api/summary?from=2026-11-14&to=2026-11-16').set(auth).expect(200);
    expect(res.body.goals.calories).toBe(2000);
    expect(res.body.days).toEqual([
      { date: '2026-11-14', entryCount: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-11-15', entryCount: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-11-16', entryCount: 2, calories: 750, protein: 45.3, carbs: 66.1, fat: 27.2 },
    ]);
  });

  it('rejects backwards or oversized ranges', async () => {
    const { auth } = await signUp();
    await request(app).get('/api/summary?from=2026-11-16&to=2026-11-10').set(auth).expect(400);
    await request(app).get('/api/summary?from=2024-01-01&to=2026-01-01').set(auth).expect(400);
  });
});
