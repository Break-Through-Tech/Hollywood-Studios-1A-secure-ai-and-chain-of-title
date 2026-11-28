/**
 * Verify seeded directory pages actually render on the deployed site.
 *
 * The database having a row is not proof the page works: an API change, a
 * clipped layout or a dropped department can leave a profile that exists but
 * renders empty. This fetches every directory profile through the live API and
 * checks the fields the page depends on, then samples movie pages and search.
 *
 *   node scripts/verify-live.mjs
 *   node scripts/verify-live.mjs --base=http://localhost:3111
 *   node scripts/verify-live.mjs --sample=50      # spot-check instead of all
 */
import { connect } from './_db.mjs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('--base='))?.split('=')[1] || 'https://hsi-theta.vercel.app';
const SAMPLE = Number(args.find((a) => a.startsWith('--sample='))?.split('=')[1]) || null;
const CONCURRENCY = 10;

const sql = connect();

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function run() {
  console.log(`Verifying against ${BASE}\n`);
  const failures = [];

  // ── profiles ─────────────────────────────────────────────────────
  let people = await sql`
    SELECT p.handle, p.display_name, p.avatar_url, p.bio, p.headline,
           COUNT(c.id)::int AS credits
    FROM profiles p LEFT JOIN credits c ON c.profile_id = p.id
    WHERE p.is_directory = TRUE
    GROUP BY p.id ORDER BY p.display_name`;
  if (SAMPLE) people = people.filter((_, i) => i % Math.ceil(people.length / SAMPLE) === 0);

  console.log(`Profile pages: ${people.length}`);
  let done = 0, ok = 0;
  await mapLimit(people, CONCURRENCY, async (p) => {
    try {
      const d = await post('/api/profile/get', { handle: p.handle });
      const prof = d.profile;
      const bad = [];
      if (!prof) bad.push('no profile');
      else {
        if (!prof.is_directory) bad.push('not flagged directory');
        if (!prof.headline) bad.push('no headline');
        if (!prof.bio) bad.push('no bio');
        if (p.avatar_url && !prof.avatar_url) bad.push('avatar lost');
        if ((d.credits || []).length !== p.credits) bad.push(`credits ${(d.credits || []).length}≠${p.credits}`);
        // A credit with no department would be dropped by the page's grouping.
        if ((d.credits || []).some((c) => !c.department)) bad.push('credit missing department');
      }
      if (bad.length) failures.push(`profile ${p.handle}: ${bad.join(', ')}`);
      else ok++;
    } catch (e) { failures.push(`profile ${p.handle}: ${e.message}`); }
    if (++done % 100 === 0 || done === people.length) process.stdout.write(`\r  ${done}/${people.length}`);
  });
  console.log(`\n  OK ${ok}/${people.length}\n`);

  // ── movie pages ──────────────────────────────────────────────────
  const films = await sql`
    SELECT e.slug, e.title, COUNT(c.id)::int AS cast_size
    FROM entities e JOIN credits c ON c.entity_id = e.id
    GROUP BY e.id ORDER BY COUNT(c.id) DESC LIMIT 40`;
  console.log(`Movie pages: ${films.length} busiest`);
  let filmOk = 0;
  await mapLimit(films, CONCURRENCY, async (f) => {
    try {
      const d = await post('/api/entity/get', { slug: f.slug });
      if (!d.entity) failures.push(`movie ${f.slug}: no entity`);
      else if ((d.castCrew || []).length !== f.cast_size) failures.push(`movie ${f.title}: cast ${(d.castCrew || []).length}≠${f.cast_size}`);
      else filmOk++;
    } catch (e) { failures.push(`movie ${f.slug}: ${e.message}`); }
  });
  console.log(`  OK ${filmOk}/${films.length}\n`);

  // ── search ───────────────────────────────────────────────────────
  const probes = people.slice(0, 60);
  console.log(`Search: ${probes.length} probes`);
  let searchOk = 0;
  await mapLimit(probes, CONCURRENCY, async (p) => {
    const term = p.display_name.split(' ').pop();
    try {
      const d = await post('/api/search/query', { query: term });
      if ((d.profiles || []).some((r) => r.handle === p.handle)) searchOk++;
      else failures.push(`search "${term}" did not return ${p.handle}`);
    } catch (e) { failures.push(`search ${term}: ${e.message}`); }
  });
  console.log(`  OK ${searchOk}/${probes.length}\n`);

  // ── directory walled off from the member surface ─────────────────
  const [member] = await sql`SELECT email FROM profiles WHERE NOT is_directory AND email NOT LIKE '%invalid%' ORDER BY id LIMIT 1`;
  if (member) {
    const d = await post('/api/people/list', { email: member.email });
    const handles = new Set(people.map((p) => p.handle));
    const leaks = (d.people || []).filter((p) => handles.has(p.handle));
    console.log(`People list: ${(d.people || []).length} members, ${leaks.length} directory leaks`);
    if (leaks.length) failures.push(`${leaks.length} directory profiles leaked into People`);
  }

  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILURES:`}`);
  failures.slice(0, 25).forEach((f) => console.log('  ✗ ' + f));
  if (failures.length > 25) console.log(`  ... and ${failures.length - 25} more`);
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => { console.error('Verification failed:', err); process.exit(1); });
