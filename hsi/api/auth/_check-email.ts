import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from './_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const rows = await sql`SELECT status FROM applications WHERE LOWER(email) = ${email}`;

    if (rows.length === 0) {
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({ exists: true, status: rows[0].status });
  } catch (err: unknown) {
    console.error('Email check error:', err);
    return res.status(500).json({ error: 'Failed to check email' });
  }
}
