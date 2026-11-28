import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from '../../auth/_ensure-profile.js';
import { toSuggestions, type ResearchResponse } from './_suggestions.js';

/** Maps agent errors to messages a member can act on; details go to the server log. */
function publicError(message: string): [number, string] {
  if (/API_KEY is not set/.test(message)) return [503, 'Credit search is not set up on this server yet.'];
  if (/free tier|credits|payment|402|429|rate limit/i.test(message)) {
    return [503, 'Credit search is busy or out of credits. Please try again later.'];
  }
  return [502, 'The search did not finish. Please try again.'];
}

/**
 * POST /api/profile/credits/research  { email, name, hint? }  →  ResearchResponse
 *
 * Runs the credit research agent (agent_call_folder/) and returns its credits as
 * suggestions. Saves nothing: the member confirms on the review page, then the
 * page calls credits/add. The router checks the session for `email`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = normalizeEmail(req.body?.email);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim().slice(0, 200) : '';

  if (!email) return res.status(400).json({ error: 'email is required' });
  if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Enter your name (2–120 characters).' });

  try {
    // Loaded on demand so the agent's dependencies never slow down other profile routes.
    const { researchPerson } = await import('../../../../agent_call_folder/agentapicall.js');

    const sql = neon(process.env.DATABASE_URL!);
    const [profile] = await sql`SELECT id FROM profiles WHERE LOWER(email) = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    let result;
    try {
      result = await researchPerson(name, hint || undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Credit research agent error:', message);
      const [status, error] = publicError(message);
      return res.status(status).json({ error });
    }

    const existing = await sql`SELECT title, year FROM credits WHERE profile_id = ${profile.id}`;
    const body: ResearchResponse = toSuggestions(
      result,
      existing.map((c) => ({ title: String(c.title), year: c.year == null ? null : Number(c.year) })),
    );
    return res.status(200).json(body);
  } catch (err) {
    console.error('Credit research error:', err);
    return res.status(500).json({ error: 'Credit search failed. Please try again.' });
  }
}
