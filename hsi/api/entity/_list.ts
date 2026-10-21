import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { type, page = 1, limit = 20 } = req.body;

  if (!type) return res.status(400).json({ error: 'type is required' });

  try {
    const offset = (page - 1) * limit;
    const entities = await sql`SELECT * FROM entities WHERE type = ${type} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM entities WHERE type = ${type}`;
    return res.status(200).json({ entities, total: count });
  } catch (err) {
    console.error('Entity list error:', err);
    return res.status(500).json({ error: 'Failed to list entities' });
  }
}
