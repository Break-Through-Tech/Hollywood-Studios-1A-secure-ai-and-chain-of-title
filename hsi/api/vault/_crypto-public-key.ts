import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUserCryptoKeysTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureUserCryptoKeysTable(sql);

  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const [keys] = await sql`
    SELECT public_key_jwk FROM user_crypto_keys WHERE email = ${email}
  `;
  if (!keys) return res.status(404).json({ error: 'User has no encryption keys' });
  return res.status(200).json({ publicKeyJwk: keys.public_key_jwk });
}
