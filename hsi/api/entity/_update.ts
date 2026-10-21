import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id, title, year, genre, description, metadata, imageData, fileName } = req.body;

  if (!email || !id) return res.status(400).json({ error: 'email and id are required' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    const [entity] = await sql`SELECT * FROM entities WHERE id = ${id}`;
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    if (entity.type === 'company') return res.status(400).json({ error: 'Use entity/company-save for companies' });

    if (entity.created_by !== profile.id && email !== 'admin@hollywoodstudios.ai') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    let imageUrl = entity.image_url;
    if (imageData && fileName) {
      const matches = imageData.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        const buffer = Buffer.from(matches[2], 'base64');
        const blob = await put(`entities/${fileName}`, buffer, { access: 'private', contentType: matches[1] });
        imageUrl = blob.url;
      }
    }

    const [updated] = await sql`
      UPDATE entities SET
        title = ${title || entity.title},
        year = ${year !== undefined ? year : entity.year},
        image_url = ${imageUrl},
        genre = ${genre || entity.genre},
        description = ${description !== undefined ? description : entity.description},
        metadata = ${JSON.stringify(metadata || entity.metadata)},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;

    return res.status(200).json({ entity: updated });
  } catch (err) {
    console.error('Entity update error:', err);
    return res.status(500).json({ error: 'Failed to update entity' });
  }
}
