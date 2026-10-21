/**
 * Seed directory profiles for notable entertainment-industry people.
 *
 * Generalises the original actor seed across professions: each role is
 * discovered through the Wikidata property that actually links it to a film
 * (cast member, director, producer, …), so credits reflect real work rather
 * than incidental association.
 *
 * No people data is committed to the repo — everything is fetched at run time
 * and written straight to Neon. Responses cache to a gitignored file.
 *
 *   node scripts/seed-people.mjs                     # 500 people, all roles
 *   node scripts/seed-people.mjs --total=50          # smaller run
 *   node scripts/seed-people.mjs --roles=director    # one role only
 *   node scripts/seed-people.mjs --dry-run
 *   node scripts/seed-people.mjs --refresh           # ignore cache
 *   node scripts/seed-people.mjs --recent            # newest credits, not best-known
 *   node scripts/seed-people.mjs --min-sitelinks=30  # lower the notability floor
 *
 * Seeded profiles are marked is_directory = TRUE: they render read-only with a
 * reference badge and are excluded from People and connection requests.
 */
import { connect } from './_db.mjs';
import {
  initCache, flushCache, discoverPeople, fetchDetails, fetchFilmography, fetchSummary,
  fetchImageCredits, commonsUrl, slugify, randomSlug, cleanGenre, deriveSkills, titleCase,
} from './_wikidata.mjs';

const args = process.argv.slice(2);
const num = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const str = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || null;
const TOTAL = num('total', 500);
const FILMS_PER_PERSON = num('films', 20);
// Over-fetch multiplier for discovery pools. Raise it once a lot of people are
// already seeded: exclusions come off the top of the pool, so the default 3x
// can run dry on later passes.
const POOL_FACTOR = num('pool', 3);
// Notability/practice floors default to the per-role values in ROLES; override
// them to reach further down the list once the notable tier is already seeded.
const MIN_SITELINKS = num('min-sitelinks', null);
const MIN_FILMS = num('min-films', null);
// Credit ordering when a filmography is longer than --films: newest first, or
// most-linked first (the default).
const RECENT = args.includes('--recent');
const DRY_RUN = args.includes('--dry-run');
const REFRESH = args.includes('--refresh');
const ONLY_ROLES = str('roles')?.split(',').map((s) => s.trim());

/**
 * occupation : Wikidata occupation QID used to find practitioners
 * filmProp   : property linking a film to this role (the credit itself)
 * share      : portion of TOTAL to fill from this role
 * minSitelinks: notability floor — below-the-line crafts are less famous, so lower
 * minFilms   : real-practice floor, keeps out one-off/incidental credits
 */
const ROLES = [
  { key: 'actor',          label: 'Acting',          occupation: 'Q10800557', filmProp: 'P161',  share: 0.30, minSitelinks: 45, minFilms: 12, department: 'Acting',          roleName: null,             skill: 'Acting' },
  { key: 'director',       label: 'Directing',       occupation: 'Q2526255',  filmProp: 'P57',   share: 0.22, minSitelinks: 40, minFilms: 10, department: 'Directing',       roleName: 'Director',       skill: 'Directing' },
  { key: 'producer',       label: 'Producing',       occupation: 'Q3282637',  filmProp: 'P162',  share: 0.16, minSitelinks: 40, minFilms: 10, department: 'Producing',       roleName: 'Producer',       skill: 'Producing' },
  { key: 'writer',         label: 'Writing',         occupation: 'Q28389',    filmProp: 'P58',   share: 0.14, minSitelinks: 40, minFilms: 10, department: 'Writing',         roleName: 'Screenwriter',   skill: 'Screenwriting' },
  { key: 'composer',       label: 'Music',           occupation: 'Q36834',    filmProp: 'P86',   share: 0.08, minSitelinks: 25, minFilms: 10, department: 'Music',           roleName: 'Composer',       skill: 'Composing' },
  { key: 'cinematographer',label: 'Cinematography',  occupation: 'Q222344',   filmProp: 'P344',  share: 0.06, minSitelinks: 16, minFilms: 10, department: 'Camera',          roleName: 'Cinematographer',skill: 'Cinematography' },
  { key: 'editor',         label: 'Editing',         occupation: 'Q7042855',  filmProp: 'P1040', share: 0.04, minSitelinks: 16, minFilms: 8,  department: 'Editing',         roleName: 'Editor',         skill: 'Editing' },
];

const sql = connect();

// ── discovery ──────────────────────────────────────────────────────
/**
 * Builds the roster. Candidates are pooled per role, then de-duplicated
 * globally: a person who works in several roles is assigned to the one where
 * they have the most credits, so polymaths don't consume several slots.
 */
async function buildRoster(excludeQids) {
  const roles = ROLES.filter((r) => !ONLY_ROLES || ONLY_ROLES.includes(r.key));
  const weight = roles.reduce((n, r) => n + r.share, 0);
  const pools = {};

  for (const role of roles) {
    const quota = Math.round((role.share / weight) * TOTAL);
    // Over-fetch: dedupe and exclusions eat into every pool.
    const people = await discoverPeople({
      occupation: role.occupation, filmProp: role.filmProp,
      minSitelinks: MIN_SITELINKS ?? role.minSitelinks, minFilms: MIN_FILMS ?? role.minFilms,
      limit: Math.max(quota * POOL_FACTOR, 60), cacheKey: role.key,
    });
    pools[role.key] = { role, quota, people };
    console.log(`  ${role.key.padEnd(16)} pool ${String(people.length).padStart(4)}  quota ${quota}`);
  }

  // Assign each person to the role where they have the most credits.
  const best = new Map();
  for (const { role, people } of Object.values(pools)) {
    for (const p of people) {
      if (excludeQids.has(p.qid)) continue;
      const cur = best.get(p.qid);
      if (!cur || p.roleFilms > cur.roleFilms) best.set(p.qid, { ...p, role });
    }
  }

  // Fill each role's quota from its own assignees, most notable first.
  const byRole = {};
  for (const person of best.values()) (byRole[person.role.key] ||= []).push(person);
  const roster = [];
  for (const { role, quota } of Object.values(pools)) {
    const picked = (byRole[role.key] || []).sort((a, b) => b.fame - a.fame).slice(0, quota);
    roster.push(...picked);
  }

  // Top up from whoever is left if quotas under-filled.
  if (roster.length < TOTAL) {
    const chosen = new Set(roster.map((p) => p.qid));
    const rest = [...best.values()].filter((p) => !chosen.has(p.qid)).sort((a, b) => b.fame - a.fame);
    roster.push(...rest.slice(0, TOTAL - roster.length));
  }
  return roster.slice(0, TOTAL);
}

// ── database ───────────────────────────────────────────────────────
/** One round trip instead of N: existing state is loaded up front and cached. */
async function loadExisting() {
  const [profiles, entities] = await Promise.all([
    sql`SELECT id, handle, source_url FROM profiles`,
    sql`SELECT id, slug, title, year, metadata->>'wikidata_id' AS wikidata_id FROM entities WHERE type = 'movie'`,
  ]);
  const seededQids = new Set();
  const handles = new Set();
  for (const p of profiles) {
    handles.add(p.handle);
    const m = p.source_url?.match(/\/(Q\d+)$/);
    if (m) seededQids.add(m[1]);
  }
  const byQid = new Map();
  const byTitleYear = new Map();
  for (const e of entities) {
    if (e.wikidata_id) byQid.set(e.wikidata_id, e);
    byTitleYear.set(`${e.title.toLowerCase()}|${e.year ?? ''}`, e);
  }
  return { seededQids, handles, byQid, byTitleYear };
}

function uniqueHandle(name, taken) {
  const base = slugify(name) || `person-${randomSlug().slice(0, 6)}`;
  let handle = base;
  for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`;
  taken.add(handle);
  return handle;
}

/** Multi-row insert; Postgres caps at 65535 params so batches stay small. */
async function insertRows(table, columns, rows, returning = '') {
  if (rows.length === 0) return [];
  const out = [];
  const perBatch = Math.max(1, Math.floor(60000 / columns.length));
  for (let i = 0; i < rows.length; i += perBatch) {
    const batch = rows.slice(i, i + perBatch);
    const params = [];
    const tuples = batch.map((row) => {
      const ph = row.map((v) => { params.push(v); return `$${params.length}`; });
      return `(${ph.join(',')})`;
    });
    const res = await sql.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')} ${returning}`, params);
    if (returning) out.push(...res);
  }
  return out;
}

// ── main ───────────────────────────────────────────────────────────
async function run() {
  const cacheSize = initCache('seed-people-cache.local.json', { refresh: REFRESH });
  console.log(`Seeding ${TOTAL} people, ${FILMS_PER_PERSON} ${RECENT ? 'most recent' : 'best-known'} credits each${DRY_RUN ? ' — DRY RUN' : ''}`);
  console.log(`Cache: ${cacheSize} entries\n`);

  console.log('1/5  Loading existing database state...');
  const existing = await loadExisting();
  console.log(`     ${existing.seededQids.size} already-seeded people, ${existing.byQid.size + existing.byTitleYear.size} known movie rows\n`);

  console.log('2/5  Discovering people on Wikidata...');
  const roster = await buildRoster(existing.seededQids);
  const counts = roster.reduce((m, p) => ({ ...m, [p.role.key]: (m[p.role.key] || 0) + 1 }), {});
  console.log(`     roster: ${roster.length} — ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);

  console.log('3/5  Fetching details, bios and filmographies...');
  const details = {};
  for (let i = 0; i < roster.length; i += 50) {
    Object.assign(details, await fetchDetails(roster.slice(i, i + 50).map((p) => p.qid)));
  }
  const imageFiles = Object.values(details).map((d) => d.image).filter(Boolean);
  const imageCredits = {};
  for (let i = 0; i < imageFiles.length; i += 40) {
    Object.assign(imageCredits, await fetchImageCredits(imageFiles.slice(i, i + 40)));
  }

  const enriched = [];
  const failed = [];
  let n = 0;
  for (const person of roster) {
    const d = details[person.qid] || {};
    // A filmography that WDQS will not answer must not kill the run: at this
    // size the loop is hours long, and everyone before the failure is already
    // enriched. Skip the person, keep the list, report it at the end.
    const [summary, films] = await Promise.all([
      fetchSummary(d.article),
      fetchFilmography(person.qid, person.role.filmProp, FILMS_PER_PERSON,
        { characterQualifier: person.role.key === 'actor', order: RECENT ? 'recent' : 'fame' })
        .catch((err) => { failed.push(`${person.name} (${person.qid}): ${err.message}`); return null; }),
    ]);
    if (films === null) { n++; continue; }
    const imageFile = d.image ? decodeURIComponent(d.image.split('/').pop()) : null;
    enriched.push({
      ...person,
      films,
      headline: titleCase(summary?.description) || person.role.roleName || 'Film Professional',
      bio: summary?.extract || null,
      location: [d.birthPlace, d.birthCountry].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || null,
      avatarUrl: commonsUrl(d.image) || summary?.thumbnail || null,
      imageAttribution: imageFile ? imageCredits[imageFile] || null : null,
      skills: deriveSkills(d.occupations || [], person.role.skill),
      mediaLinks: [
        d.article && { url: d.article, title: 'Wikipedia', type: 'article' },
        { url: `https://www.wikidata.org/wiki/${person.qid}`, title: 'Wikidata', type: 'data' },
      ].filter(Boolean),
    });
    if (++n % 25 === 0 || n === roster.length) process.stdout.write(`\r     ${n}/${roster.length}`);
  }
  flushCache();
  const noAvatar = enriched.filter((p) => !p.avatarUrl).length;
  const noBio = enriched.filter((p) => !p.bio).length;
  const noFilms = enriched.filter((p) => p.films.length === 0).length;
  console.log(`\n     ${enriched.length} enriched — ${noAvatar} without photo, ${noBio} without bio, ${noFilms} without credits`);
  if (failed.length) {
    console.log(`     ${failed.length} filmographies unavailable, skipped:`);
    for (const f of failed.slice(0, 10)) console.log(`       ${f}`);
    if (failed.length > 10) console.log(`       … and ${failed.length - 10} more`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('4/5  Dry run — no writes.\n');
    for (const role of ROLES) {
      const sample = enriched.filter((p) => p.role.key === role.key).slice(0, 4);
      if (sample.length) console.log(`  ${role.key}: ` + sample.map((p) => `${p.name} (${p.films.length})`).join(', '));
    }
    console.log(`\n  ${enriched.reduce((t, p) => t + p.films.length, 0)} credits total`);
    return;
  }

  console.log('4/5  Writing profiles and credits to Neon...');
  let newEntities = 0, totalCredits = 0, written = 0;

  for (const person of enriched) {
    if (person.films.length === 0) continue;
    const sourceUrl = `https://www.wikidata.org/wiki/${person.qid}`;
    const handle = uniqueHandle(person.name, existing.handles);
    const email = `${handle}@directory.hsi.invalid`;

    const [profile] = await sql`
      INSERT INTO profiles (email, handle, display_name, headline, bio, location, avatar_url,
                            skills, representation, media_links, featured_credit_ids,
                            is_directory, source, source_url, image_attribution)
      VALUES (${email}, ${handle}, ${person.name}, ${person.headline}, ${person.bio}, ${person.location},
              ${person.avatarUrl}, ${JSON.stringify(person.skills)}::jsonb, '[]'::jsonb,
              ${JSON.stringify(person.mediaLinks)}::jsonb, '[]'::jsonb,
              TRUE, 'wikidata', ${sourceUrl}, ${person.imageAttribution})
      ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO UPDATE SET
        display_name = EXCLUDED.display_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio,
        location = EXCLUDED.location, avatar_url = EXCLUDED.avatar_url, skills = EXCLUDED.skills,
        media_links = EXCLUDED.media_links, image_attribution = EXCLUDED.image_attribution,
        updated_at = NOW()
      RETURNING id`;

    // Reuse existing movie rows; create the rest in one insert.
    const missing = [];
    const resolved = new Map();
    for (const f of person.films) {
      const hit = existing.byQid.get(f.qid) || existing.byTitleYear.get(`${f.title.toLowerCase()}|${f.year ?? ''}`);
      if (hit) resolved.set(f.qid, hit.id);
      else if (!missing.some((m) => m.qid === f.qid)) missing.push(f);
    }

    if (missing.length) {
      const created = await insertRows('entities',
        ['type', 'title', 'slug', 'year', 'image_url', 'genre', 'metadata', 'created_by'],
        missing.map((f) => ['movie', f.title, randomSlug(), f.year, commonsUrl(f.image, 400),
          f.genres.map(cleanGenre).filter(Boolean).slice(0, 4),
          JSON.stringify({ wikidata_id: f.qid, source: 'wikidata', source_url: `https://www.wikidata.org/wiki/${f.qid}` }),
          null]),
        `RETURNING id, slug, title, year, metadata->>'wikidata_id' AS wikidata_id`);
      for (const row of created) {
        resolved.set(row.wikidata_id, row.id);
        existing.byQid.set(row.wikidata_id, row);
        existing.byTitleYear.set(`${row.title.toLowerCase()}|${row.year ?? ''}`, row);
      }
      newEntities += created.length;
    }

    await sql`DELETE FROM credits WHERE profile_id = ${profile.id}`;
    const creditRows = person.films.map((f, i) => [
      profile.id, person.role.department, f.title, f.year,
      person.role.key === 'actor' ? (f.character || 'Actor') : person.role.roleName,
      'movie', resolved.get(f.qid) ?? null, i,
    ]);
    await insertRows('credits',
      ['profile_id', 'department', 'title', 'year', 'role', 'work_type', 'entity_id', 'sort_order'],
      creditRows);
    totalCredits += creditRows.length;

    if (++written % 25 === 0 || written === enriched.length) {
      process.stdout.write(`\r     ${written}/${enriched.length} profiles · ${newEntities} new movies · ${totalCredits} credits`);
    }
  }

  console.log(`\n\n5/5  Done.`);
  console.log(`  profiles : ${written}`);
  console.log(`  movies   : ${newEntities} new pages`);
  console.log(`  credits  : ${totalCredits}`);
  console.log(`\nNext: node scripts/fetch-posters.mjs && node scripts/verify-images.mjs --fix`);
}

run().catch((err) => { flushCache(); console.error('\nSeed failed:', err); process.exit(1); });
