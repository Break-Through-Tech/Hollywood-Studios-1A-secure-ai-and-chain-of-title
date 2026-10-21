/**
 * Check every stored image URL actually serves an image, and optionally repair.
 *
 * A URL sitting in the database is not proof the browser can render it: files
 * get renamed or deleted on Commons, redirects break, and a stored link can
 * return HTML or a 404 page. This walks avatars and posters, reports what is
 * broken, and with --fix either resolves a working replacement or clears the
 * column so the UI falls back to its placeholder instead of a broken image.
 *
 *   node scripts/verify-images.mjs             # report only
 *   node scripts/verify-images.mjs --fix       # repair or clear broken URLs
 *   node scripts/verify-images.mjs --avatars   # limit to profile photos
 *   node scripts/verify-images.mjs --posters   # limit to movie posters
 */
import { connect } from './_db.mjs';
import { UA } from './_wikidata.mjs';

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const ONLY_AVATARS = args.includes('--avatars');
const ONLY_POSTERS = args.includes('--posters');
const CONCURRENCY = 6;   // Wikimedia throttles above this

const sql = connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HEAD first (cheap); some hosts reject HEAD, so fall back to a ranged GET.
 *
 * Returns one of three verdicts, never a bare boolean:
 *   ok       - definitely serves an image
 *   missing  - definitely gone (404/410), safe to clear
 *   unknown  - throttled, timed out or otherwise inconclusive
 *
 * The distinction matters because --fix is destructive. Wikimedia throttles
 * bursts, and treating a 429 as "broken" once wiped hundreds of valid photos.
 * Anything inconclusive is left strictly alone.
 */
async function checkImage(url) {
  const attempt = async (method, headers = {}) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA, ...headers }, signal: ctl.signal });
      return { status: res.status, type: res.headers.get('content-type') || '', retryAfter: Number(res.headers.get('retry-after')) || 0 };
    } catch (e) {
      return { status: 0, type: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
    } finally { clearTimeout(timer); }
  };

  for (let i = 0; i < 4; i++) {
    let r = await attempt('HEAD');
    if (r.status === 405 || r.status === 403) r = await attempt('GET', { Range: 'bytes=0-1023' });

    if (r.status >= 200 && r.status < 300) {
      return r.type.startsWith('image/')
        ? { verdict: 'ok', ...r }
        : { verdict: 'missing', ...r };            // 200 but HTML: a redirect landed on an error page
    }
    if (r.status === 404 || r.status === 410) return { verdict: 'missing', ...r };
    if (r.status === 429 || r.status >= 500 || r.status === 0) {
      await sleep(r.retryAfter ? r.retryAfter * 1000 : 1500 * (i + 1));
      continue;                                    // throttled or flaky — retry, never conclude
    }
    return { verdict: 'unknown', ...r };
  }
  return { verdict: 'unknown', status: 0, type: '', error: 'exhausted retries' };
}

/** Ask Commons for a working thumbnail of the same file. */
async function repairCommons(url) {
  const file = decodeURIComponent((url.split('/').pop() || '').split('?')[0]);
  if (!file) return null;
  try {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*`;
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const pages = (await res.json()).query?.pages || {};
    for (const p of Object.values(pages)) {
      const info = p.imageinfo?.[0];
      const candidate = info?.thumburl || info?.url;
      if (candidate && (await checkImage(candidate)).verdict === 'ok') return candidate;
    }
  } catch { /* fall through */ }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function auditSet({ label, rows, urlKey, table, column }) {
  console.log(`\n${label}: ${rows.length} to check`);
  let done = 0, broken = 0, repaired = 0, cleared = 0;

  const results = await mapLimit(rows, CONCURRENCY, async (row) => {
    const check = await checkImage(row[urlKey]);
    if (++done % 100 === 0 || done === rows.length) process.stdout.write(`\r  checked ${done}/${rows.length}`);
    return { row, check };
  });

  const bad = results.filter((r) => r.check.verdict === 'missing');
  const unknown = results.filter((r) => r.check.verdict === 'unknown');
  broken = bad.length;
  console.log(`\n  OK ${results.filter((r) => r.check.verdict === 'ok').length} · missing ${broken} · inconclusive ${unknown.length} (left untouched)`);

  // A run that can't reach the host tells us nothing; refuse to "repair" from it.
  if (FIX && broken > rows.length * 0.5) {
    console.log(`  REFUSING TO FIX: ${broken}/${rows.length} reported missing, which looks like an outage or throttling rather than genuinely dead links.`);
    return { broken, repaired: 0, cleared: 0 };
  }

  if (broken && FIX) {
    console.log('  repairing...');
    await mapLimit(bad, CONCURRENCY, async ({ row }) => {
      const fixed = await repairCommons(row[urlKey]);
      if (fixed) {
        await sql.query(`UPDATE ${table} SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [fixed, row.id]);
        repaired++;
      } else {
        await sql.query(`UPDATE ${table} SET ${column} = NULL, updated_at = NOW() WHERE id = $1`, [row.id]);
        cleared++;
      }
    });
    console.log(`  repaired ${repaired} · cleared ${cleared} (cleared rows fall back to the UI placeholder)`);
  } else if (broken) {
    bad.slice(0, 10).forEach(({ row, check }) =>
      console.log(`    ✗ ${(row.display_name || row.title || row.id).toString().slice(0, 40).padEnd(42)} ${check.status || check.error} ${check.type}`));
    if (broken > 10) console.log(`    ... and ${broken - 10} more`);
  }
  return { broken, repaired, cleared };
}

async function run() {
  console.log(`Image audit${FIX ? ' (--fix)' : ' (report only)'}`);
  const totals = { broken: 0, repaired: 0, cleared: 0 };

  if (!ONLY_POSTERS) {
    const rows = await sql`SELECT id, display_name, avatar_url FROM profiles WHERE avatar_url IS NOT NULL ORDER BY id`;
    const r = await auditSet({ label: 'Profile photos', rows, urlKey: 'avatar_url', table: 'profiles', column: 'avatar_url' });
    totals.broken += r.broken; totals.repaired += r.repaired; totals.cleared += r.cleared;
  }
  if (!ONLY_AVATARS) {
    const rows = await sql`SELECT id, title, image_url FROM entities WHERE image_url IS NOT NULL ORDER BY id`;
    const r = await auditSet({ label: 'Movie posters', rows, urlKey: 'image_url', table: 'entities', column: 'image_url' });
    totals.broken += r.broken; totals.repaired += r.repaired; totals.cleared += r.cleared;
  }

  console.log(`\nTotal broken ${totals.broken}` + (FIX ? ` · repaired ${totals.repaired} · cleared ${totals.cleared}` : ''));
  if (totals.broken && !FIX) console.log('Re-run with --fix to repair or clear them.');
}

run().catch((err) => { console.error('\nImage audit failed:', err); process.exit(1); });
