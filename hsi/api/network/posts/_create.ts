import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchLinkPreview } from './_link-preview.js';

const MAX_TEXT_LENGTH = 2000;
const MAX_MEDIA_ITEMS = 4;
const ALLOWED_MEDIA_TYPES = ['image', 'video'];
const URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

interface MediaItem {
  url: string;
  type: string;
  mime_type: string;
  file_name: string;
  size: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, content, media } = req.body;

  if (!email) return res.status(400).json({ error: 'email is required' });

  const trimmedContent = content?.trim() || null;
  const mediaItems: MediaItem[] = Array.isArray(media) ? media : [];

  if (!trimmedContent && mediaItems.length === 0) {
    return res.status(400).json({ error: 'Post must have text or at least one media item' });
  }

  if (trimmedContent && trimmedContent.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Text must be ${MAX_TEXT_LENGTH} characters or fewer` });
  }

  if (mediaItems.length > MAX_MEDIA_ITEMS) {
    return res.status(400).json({ error: `Maximum ${MAX_MEDIA_ITEMS} media items per post` });
  }

  for (const item of mediaItems) {
    if (!item.url || !item.type || !item.mime_type) {
      return res.status(400).json({ error: 'Each media item must have url, type, and mime_type' });
    }
    const mediaType = item.type.split('/')[0] || item.type;
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: `Unsupported media type: ${item.type}` });
    }
  }

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    let linkPreview = null;
    if (trimmedContent) {
      const urls = trimmedContent.match(URL_REGEX);
      if (urls && urls.length > 0) {
        linkPreview = await fetchLinkPreview(urls[0]);
      }
    }

    const [post] = await sql`
      INSERT INTO posts (profile_id, content, media, link_preview)
      VALUES (${profile.id}, ${trimmedContent}, ${JSON.stringify(mediaItems)}, ${linkPreview ? JSON.stringify(linkPreview) : null})
      RETURNING *
    `;

    return res.status(201).json({ post });
  } catch (err) {
    console.error('Post create error:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
}
