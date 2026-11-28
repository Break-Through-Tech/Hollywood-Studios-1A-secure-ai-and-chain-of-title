import type { IncomingMessage } from 'http';

const SAFE_HOST_RE = /^[a-z0-9][a-z0-9.-]*(:\d+)?$/i;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw.split(',')[0].trim() : undefined;
}

/**
 * Resolves the app's public origin from the incoming request, so links in
 * emails always point at whatever domain the user is actually on
 * (production, preview deploys, localhost). Host values are validated
 * before being embedded in email HTML.
 */
export function getBaseUrl(req: Pick<IncomingMessage, 'headers'>): string {
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  if (host && SAFE_HOST_RE.test(host)) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.');
    const proto = first(req.headers['x-forwarded-proto']) || (isLocal ? 'http' : 'https');
    if (proto === 'http' || proto === 'https') return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return 'https://hollywoodstudios.ai';
}
