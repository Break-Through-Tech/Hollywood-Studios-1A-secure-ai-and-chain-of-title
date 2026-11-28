import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, pbkdf2Sync } from 'crypto';

const ITERATIONS = 600000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.includes(':')) {
    return password === stored;
  }
  const [iterStr, salt, hash] = stored.split(':');
  const iterations = parseInt(iterStr, 10);
  const candidate = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
  return candidate === hash;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  try {
    const hashed = hashPassword(password);
    await sql`
      INSERT INTO user_settings (email, password_hash)
      VALUES (${email}, ${hashed})
      ON CONFLICT (email) DO UPDATE SET password_hash = ${hashed}, updated_at = NOW()
    `;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Settings password error:', err);
    return res.status(500).json({ error: 'Failed to update password' });
  }
}
