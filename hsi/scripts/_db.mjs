import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `vercel link` writes a .env.local holding only VERCEL_OIDC_TOKEN, so prefer the
 * first file that actually defines DATABASE_URL over the first file that exists.
 */
export function envVar(name, { required = true } = {}) {
  const value = process.env[name] || ['.env.local', '.env']
    .map((f) => resolve(ROOT, f))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, ''))
    .find(Boolean);
  if (!value && required) throw new Error(`${name} not found in environment, .env.local or .env`);
  return value || null;
}

export function databaseUrl() {
  return envVar('DATABASE_URL');
}

export function connect() {
  return neon(databaseUrl());
}
