import { randomBytes } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

const SESSION_DAYS = 30;

export async function ensureSessionsTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)`;
}

export async function createSession(sql: Sql, email: string): Promise<string> {
  await ensureSessionsTable(sql);
  const token = randomBytes(32).toString('hex');
  await sql`
    INSERT INTO user_sessions (token, email, expires_at)
    VALUES (${token}, ${email.trim().toLowerCase()}, NOW() + make_interval(days => ${SESSION_DAYS}))
  `;
  return token;
}

export function extractBearerToken(req: VercelRequest): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/);
  return m ? m[1] : null;
}

/** Returns the session's email, or null when no valid session accompanies the request. */
export async function getSessionEmail(sql: Sql, req: VercelRequest): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    await ensureSessionsTable(sql);
    const [row] = await sql`
      SELECT email FROM user_sessions WHERE token = ${token} AND expires_at > NOW()
    `;
    return row ? String(row.email) : null;
  } catch {
    return null;
  }
}

/** True when the request carries a valid session for the claimed email. */
export async function matchesSession(sql: Sql, req: VercelRequest, claimedEmail: unknown): Promise<boolean> {
  if (typeof claimedEmail !== 'string' || !claimedEmail.trim()) return false;
  const sessionEmail = await getSessionEmail(sql, req);
  return !!sessionEmail && sessionEmail === claimedEmail.trim().toLowerCase();
}

/**
 * The email a request claims to act as. Handlers take it from the body
 * (`email` or `ownerEmail`) or, for GETs, the query string.
 */
export function claimedEmail(req: VercelRequest): unknown {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  return body.ownerEmail ?? body.email ?? req.query.email;
}

/**
 * Router gate: a request that names a member must carry that member's
 * session. Requests with no claim (public reads) pass through untouched.
 * Returns false after writing the 401, so callers can `if (!await ...) return`.
 */
export async function guardClaimedSession(sql: Sql, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const claim = claimedEmail(req);
  if (claim === undefined || claim === null || claim === '') return true;
  if (await matchesSession(sql, req, claim)) return true;
  res.status(401).json({ error: 'invalid_session' });
  return false;
}

/** Router gate for routes that need some signed-in member, whoever they are. */
export async function guardAnySession(sql: Sql, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (await getSessionEmail(sql, req)) return true;
  res.status(401).json({ error: 'invalid_session' });
  return false;
}

export async function deleteSession(sql: Sql, req: VercelRequest) {
  const token = extractBearerToken(req);
  if (!token) return;
  try {
    await ensureSessionsTable(sql);
    await sql`DELETE FROM user_sessions WHERE token = ${token}`;
  } catch { /* best effort */ }
}
