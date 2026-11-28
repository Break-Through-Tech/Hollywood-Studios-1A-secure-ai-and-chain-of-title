/**
 * Rebuild directory profile photos from the seed caches.
 *
 * avatar_url is derived data — the Wikidata P18 file for each person — so it can
 * always be reconstructed from the cached detail responses without re-querying.
 * Used to recover after a bad repair pass cleared valid URLs.
 *
 *   node scripts/restore-avatars.mjs --dry-run
 *   node scripts/restore-avatars.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect } from './_db.mjs';
import { commonsUrl } from './_wikidata.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const CACHES = ['seed-people-cache.local.json', 'seed-actors-cache.local.json'];

const sql = connect();

/**
 * qid -> photo URL, merged across every seed cache present. Prefers the
 * Wikidata P18 file; falls back to the cached Wikipedia lead image, which is
 * what the seed itself used when a person had no P18.
 */
function imagesFromCaches() {
  const images = {};
  for (const name of CACHES) {
    const path = resolve(ROOT, name);
    if (!existsSync(path)) { console.log(`  (no ${name})`); continue; }
    const cache = JSON.parse(readFileSync(path, 'utf8'));
    let p18 = 0, thumbs = 0;
    for (const [key, value] of Object.entries(cache)) {
      if (!key.startsWith('details:') || !value || typeof value !== 'object') continue;
      for (const [qid, detail] of Object.entries(value)) {
        if (images[qid]) continue;
        if (detail?.image) { images[qid] = commonsUrl(detail.image); p18++; continue; }
        const title = detail?.article ? decodeURIComponent(detail.article.split('/wiki/')[1] || '') : null;
        const thumb = title && cache[`summary:${title}`]?.thumbnail;
        if (thumb) { images[qid] = thumb; thumbs++; }
      }
    }
    console.log(`  ${name}: ${p18} from Wikidata, ${thumbs} from Wikipedia lead image`);
  }
  return images;
}

async function run() {
  console.log(`Restoring profile photos${DRY_RUN ? ' — DRY RUN' : ''}\n`);
  const images = imagesFromCaches();
  console.log(`  ${Object.keys(images).length} photos available across caches\n`);

  const missing = await sql`
    SELECT id, handle, display_name, source_url
    FROM profiles
    WHERE is_directory = TRUE AND avatar_url IS NULL AND source_url IS NOT NULL`;
  console.log(`${missing.length} directory profiles without a photo`);

  let restored = 0, unavailable = 0;
  for (const p of missing) {
    const qid = p.source_url.match(/\/(Q\d+)$/)?.[1];
    const file = qid && images[qid];
    if (!file) { unavailable++; continue; }
    if (!DRY_RUN) {
      await sql`UPDATE profiles SET avatar_url = ${file}, updated_at = NOW() WHERE id = ${p.id}`;
    }
    restored++;
  }

  console.log(`  restored ${restored}, no cached photo for ${unavailable}`);
  if (!DRY_RUN) {
    const [after] = await sql`SELECT COUNT(*)::int n, COUNT(avatar_url)::int img FROM profiles WHERE is_directory`;
    console.log(`\nprofile photos now: ${after.img}/${after.n}`);
  }
}

run().catch((err) => { console.error('Restore failed:', err); process.exit(1); });
