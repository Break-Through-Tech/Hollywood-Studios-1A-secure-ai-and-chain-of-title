/**
 * Seed directory profiles for notable film actors from Wikidata + Wikipedia.
 *
 * No actor data is committed to the repo — everything is fetched at run time and
 * written straight to Neon. Responses are cached to seed-actors-cache.local.json
 * (gitignored) so re-runs don't re-hit the APIs.
 *
 *   node scripts/seed-actors.mjs                 # 100 actors, 20 credits each
 *   node scripts/seed-actors.mjs --limit=25      # fewer actors
 *   node scripts/seed-actors.mjs --dry-run       # fetch + report, no writes
 *   node scripts/seed-actors.mjs --refresh       # ignore the cache
 *
 * Seeded profiles are marked is_directory = TRUE: they render read-only with a
 * reference badge and are excluded from People and connection requests.
 */
import { connect } from './_db.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_PATH = resolve(ROOT, 'seed-actors-cache.local.json');
const UA = 'HSI-Seed-Script/1.0 (https://hollywoodstudios.ai; contact: m@prowco.ai)';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const LIMIT = flag('limit', 100);
const FILMS_PER_ACTOR = flag('films', 20);
const DRY_RUN = args.includes('--dry-run');
const REFRESH = args.includes('--refresh');

// ── cache ──────────────────────────────────────────────────────────
const cache = !REFRESH && existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
function saveCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
async function cached(key, fn) {
  if (cache[key] !== undefined) return cache[key];
  const value = await fn();
  cache[key] = value;
  saveCache();
  return value;
}

// ── wikidata / wikipedia ───────────────────────────────────────────
async function sparql(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), {
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error('SPARQL failed after 3 attempts');
}

const qid = (uri) => uri.split('/').pop();
const val = (binding, key) => binding[key]?.value || null;

/** Film actors ranked by cross-language notability, with a real filmography. */
function discoverActors(limit) {
  return cached(`actors:${limit}`, async () => {
    const rows = await sparql(`
      SELECT ?person ?personLabel (COUNT(DISTINCT ?film) AS ?films) (SAMPLE(?sl) AS ?fame) WHERE {
        ?person wdt:P106 wd:Q10800557 ;
                wikibase:sitelinks ?sl ;
                rdfs:label ?personLabel .
        FILTER(LANG(?personLabel) = "en")
        FILTER(?sl > 60)
        FILTER NOT EXISTS { ?person wdt:P106 wd:Q82955 }
        ?film wdt:P161 ?person ; wdt:P31 wd:Q11424 .
        FILTER NOT EXISTS { ?film wdt:P31 wd:Q93204 }
        FILTER NOT EXISTS { ?film wdt:P136 wd:Q93204 }
      }
      GROUP BY ?person ?personLabel
      HAVING (COUNT(DISTINCT ?film) >= 15)
      ORDER BY DESC(SAMPLE(?sl))
      LIMIT ${limit}`);
    return rows.map((r) => ({
      qid: qid(val(r, 'person')),
      name: val(r, 'personLabel'),
      filmCount: Number(val(r, 'films')),
      fame: Number(val(r, 'fame')),
    }));
  });
}

/** Headshot, birth, origin and occupations for a batch of actors. */
function fetchDetails(qids) {
  return cached(`details:v2:${qids.join(',')}`, async () => {
    const values = qids.map((q) => `wd:${q}`).join(' ');
    const rows = await sparql(`
      SELECT ?person (SAMPLE(?img) AS ?image) (SAMPLE(?birth) AS ?born) (SAMPLE(?deathDate) AS ?died)
             (SAMPLE(?birthPlaceLabel) AS ?birthPlace) (SAMPLE(?birthCountryLabel) AS ?birthCountry)
             (GROUP_CONCAT(DISTINCT ?occLabel; separator="|") AS ?occupations)
             (SAMPLE(?article) AS ?article) WHERE {
        VALUES ?person { ${values} }
        OPTIONAL { ?person wdt:P18 ?img }
        OPTIONAL { ?person wdt:P569 ?birth }
        OPTIONAL { ?person wdt:P570 ?deathDate }
        OPTIONAL { ?person wdt:P19 ?bp . ?bp rdfs:label ?birthPlaceLabel . FILTER(LANG(?birthPlaceLabel)="en") }
        OPTIONAL {
          ?person wdt:P19 ?bp2 . ?bp2 wdt:P17 ?bc .
          FILTER NOT EXISTS { ?bc wdt:P576 ?dissolved }   # skip historical states
          ?bc rdfs:label ?birthCountryLabel . FILTER(LANG(?birthCountryLabel)="en")
        }
        OPTIONAL { ?person wdt:P106 ?occ . ?occ rdfs:label ?occLabel . FILTER(LANG(?occLabel)="en") }
        OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
      }
      GROUP BY ?person`);
    const out = {};
    for (const r of rows) {
      out[qid(val(r, 'person'))] = {
        image: val(r, 'image'),
        born: val(r, 'born'),
        died: val(r, 'died'),
        birthPlace: val(r, 'birthPlace'),
        birthCountry: val(r, 'birthCountry'),
        occupations: (val(r, 'occupations') || '').split('|').filter(Boolean),
        article: val(r, 'article'),
      };
    }
    return out;
  });
}

/** An actor's best-known films, with character name, year, genres and poster. */
function fetchFilmography(actorQid, limit) {
  return cached(`films:${actorQid}:${limit}`, async () => {
    const rows = await sparql(`
      SELECT ?film ?filmLabel (MIN(?y) AS ?year) (SAMPLE(?img) AS ?image) (SAMPLE(?sl) AS ?fame)
             (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres)
             (SAMPLE(?charLabel) AS ?character) WHERE {
        ?film wdt:P161 wd:${actorQid} ;
              wdt:P31 wd:Q11424 ;
              wikibase:sitelinks ?sl ;
              rdfs:label ?filmLabel .
        FILTER(LANG(?filmLabel) = "en")
        FILTER NOT EXISTS { ?film wdt:P31 wd:Q93204 }
        OPTIONAL { ?film wdt:P577 ?d . BIND(YEAR(?d) AS ?y) }
        OPTIONAL { ?film wdt:P18 ?img }
        OPTIONAL { ?film wdt:P136 ?g . ?g rdfs:label ?genreLabel . FILTER(LANG(?genreLabel)="en") }
        OPTIONAL { ?film p:P161 ?st . ?st ps:P161 wd:${actorQid} ; pq:P453 ?c .
                   ?c rdfs:label ?charLabel . FILTER(LANG(?charLabel)="en") }
      }
      GROUP BY ?film ?filmLabel
      ORDER BY DESC(SAMPLE(?sl))
      LIMIT ${limit}`);
    return rows.map((r) => ({
      qid: qid(val(r, 'film')),
      title: val(r, 'filmLabel'),
      year: val(r, 'year') ? Number(val(r, 'year')) : null,
      image: val(r, 'image'),
      genres: (val(r, 'genres') || '').split('|').filter(Boolean),
      character: val(r, 'character'),
      fame: Number(val(r, 'fame')),
    }));
  });
}

/** Wikipedia lead paragraph + short descriptor, used for bio and headline. */
function fetchSummary(articleUrl) {
  if (!articleUrl) return Promise.resolve(null);
  const title = decodeURIComponent(articleUrl.split('/wiki/')[1] || '');
  if (!title) return Promise.resolve(null);
  return cached(`summary:${title}`, async () => {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      extract: d.extract || null,
      description: d.description || null,
      thumbnail: d.originalimage?.source || d.thumbnail?.source || null,
    };
  });
}

/** Licence + author for Commons images, so seeded photos carry attribution. */
function fetchImageCredits(filenames) {
  if (filenames.length === 0) return Promise.resolve({});
  return cached(`credits:${filenames.join('|')}`, async () => {
    const titles = filenames.map((f) => `File:${decodeURIComponent(f.split('/').pop())}`).join('|');
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return {};
    const pages = (await res.json()).query?.pages || {};
    const out = {};
    for (const page of Object.values(pages)) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      const strip = (html) => (html || '').replace(/<[^>]*>/g, '').trim();
      const artist = strip(meta.Artist?.value);
      const licence = strip(meta.LicenseShortName?.value);
      out[page.title.replace(/^File:/, '')] = [artist, licence].filter(Boolean).join(' · ') || null;
    }
    return out;
  });
}

// ── shaping ────────────────────────────────────────────────────────
const commonsUrl = (p18, width = 500) =>
  p18 ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decodeURIComponent(p18.split('/').pop()))}?width=${width}` : null;

function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function randomSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** "war film" -> "War", "romantic comedy film" -> "Romantic Comedy" */
function cleanGenre(g) {
  const base = g.replace(/\s+films?$/i, '').replace(/-related$/i, '').trim();
  if (!base) return null;
  return base.split(' ').map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

const OCCUPATION_SKILLS = {
  'film actor': 'Acting', 'actor': 'Acting', 'stage actor': 'Theatre',
  'television actor': 'Television', 'voice actor': 'Voice Acting',
  'film producer': 'Producing', 'film director': 'Directing',
  'screenwriter': 'Screenwriting', 'singer': 'Music', 'composer': 'Music',
  'model': 'Modelling', 'comedian': 'Comedy', 'dancer': 'Dance',
  'stunt performer': 'Stunts', 'martial artist': 'Martial Arts',
};

function deriveSkills(occupations) {
  const skills = new Set(['Acting']);
  for (const occ of occupations) {
    const skill = OCCUPATION_SKILLS[occ.toLowerCase()];
    if (skill) skills.add(skill);
  }
  return [...skills].slice(0, 6);
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── database ───────────────────────────────────────────────────────

async function uniqueHandle(sql, base, sourceUrl) {
  let handle = base;
  for (let n = 2; n < 50; n++) {
    const [taken] = await sql`SELECT source_url FROM profiles WHERE handle = ${handle}`;
    if (!taken || taken.source_url === sourceUrl) return handle;
    handle = `${base}-${n}`;
  }
  return `${base}-${randomSlug().slice(0, 4)}`;
}

async function upsertProfile(sql, actor) {
  const sourceUrl = `https://www.wikidata.org/wiki/${actor.qid}`;
  const handle = await uniqueHandle(sql, slugify(actor.name), sourceUrl);
  const email = `${handle}@directory.hsi.invalid`;

  const [existing] = await sql`SELECT id FROM profiles WHERE source_url = ${sourceUrl} OR handle = ${handle} OR email = ${email}`;

  const fields = {
    email, handle,
    display_name: actor.name,
    headline: actor.headline,
    bio: actor.bio,
    location: actor.location,
    avatar_url: actor.avatarUrl,
    skills: JSON.stringify(actor.skills),
    media_links: JSON.stringify(actor.mediaLinks),
    source_url: sourceUrl,
    image_attribution: actor.imageAttribution,
  };

  if (existing) {
    await sql`
      UPDATE profiles SET
        email = ${fields.email}, handle = ${fields.handle}, display_name = ${fields.display_name},
        headline = ${fields.headline}, bio = ${fields.bio}, location = ${fields.location},
        avatar_url = ${fields.avatar_url}, skills = ${fields.skills}::jsonb,
        media_links = ${fields.media_links}::jsonb, is_directory = TRUE, source = 'wikidata',
        source_url = ${fields.source_url}, image_attribution = ${fields.image_attribution},
        updated_at = NOW()
      WHERE id = ${existing.id}`;
    return { id: existing.id, handle, created: false };
  }

  const [row] = await sql`
    INSERT INTO profiles (email, handle, display_name, headline, bio, location, avatar_url,
                          skills, representation, media_links, featured_credit_ids,
                          is_directory, source, source_url, image_attribution)
    VALUES (${fields.email}, ${fields.handle}, ${fields.display_name}, ${fields.headline},
            ${fields.bio}, ${fields.location}, ${fields.avatar_url}, ${fields.skills}::jsonb,
            '[]'::jsonb, ${fields.media_links}::jsonb, '[]'::jsonb,
            TRUE, 'wikidata', ${fields.source_url}, ${fields.image_attribution})
    RETURNING id`;
  return { id: row.id, handle, created: true };
}

/** Reuse an existing movie page when one matches, otherwise create it. */
async function upsertEntity(sql, film) {
  const [byQid] = await sql`SELECT id, slug FROM entities WHERE metadata->>'wikidata_id' = ${film.qid} LIMIT 1`;
  if (byQid) return { ...byQid, created: false };

  const [byTitle] = film.year
    ? await sql`SELECT id, slug FROM entities WHERE type = 'movie' AND lower(title) = lower(${film.title}) AND year = ${film.year} LIMIT 1`
    : await sql`SELECT id, slug FROM entities WHERE type = 'movie' AND lower(title) = lower(${film.title}) LIMIT 1`;
  if (byTitle) {
    await sql`UPDATE entities SET metadata = metadata || ${JSON.stringify({ wikidata_id: film.qid })}::jsonb WHERE id = ${byTitle.id}`;
    return { ...byTitle, created: false };
  }

  const genres = film.genres.map(cleanGenre).filter(Boolean).slice(0, 4);
  const metadata = { wikidata_id: film.qid, source: 'wikidata', source_url: `https://www.wikidata.org/wiki/${film.qid}` };
  const [row] = await sql`
    INSERT INTO entities (type, title, slug, year, image_url, genre, metadata, created_by)
    VALUES ('movie', ${film.title}, ${randomSlug()}, ${film.year}, ${commonsUrl(film.image, 400)},
            ${genres}, ${JSON.stringify(metadata)}::jsonb, NULL)
    RETURNING id, slug`;
  return { ...row, created: true };
}

// ── main ───────────────────────────────────────────────────────────
async function run() {
  console.log(`Seeding ${LIMIT} actors (${FILMS_PER_ACTOR} credits each)${DRY_RUN ? ' — DRY RUN' : ''}\n`);

  console.log('1/4  Discovering actors on Wikidata...');
  const actors = await discoverActors(LIMIT);
  console.log(`     ${actors.length} actors\n`);

  console.log('2/4  Fetching biographical details...');
  const details = {};
  for (let i = 0; i < actors.length; i += 50) {
    const batch = actors.slice(i, i + 50).map((a) => a.qid);
    Object.assign(details, await fetchDetails(batch));
  }
  const imageFiles = Object.values(details).map((d) => d.image).filter(Boolean);
  const imageCredits = {};
  for (let i = 0; i < imageFiles.length; i += 40) {
    Object.assign(imageCredits, await fetchImageCredits(imageFiles.slice(i, i + 40)));
  }
  console.log(`     ${Object.keys(details).length} detail records, ${Object.keys(imageCredits).length} image credits\n`);

  console.log('3/4  Fetching bios and filmographies...');
  const enriched = [];
  for (const [i, actor] of actors.entries()) {
    const d = details[actor.qid] || {};
    const summary = await fetchSummary(d.article);
    const films = await fetchFilmography(actor.qid, FILMS_PER_ACTOR);
    const imageFile = d.image ? decodeURIComponent(d.image.split('/').pop()) : null;

    enriched.push({
      ...actor,
      films,
      headline: titleCase(summary?.description) || 'Film Actor',
      bio: summary?.extract || null,
      location: [d.birthPlace, d.birthCountry].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || null,
      avatarUrl: commonsUrl(d.image) || summary?.thumbnail || null,
      imageAttribution: imageFile ? imageCredits[imageFile] || null : null,
      skills: deriveSkills(d.occupations || []),
      mediaLinks: [
        d.article && { url: d.article, title: 'Wikipedia', type: 'article' },
        { url: `https://www.wikidata.org/wiki/${actor.qid}`, title: 'Wikidata', type: 'data' },
      ].filter(Boolean),
    });
    process.stdout.write(`\r     ${i + 1}/${actors.length}  ${actor.name.padEnd(30).slice(0, 30)}`);
  }
  console.log(`\n     ${enriched.length} actors enriched\n`);

  if (DRY_RUN) {
    console.log('4/4  Dry run — no writes.\n');
    for (const a of enriched.slice(0, 10)) {
      console.log(`  ${a.name} — ${a.headline}`);
      console.log(`    ${a.films.length} credits · avatar ${a.avatarUrl ? 'yes' : 'NO'} · bio ${a.bio ? `${a.bio.length} chars` : 'NO'} · ${a.location || 'no location'}`);
    }
    const noAvatar = enriched.filter((a) => !a.avatarUrl).length;
    const noBio = enriched.filter((a) => !a.bio).length;
    console.log(`\n  Totals: ${enriched.reduce((n, a) => n + a.films.length, 0)} credits, ${noAvatar} without avatar, ${noBio} without bio`);
    return;
  }

  console.log('4/4  Writing to Neon...');
  const sql = connect();
  let createdProfiles = 0, updatedProfiles = 0, createdEntities = 0, totalCredits = 0;

  for (const [i, actor] of enriched.entries()) {
    const { id: profileId, handle, created } = await upsertProfile(sql, actor);
    created ? createdProfiles++ : updatedProfiles++;

    await sql`DELETE FROM credits WHERE profile_id = ${profileId}`;
    for (const [order, film] of actor.films.entries()) {
      const entity = await upsertEntity(sql, film);
      if (entity.created) createdEntities++;
      await sql`
        INSERT INTO credits (profile_id, department, title, year, role, work_type, entity_id, sort_order)
        VALUES (${profileId}, 'Acting', ${film.title}, ${film.year},
                ${film.character || 'Actor'}, 'movie', ${entity.id}, ${order})`;
      totalCredits++;
    }
    console.log(`  ${created ? '+' : '~'} ${actor.name.padEnd(28)} ${actor.films.length} credits  /profile/${handle}`);
    if ((i + 1) % 25 === 0) console.log(`     ... ${i + 1}/${enriched.length}`);
  }

  console.log(`\nDone.`);
  console.log(`  profiles : ${createdProfiles} created, ${updatedProfiles} updated`);
  console.log(`  movies   : ${createdEntities} new pages`);
  console.log(`  credits  : ${totalCredits} linked`);
}

run().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
