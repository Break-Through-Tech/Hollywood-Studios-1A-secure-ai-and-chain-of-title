import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import type { VercelRequest } from '@vercel/node';

const ITERATIONS = 600000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(passcode, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [iterStr, salt, hash] = stored.split(':');
  const iterations = parseInt(iterStr, 10);
  if (!salt || !hash || !Number.isFinite(iterations)) return false;
  const candidate = pbkdf2Sync(passcode, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashAgreement(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashViewerCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export interface LinkGateRow {
  is_active?: boolean;
  is_encrypted?: boolean;
  expires_at?: string | Date | null;
  max_visits?: number | null;
  visit_count?: number | null;
}

export function checkLinkAvailability(link: LinkGateRow): { status: number; error: string } | null {
  if (!link.is_active) return { status: 410, error: 'This link has been deactivated' };
  if (link.is_encrypted) return { status: 410, error: 'This project is no longer available via link' };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { status: 410, error: 'This link has expired' };
  }
  if (link.max_visits != null && link.max_visits > 0 && (link.visit_count || 0) >= link.max_visits) {
    return { status: 410, error: 'This link has reached its view limit' };
  }
  return null;
}

export function emailAllowed(email: string, allowed: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const normalized = email.trim().toLowerCase();
  return allowed.some(entry => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('@')) return normalized.endsWith(rule);
    return normalized === rule;
  });
}

export function extractGeo(req: VercelRequest): { country: string | null; city: string | null; region: string | null } {
  const header = (name: string) => {
    const value = req.headers[name];
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
  };
  return {
    country: header('x-vercel-ip-country'),
    city: header('x-vercel-ip-city'),
    region: header('x-vercel-ip-country-region'),
  };
}

export function extractIp(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (!raw) return null;
  return raw.split(',')[0].trim() || null;
}

// static column list for owner-facing link queries — never exposes passcode_hash
export const LINK_SELECT_FIELDS = `id, token, label, require_email, is_active, created_at,
  expires_at, max_visits, visit_count, allowed_emails, allow_download,
  notify_on_view, nda_text, watermark_enabled, verify_email, (passcode_hash IS NOT NULL) AS has_passcode`;

export function sanitizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e): e is string => typeof e === 'string')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.includes('@'))
    .slice(0, 100);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
