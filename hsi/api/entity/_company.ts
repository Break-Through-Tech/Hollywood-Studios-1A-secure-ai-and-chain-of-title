import { put } from '@vercel/blob';

/**
 * Company page fields: the allowed values and the one parser that turns a
 * request body into a row. The labels live client-side in
 * src/components/company/fields.ts — keep the keys here and there in step.
 */

export const CATEGORIES = [
  'studio', 'production', 'talent-agency', 'management', 'distribution', 'streaming',
  'post-production', 'vfx-animation', 'record-label', 'music-publishing', 'casting',
  'finance', 'marketing-pr', 'legal', 'festivals-events', 'equipment-stages',
  'games-interactive', 'education', 'other',
] as const;

export const ORGANIZATION_TYPES = [
  'private', 'public', 'self-employed', 'partnership', 'nonprofit', 'government', 'educational',
] as const;

export const COMPANY_SIZES = [
  '1', '2-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+',
] as const;

export const SOCIAL_KEYS = ['linkedin', 'instagram', 'x', 'youtube', 'tiktok', 'facebook', 'vimeo', 'imdb'] as const;

/** Slugs the client routes claim for itself under /company/. */
const RESERVED_SLUGS = new Set(['new', 'edit']);

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface CompanyInput {
  name: string;
  tagline: string | null;
  about: string | null;
  category: string | null;
  organizationType: string | null;
  companySize: string | null;
  foundedYear: number | null;
  foundedMonth: number | null;
  headquarters: string | null;
  website: string | null;
  contactEmail: string | null;
  phone: string | null;
  specialties: string[];
  socialLinks: Record<string, string>;
  notableEntityIds: number[];
}

type Parsed = { ok: true; value: CompanyInput } | { ok: false; error: string };

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : null;
}

function longText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return (allowed as readonly string[]).includes(value as string) ? (value as T[number]) : undefined;
}

/** An http(s) URL, with the scheme added when someone types "example.com". */
export function normalizeUrl(value: unknown): string | null | undefined {
  const raw = text(value, 500);
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!url.hostname.includes('.')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseCompanyInput(body: Record<string, unknown>): Parsed {
  const name = text(body.name, 120);
  if (!name) return { ok: false, error: 'name is required' };

  const category = oneOf(body.category, CATEGORIES);
  if (category === undefined) return { ok: false, error: 'invalid category' };
  const organizationType = oneOf(body.organizationType, ORGANIZATION_TYPES);
  if (organizationType === undefined) return { ok: false, error: 'invalid organizationType' };
  const companySize = oneOf(body.companySize, COMPANY_SIZES);
  if (companySize === undefined) return { ok: false, error: 'invalid companySize' };

  const thisYear = new Date().getUTCFullYear();
  let foundedYear: number | null = null;
  if (body.foundedYear !== undefined && body.foundedYear !== null && body.foundedYear !== '') {
    foundedYear = Number(body.foundedYear);
    if (!Number.isInteger(foundedYear) || foundedYear < 1800 || foundedYear > thisYear) {
      return { ok: false, error: 'invalid foundedYear' };
    }
  }
  let foundedMonth: number | null = null;
  if (body.foundedMonth !== undefined && body.foundedMonth !== null && body.foundedMonth !== '') {
    foundedMonth = Number(body.foundedMonth);
    if (!Number.isInteger(foundedMonth) || foundedMonth < 1 || foundedMonth > 12) {
      return { ok: false, error: 'invalid foundedMonth' };
    }
    if (foundedYear === null) return { ok: false, error: 'foundedMonth needs foundedYear' };
  }

  const website = normalizeUrl(body.website);
  if (website === undefined) return { ok: false, error: 'invalid website' };

  const contactEmail = text(body.contactEmail, 200)?.toLowerCase() ?? null;
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, error: 'invalid contactEmail' };
  }

  const phone = text(body.phone, 40);
  if (phone && !/^[+()\d\s.-]{5,40}$/.test(phone)) return { ok: false, error: 'invalid phone' };

  const specialties: string[] = [];
  if (Array.isArray(body.specialties)) {
    const seen = new Set<string>();
    for (const item of body.specialties) {
      const s = text(item, 40);
      if (!s || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      specialties.push(s);
      if (specialties.length === 20) break;
    }
  }

  const socialLinks: Record<string, string> = {};
  if (body.socialLinks && typeof body.socialLinks === 'object') {
    const links = body.socialLinks as Record<string, unknown>;
    for (const key of SOCIAL_KEYS) {
      const url = normalizeUrl(links[key]);
      if (url === undefined) return { ok: false, error: `invalid ${key} link` };
      if (url) socialLinks[key] = url;
    }
  }

  const notableEntityIds: number[] = [];
  if (Array.isArray(body.notableEntityIds)) {
    for (const id of body.notableEntityIds) {
      const n = Number(id);
      if (Number.isInteger(n) && n > 0 && !notableEntityIds.includes(n)) notableEntityIds.push(n);
      if (notableEntityIds.length === 12) break;
    }
  }

  return {
    ok: true,
    value: {
      name,
      tagline: text(body.tagline, 160),
      about: longText(body.about, 5000),
      category,
      organizationType,
      companySize,
      foundedYear,
      foundedMonth,
      headquarters: text(body.headquarters, 120),
      website,
      contactEmail,
      phone,
      specialties,
      socialLinks,
      notableEntityIds,
    },
  };
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * A readable slug for a new company ("hollywood-studios", then
 * "hollywood-studios-2"). Entity slugs share one namespace across types, so
 * this checks every entity, not just companies.
 */
export async function uniqueCompanySlug(sql: Sql, name: string): Promise<string> {
  let base = slugify(name) || 'company';
  if (RESERVED_SLUGS.has(base)) base = `${base}-company`;
  const taken = new Set(
    (await sql`SELECT slug FROM entities WHERE slug = ${base} OR slug LIKE ${`${base}-%`}`).map(r => String(r.slug)),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * Stores an uploaded image. `undefined` means the field was not sent (keep
 * what is there); `null` means clear it.
 */
export async function storeImage(data: unknown, folder: string): Promise<{ url: string | null } | { error: string } | undefined> {
  if (data === undefined) return undefined;
  if (data === null || data === '') return { url: null };
  if (typeof data !== 'string') return { error: 'invalid image' };
  const m = data.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return { error: 'images must be PNG, JPEG, WebP or GIF' };
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) return { error: 'image is too large' };
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  const blob = await put(`${folder}/${Date.now()}.${ext}`, buffer, {
    access: 'private', contentType: m[1], addRandomSuffix: true,
  });
  return { url: blob.url };
}
