import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const {
    firstName, lastName, email, phone,
    roles, headline, background,
    genres, formats, focusAreas, interests, connections,
    whyJoin, useCases, useCaseDetail,
    referred, hasIP, understandsCurated, agreesStandards, wantsUpdates,
    additionalInfo,
  } = req.body;

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  try {
    const existing = await sql`SELECT id, status FROM applications WHERE email = ${email}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An application with this email already exists', status: existing[0].status });
    }

    await sql`
      INSERT INTO applications (
        first_name, last_name, email, phone,
        roles, headline, background,
        genres, formats, focus_areas, interests, connections,
        why_join, use_cases, use_case_detail,
        referred, has_ip, understands_curated, agrees_standards, wants_updates,
        additional_info
      ) VALUES (
        ${firstName}, ${lastName}, ${email}, ${phone || null},
        ${roles || []}, ${headline || null}, ${background || null},
        ${genres || []}, ${formats || []}, ${focusAreas || []}, ${interests || []}, ${connections || []},
        ${whyJoin || null}, ${useCases || []}, ${useCaseDetail || null},
        ${referred || false}, ${hasIP || false}, ${understandsCurated || false}, ${agreesStandards || false}, ${wantsUpdates || false},
        ${additionalInfo || null}
      )
    `;

    return res.status(201).json({ success: true });
  } catch (err: unknown) {
    console.error('Application submission error:', err);
    return res.status(500).json({ error: 'Failed to submit application' });
  }
}
