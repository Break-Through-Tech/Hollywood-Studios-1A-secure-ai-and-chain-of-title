/**
 * Fill in missing movie posters from Wikipedia.
 *
 * Seeded rows carry their Wikidata id, so the exact English article is looked
 * up through the sitelink rather than guessed from the title — guessing misses
 * most foreign-language and long-tail films, which is the bulk of the catalogue.
 * Rows without a Wikidata id fall back to title candidates.
 *
 *   node scripts/fetch-posters.mjs
 *   node scripts/fetch-posters.mjs --limit=500
 */
import { connect } from './_db.mjs';
import { UA, sparql, qidOf, val } from './_wikidata.mjs';

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || null;
const CONCURRENCY = 5;   // Wikipedia throttles above this

const sql = connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikipedia's REST API throttles bursts. Without this, a 429 is indistinguishable
 * from "this film has no poster" and thousands of titles get silently skipped.
 */
async function summary(articleTitle, attempts = 4) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle.replace(/ /g, '_'))}`;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch {
      await sleep(1000 * (i + 1));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404) return null;                       // genuinely absent
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(retryAfter ? retryAfter * 1000 : 1500 * (i + 1));
      continue;
    }
    return null;
  }
  return null;
}

/** Lead image of a known article. Film articles carry the poster. */
async function imageFromArticle(articleTitle) {
  const d = await summary(articleTitle);
  if (!d || d.type === 'disambiguation') return null;
  return d.originalimage?.source || d.thumbnail?.source || null;
}

/** Fallback for rows with no Wikidata id: guess the article from the title. */
async function imageFromTitleGuess(title, year) {
  const candidates = [year ? `${title} (${year} film)` : null, `${title} (film)`, title, `${title} (movie)`].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const d = await summary(candidate);
      if (!d || d.type === 'disambiguation') continue;
      const text = `${d.description || ''} ${d.extract || ''}`.toLowerCase();
      const isFilm = /\bfilm\b|\bmovie\b|directed|starring/.test(text);
      if (!isFilm && candidate === title) continue;   // bare title is often a novel or album
      const img = d.originalimage?.source || d.thumbnail?.source;
      if (img) return img;
    } catch { continue; }
  }
  return null;
}

/** Resolve enwiki article titles for a batch of film QIDs. */
async function articlesFor(qids) {
  const rows = await sparql(`
    SELECT ?f (SAMPLE(?art) AS ?article) WHERE {
      VALUES ?f { ${qids.map((q) => `wd:${q}`).join(' ')} }
      OPTIONAL { ?art schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> }
    } GROUP BY ?f`);
  const out = {};
  for (const r of rows) {
    const url = val(r, 'article');
    if (url) out[qidOf(val(r, 'f'))] = decodeURIComponent(url.split('/wiki/')[1] || '');
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

async function run() {
  const all = await sql`
    SELECT id, title, year, metadata->>'wikidata_id' AS wikidata_id
    FROM entities WHERE type = 'movie' AND image_url IS NULL
    ORDER BY year DESC NULLS LAST`;
  const targets = LIMIT ? all.slice(0, LIMIT) : all;
  console.log(`${targets.length} movies without posters\n`);

  // Resolve article titles up front, 200 ids per query.
  console.log('Resolving Wikipedia articles...');
  const articles = {};
  const withQid = targets.filter((t) => t.wikidata_id);
  for (let i = 0; i < withQid.length; i += 200) {
    Object.assign(articles, await articlesFor(withQid.slice(i, i + 200).map((t) => t.wikidata_id)));
    process.stdout.write(`\r  ${Math.min(i + 200, withQid.length)}/${withQid.length}`);
  }
  console.log(`\n  ${Object.keys(articles).length} articles found\n`);

  let found = 0, missed = 0, done = 0;
  await mapLimit(targets, CONCURRENCY, async (e) => {
    const article = e.wikidata_id ? articles[e.wikidata_id] : null;
    const url = article ? await imageFromArticle(article) : await imageFromTitleGuess(e.title, e.year);
    if (url) {
      await sql`UPDATE entities SET image_url = ${url}, updated_at = NOW() WHERE id = ${e.id}`;
      found++;
    } else missed++;
    if (++done % 100 === 0 || done === targets.length) {
      process.stdout.write(`\r  ${done}/${targets.length} — ${found} found, ${missed} missed`);
    }
  });

  console.log(`\n\nDone: ${found} posters set, ${missed} without a usable image.`);
}

run().catch((err) => { console.error('Poster fetch failed:', err); process.exit(1); });
