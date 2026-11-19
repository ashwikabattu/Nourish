import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import { credentialsSchema } from './validation.js';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const TOKEN_TTL = '7d';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

/** Stored as `scrypt$<salt hex>$<hash hex>` so the format can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compared against when the email doesn't exist, so a login takes about the
// same time either way and doesn't reveal which emails have accounts.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

interface UserRow {
  id: number;
  email: string;
}

export function authRouter(db: Db, jwtSecret: string): Router {
  const router = Router();
  const issueToken = (user: UserRow) =>
    jwt.sign({ sub: String(user.id) }, jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_TTL });

  router.post('/register', async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const passwordHash = await hashPassword(password);

    const user = await db.transaction(async (tx) => {
      const { rows } = await tx.query<UserRow>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email`,
        [email, passwordHash],
      );
      const created = rows[0];
      if (!created) throw new HttpError(409, 'An account with that email already exists');
      await tx.query('INSERT INTO goals (user_id) VALUES ($1)', [created.id]);
      return created;
    });

    res.status(201).json({ token: issueToken(user), user });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const { rows } = await db.query<UserRow & { password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
    if (!row || !ok) throw new HttpError(401, 'Invalid email or password');

    const user = { id: row.id, email: row.email };
    res.json({ token: issueToken(user), user });
  });

  router.get('/me', requireAuth(jwtSecret), async (req, res) => {
    const { rows } = await db.query<UserRow>('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) throw new HttpError(401, 'Account no longer exists');
    res.json({ user: rows[0] });
  });

  return router;
}

export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Sign in required');

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      const userId = typeof payload === 'object' ? Number(payload.sub) : NaN;
      if (!Number.isInteger(userId)) throw new Error('bad subject');
      req.userId = userId;
    } catch {
      throw new HttpError(401, 'Session expired, please sign in again');
    }
    next();
  };
}

/** For handlers mounted behind requireAuth. */
export function userIdOf(req: Express.Request): number {
  if (req.userId === undefined) throw new HttpError(401, 'Sign in required');
  return req.userId;
}
