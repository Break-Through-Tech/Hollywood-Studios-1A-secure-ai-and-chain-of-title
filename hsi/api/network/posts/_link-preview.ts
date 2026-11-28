import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/**
 * Decode the HTML entities in an attribute value, exactly the way a browser's
 * parser would. Skipping this is what breaks embeds: LinkedIn (and anything
 * else serving signed CDN links) writes `og:image` as `...?e=1&amp;v=beta`,
 * and the literal `&amp;` makes the CDN reject the request with a 403.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function extractMeta(html: string, properties: string[]): string | null {
  for (const prop of properties) {
    const regex = new RegExp(
      `<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i'
    );
    const match = html.match(regex);
    const value = match?.[1] || match?.[2];
    if (value) return decodeEntities(value).trim();
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const value = match?.[1];
  return value ? decodeEntities(value).trim() || null : null;
}

/**
 * Turn an og:image value into an absolute http(s) URL. It may arrive relative
 * (`/card.png`) or protocol-relative (`//cdn/card.png`), and anything that is
 * not http(s) — `data:`, `javascript:` — has no business in an <img src>.
 */
export function resolveImageUrl(image: string | null, baseUrl: string): string | null {
  if (!image) return null;
  try {
    const resolved = new URL(image, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    return null;
  }
}

/** The markup the meta tags live in: the <head>, or a generous prefix if the page has no closing tag. */
export function previewSource(html: string): string {
  const headEnd = html.search(/<\/head\s*>/i);
  return headEnd === -1 ? html.slice(0, 200000) : html.slice(0, headEnd);
}

export function parseLinkPreview(html: string, url: string, fetchedFrom = url): LinkPreview | null {
  const head = previewSource(html);

  const title = extractMeta(head, ['og:title', 'twitter:title']) || extractTitle(head);
  const description = extractMeta(head, ['og:description', 'twitter:description', 'description']);
  const image = resolveImageUrl(extractMeta(head, ['og:image', 'twitter:image']), fetchedFrom);
  const siteName = extractMeta(head, ['og:site_name']);

  if (!title && !description && !image) return null;

  return { url, title, description, image, site_name: siteName };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HSIBot/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await res.text();
    // Relative og:image values resolve against the page we ended up on, which
    // is not the posted URL when the link is a shortener like lnkd.in.
    return parseLinkPreview(html, url, res.url || url);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const preview = await fetchLinkPreview(url);
  if (!preview) return res.status(200).json({ preview: null });

  return res.status(200).json({ preview });
}
