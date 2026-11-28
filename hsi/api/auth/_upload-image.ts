import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageData, fileName } = req.body;
  if (!imageData || !fileName) return res.status(400).json({ error: 'imageData and fileName are required' });

  try {
    const matches = imageData.match(/^data:(.+?);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image data' });

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const blob = await put(fileName, buffer, { access: 'private', contentType });
    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Image upload error:', err);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
}
