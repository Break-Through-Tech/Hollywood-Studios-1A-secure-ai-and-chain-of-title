/**
 * Verify the link previews stored on posts are actually renderable.
 *
 * A row holding a preview is not proof the embed works. The og:image value on
 * the page is HTML-encoded, so an extractor that forgets to decode entities
 * stores `...?e=1&amp;v=beta`; signed CDN links (LinkedIn's media.licdn.com,
 * among others) answer that literal `&amp;` with a 403 and the card renders a
 * grey band instead of an image. This checks every stored preview for
 * undecoded entities and unusable image URLs, then fetches each image to
 * confirm it really loads.
 *
 *   node scripts/verify-link-previews.mjs
 *   node scripts/verify-link-previews.mjs --repair
 *   node scripts/verify-link-previews.mjs --repair --base=http://localhost:3111
 *
 * --repair re-resolves each failing preview through the deployed
 * /api/network/posts/link-preview endpoint and writes the result back, so the
 * repair runs through exactly the code path that creates previews. Point
 * --base at a deployment that carries the fix you are repairing with.
 */
import { connect } from './_db.mjs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('--base='))?.split('=')[1] || 'https://hsi-theta.vercel.app';
const REPAIR = args.includes('--repair');
const CONCURRENCY = 6;

const sql = connect();

// Anything still entity-encoded after extraction is an extractor bug, not content.
const ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function imageLoads(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    // Some CDNs reject HEAD outright; a ranged GET costs one byte.
    const res = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
    clearTimeout(timeout);
    if (!res.ok) return `HTTP ${res.status}`;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return `content-type ${type || 'missing'}`;
    return null;
  } catch (err) {
    return err.name === 'AbortError' ? 'timed out' : err.message;
  }
}

/** Everything wrong with one stored preview, as a list of human-readable reasons. */
async function inspect(preview) {
  const problems = [];

  for (const field of ['title', 'description', 'site_name']) {
    if (preview[field] && ENTITY.test(preview[field])) problems.push(`${field} holds an undecoded HTML entity`);
  }

  if (preview.image) {
    if (ENTITY.test(preview.image)) problems.push('image URL holds an undecoded HTML entity');
    let absolute = null;
    try {
      absolute = new URL(preview.image);
    } catch {
      problems.push('image URL is not absolute');
    }
    if (absolute && absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      problems.push(`image URL uses ${absolute.protocol}`);
    }
    if (absolute && problems.length === 0) {
      const failure = await imageLoads(preview.image);
      if (failure) problems.push(`image does not load (${failure})`);
    }
  }

  if (!preview.title && !preview.description && !preview.image) problems.push('preview is empty');

  return problems;
}

async function reResolve(url) {
  const res = await fetch(`${BASE}/api/network/posts/link-preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`link-preview API returned HTTP ${res.status}`);
  const { preview } = await res.json();
  return preview || null;
}

async function run() {
  const posts = await sql`
    SELECT id, link_preview FROM posts
    WHERE link_preview IS NOT NULL ORDER BY created_at DESC`;

  console.log(`Checking ${posts.length} stored link preview${posts.length === 1 ? '' : 's'}\n`);

  const results = await mapLimit(posts, CONCURRENCY, async (post) => ({
    post, problems: await inspect(post.link_preview),
  }));

  const broken = results.filter((r) => r.problems.length > 0);

  for (const { post, problems } of broken) {
    console.log(`post ${post.id}  ${post.link_preview.url}`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
  }

  if (broken.length === 0) {
    console.log(`All ${posts.length} previews are renderable.`);
    return 0;
  }

  console.log(`\n${broken.length} of ${posts.length} previews are broken.`);

  if (!REPAIR) {
    console.log('Re-run with --repair to re-resolve them through the live API.');
    return 1;
  }

  console.log(`\nRepairing via ${BASE} …`);
  let repaired = 0;
  for (const { post } of broken) {
    try {
      const preview = await reResolve(post.link_preview.url);
      if (!preview) { console.log(`  post ${post.id}: source page no longer returns a preview, left as is`); continue; }
      const problems = await inspect(preview);
      if (problems.length > 0) {
        console.log(`  post ${post.id}: re-resolved preview is still broken (${problems.join('; ')}), left as is`);
        continue;
      }
      await sql`UPDATE posts SET link_preview = ${JSON.stringify(preview)} WHERE id = ${post.id}`;
      console.log(`  post ${post.id}: repaired`);
      repaired++;
    } catch (err) {
      console.log(`  post ${post.id}: ${err.message}`);
    }
  }

  console.log(`\nRepaired ${repaired} of ${broken.length}.`);
  return repaired === broken.length ? 0 : 1;
}

run().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1); });
