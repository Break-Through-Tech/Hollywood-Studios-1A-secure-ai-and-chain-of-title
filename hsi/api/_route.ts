import type { VercelRequest } from '@vercel/node';

function toRoutePath(value: unknown) {
  const raw = Array.isArray(value) ? value.join('/') : typeof value === 'string' ? value : '';
  return raw.replace(/^\/+|\/+$/g, '');
}

function decodeRoutePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveRouteAction(req: VercelRequest, basePath: string) {
  const fromQuery = toRoutePath(req.query.path ?? req.query['...path']);
  if (fromQuery) return fromQuery;

  const pathname = new URL(req.url || '/', 'https://hsi.local').pathname;
  const prefix = `/api/${basePath}/`;
  if (!pathname.startsWith(prefix)) return '';

  return toRoutePath(decodeRoutePath(pathname.slice(prefix.length)));
}
