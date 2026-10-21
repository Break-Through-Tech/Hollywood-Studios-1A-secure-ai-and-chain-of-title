import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, type, title, year, genre, description, metadata, imageData, fileName } = req.body;

  if (!email || !type || !title) return res.status(400).json({ error: 'email, type, and title are required' });
  // Companies carry details and an owner that this generic path does not set.
  if (type === 'company') return res.status(400).json({ error: 'Use entity/company-save for companies' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    let imageUrl = null;
    if (imageData && fileName) {
      const matches = imageData.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        const buffer = Buffer.from(matches[2], 'base64');
        const blob = await put(`entities/${fileName}`, buffer, { access: 'private', contentType: matches[1] });
        imageUrl = blob.url;
      }
    }

    const slug = generateSlug();

    const [entity] = await sql`
      INSERT INTO entities (type, title, slug, year, image_url, genre, description, metadata, created_by)
      VALUES (${type}, ${title}, ${slug}, ${year || null}, ${imageUrl}, ${genre || []}, ${description || null}, ${JSON.stringify(metadata || {})}, ${profile.id})
      RETURNING *
    `;

    return res.status(201).json({ entity });
  } catch (err) {
    console.error('Entity create error:', err);
    return res.status(500).json({ error: 'Failed to create entity' });
  }
}
