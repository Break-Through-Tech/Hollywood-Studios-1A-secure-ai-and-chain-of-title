import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveVaultAccess, readScriptContent, bytesToText } from './_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { slug, email, fileData } = req.body;

  try {
    if (typeof fileData === 'string') {
      const match = fileData.match(/^data:[^;,]+;base64,(.+)$/);
      if (!match) return res.status(400).json({ error: 'fileData must be a base64 data URL' });
      // copy out of the shared Buffer pool — pdf.js reads the raw ArrayBuffer
      const text = await bytesToText(new Uint8Array(Buffer.from(match[1], 'base64')));
      return res.status(200).json({ text });
    }

    if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });

    const sql = neon(process.env.DATABASE_URL!);
    const access = await resolveVaultAccess(sql, slug, email);
    if (!access) return res.status(404).json({ error: 'Not found' });
    if (access.item.is_encrypted) {
      return res.status(400).json({ error: 'Cannot extract text from encrypted items' });
    }

    const text = await readScriptContent(access.item);
    return res.status(200).json({ text });
  } catch (err) {
    console.error('Vault extract-text error:', err);
    return res.status(500).json({ error: 'Failed to extract text' });
  }
}
