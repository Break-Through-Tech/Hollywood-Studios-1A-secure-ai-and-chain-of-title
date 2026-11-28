/**
 * Rewrite Wikimedia Special:FilePath URLs to the file they redirect to.
 *
 * Special:FilePath is a redirect endpoint, so every avatar costs the browser an
 * extra round trip (~250ms) before the image starts downloading. Resolving once
 * at write time and storing the final upload.wikimedia.org URL removes that hop.
 *
 *   node scripts/resolve-image-urls.mjs            # profiles + entities
 *   node scripts/resolve-image-urls.mjs --dry-run
 */
import { connect } from './_db.mjs';

const UA = 'HSI-Seed-Script/1.0 (https://hollywoodstudios.ai; contact: m@prowco.ai)';
const DRY_RUN = process.argv.includes('--dry-run');
const sql = connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Follows the redirect and returns the final URL, or null if it can't be resolved.
 *
 * Special:FilePath answers a throttled request with a status this endpoint also
 * uses for a genuinely dead file, so a bare `!res.ok -> null` silently reports
 * thousands of live images as unresolvable. Retry instead of concluding.
 */
async function resolve(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } });
    } catch {
      await sleep(1000 * (i + 1));
      continue;
    }
    if (res.ok) return res.url && res.url !== url ? res.url : null;
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 2000 * (i + 1)));
      continue;
    }
    return null;                                  // 404 after a clean response: really gone
  }
  return null;
}

async function run() {
  const profiles = await sql`
    SELECT id, display_name, avatar_url FROM profiles
    WHERE avatar_url LIKE '%Special:FilePath%' ORDER BY id`;
  const entities = await sql`
    SELECT id, title, image_url FROM entities
    WHERE image_url LIKE '%Special:FilePath%' ORDER BY id`;

  console.log(`${profiles.length} avatars and ${entities.length} posters to resolve${DRY_RUN ? ' — DRY RUN' : ''}\n`);

  let done = 0, failed = 0;

  for (const p of profiles) {
    const direct = await resolve(p.avatar_url);
    if (!direct) { failed++; console.log(`  ✗ ${p.display_name}`); continue; }
    if (!DRY_RUN) await sql`UPDATE profiles SET avatar_url = ${direct}, updated_at = NOW() WHERE id = ${p.id}`;
    done++;
    process.stdout.write(`\r  ${done}/${profiles.length} avatars`);
  }
  console.log();

  for (const e of entities) {
    const direct = await resolve(e.image_url);
    if (!direct) { failed++; continue; }
    if (!DRY_RUN) await sql`UPDATE entities SET image_url = ${direct}, updated_at = NOW() WHERE id = ${e.id}`;
    done++;
  }

  console.log(`\nResolved ${done}, failed ${failed}.`);
}

run().catch((err) => {
  console.error('Resolve failed:', err);
  process.exit(1);
});
