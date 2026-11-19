# Nourish

A full-stack nutrition tracker. Enter your age, sex, height, weight, and activity level to get personalized calorie, macronutrient, vitamin, and mineral targets, then log meals against them and track a 7-day trend.

**Stack:** React + Vite · Node.js + Express 5 API in TypeScript · PostgreSQL · Docker · AWS Elastic Beanstalk + RDS · GitHub Actions CI

**Live:** https://d2i5ip6halh9za.cloudfront.net

## Features

- Email/password accounts. Passwords are hashed with scrypt; sessions use signed JWTs (HS256, 7-day expiry); auth endpoints are rate-limited per IP
- **Personalized Dietary Reference Intakes:** 2023 National Academies energy equations, macronutrient ranges, and RDA/AI and upper limits for 14 vitamins and 15 minerals, matching the USDA DRI Calculator. Can set your daily goals automatically
- **Food search** backed by the USDA FoodData Central database (~400k foods): pick a result and a serving size ("1 banana", "1 container", grams) and calories and macros fill in automatically; every value stays editable
- Log foods by meal with calories, protein, carbs, and fat
- Daily totals with progress bars against goals you can edit
- 7-day calorie chart built from one SQL query (`generate_series` + `LEFT JOIN` so days with no entries still show up)
- Each user can only read or change their own data, and integration tests check this

## Architecture

```
browser ──HTTPS──> CloudFront ──> Elastic Beanstalk (Docker)
                                    └─ Express app
                                        ├─ /api/*  REST API (TypeScript)
                                        └─ /*      built React app
                                            │
                                            └──TLS──> RDS PostgreSQL
```

The frontend and API ship as **one Docker image**, so production is a single service and needs no CORS setup.

```
server/                 TypeScript API
  src/app.ts            Express app: middleware, routes, static hosting
  src/auth.ts           register / login / me, password hashing, JWT middleware
  src/foods.ts          USDA FoodData Central client: search, normalization, caching
  src/dri.ts            DRI calculator (pure functions, unit-tested against USDA output)
  src/routes/           entries (CRUD), goals, summary, profile, foods
  src/validation.ts     Zod schemas for every request body and query
  src/migrate.ts        versioned SQL migrations (advisory-locked, transactional)
  src/db.ts             Postgres pool (production) or embedded PGlite (dev/tests)
  test/                 46 tests: API integration (real Postgres engine), DRI calculator, food search
src/                    React frontend
Dockerfile              multi-stage build -> 200 MB runtime image, runs as non-root
docker-compose.yml      production image + Postgres 17, locally
DEPLOY.md               step-by-step AWS deployment
```

## API

All routes except auth and health need an `Authorization: Bearer <token>` header.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account → `{ token, user }` |
| `POST` | `/api/auth/login` | Sign in → `{ token, user }` |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/entries?date=YYYY-MM-DD` | Entries for one day |
| `POST` | `/api/entries` | Add an entry |
| `PATCH` | `/api/entries/:id` | Update any fields of an entry |
| `DELETE` | `/api/entries/:id` | Delete an entry |
| `GET` / `PUT` | `/api/goals` | Read / set daily goals |
| `GET` | `/api/profile` | Saved profile plus calculated recommendations (or `{ profile: null }`) |
| `PUT` | `/api/profile` | Save sex, age, height, weight, activity → recommendations; also sets goals unless `applyToGoals: false` |
| `GET` | `/api/foods/search?q=…` | Search USDA foods → name, brand, nutrients per 100 g/ml, and portions |
| `GET` | `/api/summary?from=…&to=…` | Daily totals for a date range (max 366 days) plus goals |
| `GET` | `/api/health` | Load-balancer health check (also pings the database) |

Validation errors return `400` with `{ error, details: [{ path, message }] }`.

## Running locally

Requires Node.js 22+.

```bash
npm run setup        # install frontend + API dependencies
npm run dev:api      # terminal 1: API on :3000 (embedded Postgres in server/.data, no setup needed)
npm run dev          # terminal 2: frontend on :5173, proxies /api to :3000
```

To use a real Postgres instead, set `DATABASE_URL`. For food search, set `FDC_API_KEY` to a free key from https://fdc.nal.usda.gov/api-key-signup; without one the shared `DEMO_KEY` allows only about 10 searches an hour. See `server/.env.example`.

Run the production image against Postgres 17:

```bash
docker compose up --build     # http://localhost:8080
```

## Testing

```bash
npm test             # API, DRI calculator, and food search tests
npm run lint         # frontend lint
```

The tests run against [PGlite](https://pglite.dev), which is real Postgres compiled to WebAssembly, so no database server or mocks are needed. CI runs type-checking, tests, lint, both builds, and a Docker build on every push.

## Deploying

See [DEPLOY.md](DEPLOY.md).
