import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from '../../auth/_ensure-profile.js';
import { creditKey, validateNewCredits } from './_suggestions.js';

/**
 * POST /api/profile/credits/add  { email, credits: NewCredit[] }  →  { added, skipped }
 *
 * Appends credits the member confirmed on the import page. Unlike credits/save
 * (which replaces the whole list), this never deletes anything, and it skips
 * credits whose title + year are already on the profile.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'email is required' });

  const credits = validateNewCredits(req.body?.credits);
  if (typeof credits === 'string') return res.status(400).json({ error: credits });

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE LOWER(email) = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    const existing = await sql`SELECT title, year, sort_order FROM credits WHERE profile_id = ${profile.id}`;
    const seen = new Set(existing.map((c) => creditKey(String(c.title), c.year == null ? null : Number(c.year))));
    let sortOrder = Math.max(-1, ...existing.map((c) => Number(c.sort_order) || 0)) + 1;

    let added = 0;
    for (const c of credits) {
      const key = creditKey(c.title, c.year);
      if (seen.has(key)) continue;
      seen.add(key);
      await sql`
        INSERT INTO credits (profile_id, department, title, year, role, work_type, sort_order)
        VALUES (${profile.id}, ${c.department}, ${c.title}, ${c.year}, ${c.role}, ${c.workType}, ${sortOrder++})
      `;
      added++;
    }
    return res.status(200).json({ added, skipped: credits.length - added });
  } catch (err) {
    console.error('Credits add error:', err);
    return res.status(500).json({ error: 'Failed to add credits' });
  }
}
