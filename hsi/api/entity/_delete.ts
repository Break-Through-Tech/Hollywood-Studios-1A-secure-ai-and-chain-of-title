import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id } = req.body;

  if (!email || !id) return res.status(400).json({ error: 'email and id are required' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    const [entity] = await sql`SELECT created_by FROM entities WHERE id = ${id}`;
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    if (entity.created_by !== profile.id && email !== 'admin@hollywoodstudios.ai') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await sql`DELETE FROM entities WHERE id = ${id}`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Entity delete error:', err);
    return res.status(500).json({ error: 'Failed to delete entity' });
  }
}
