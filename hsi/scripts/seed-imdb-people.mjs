/**
 * Seed directory profiles for named people using their IMDb name page as the
 * source of record for credits.
 *
 * Unlike scripts/seed-people.mjs, this is not a discovery pass: the people are
 * listed in PEOPLE below by IMDb id, so it is the script to reach for when
 * someone specific has to go on the platform. Filmographies (titles, years,
 * characters) are fetched at run time; headline, bio, location and skills are
 * editorial and live in this file, so nothing IMDb wrote is copied verbatim.
 *
 *   node scripts/seed-imdb-people.mjs                # everyone in PEOPLE
 *   node scripts/seed-imdb-people.mjs --dry-run      # fetch and print, no writes
 *   node scripts/seed-imdb-people.mjs --only=jessica-belkin
 *
 * Seeded profiles are marked is_directory = TRUE: they render read-only with a
 * reference badge and are excluded from connection requests.
 *
 * Next: node scripts/set-featured.mjs <handle> …  to put them on /people.
 */
import { connect } from './_db.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');

const sql = connect();

// ── the roster ─────────────────────────────────────────────────────
const PEOPLE = [
  {
    imdbId: 'nm3531655',
    handle: 'jessica-belkin',
    name: 'Jessica Belkin',
    headline: 'Actress — Baywatch, Elle, American Horror Story',
    location: 'Los Angeles, CA',
    skills: ['Acting', 'Television', 'Film'],
    bio: `Jessica Belkin is an American actress who has worked in film and television since childhood. `
      + `She broke through as Wren, the vampire daughter of Lady Gaga's Countess, across seven episodes of `
      + `American Horror Story: Hotel, and built out a run of series work in Just Add Magic, Speechless, `
      + `Nicky, Ricky, Dicky & Dawn, Pretty Little Liars and The Orville. `
      + `Her feature credits include the horror titles Last Straw and Hunt Club and the music drama `
      + `Singing in My Sleep. She now leads the Baywatch reboot as Charlie Vale, and appears in the `
      + `Legally Blonde prequel series Elle, the Yellowstone spinoff Dutton Ranch, and the thriller `
      + `The Hunting Wives.`,
  },
  {
    imdbId: 'nm6858580',
    handle: 'jessica-treska',
    name: 'Jessica Treska',
    headline: 'Actress — Sharp Objects, Hysteria!, Euphoria',
    location: 'California, USA',
    skills: ['Acting', 'Television', 'Film'],
    bio: `Jessica Treska is an American actress known for dramatic television. `
      + `She played Natalie Keene across six episodes of HBO's Sharp Objects, and carried Judith Sanders `
      + `through the full run of Peacock's Hysteria!. Her recurring work includes Good Girls, `
      + `Roswell, New Mexico and Euphoria, alongside single-episode turns in Magnum P.I., Criminal Minds `
      + `and CSI: Crime Scene Investigation. `
      + `On film she led The Virgin of Highland Park and appeared in Alex & Me and BAB. `
      + `Her short film Broken Pines screened at the Toronto International Film Festival.`,
  },
];

// ── IMDb ───────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function imdb(query) {
  const res = await fetch('https://caching.graphql.imdb.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'x-imdb-client-name': 'imdb-web-next-localized',
      'x-imdb-user-country': 'US',
      'x-imdb-user-language': 'en-US',
      Origin: 'https://www.imdb.com',
      Referer: 'https://www.imdb.com/',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`IMDb ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.errors) throw new Error(`IMDb GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data;
}

/**
 * Title kinds that earn an entity page. Shorts, videos, games, music videos and
 * podcasts stay credit lines with a work-type label: they would otherwise fill
 * the Projects directory with pages nobody browses to.
 */
const TITLE_TYPES = {
  movie:         { entity: 'movie',  workType: 'Film' },
  tvMovie:       { entity: 'movie',  workType: 'TV Movie' },
  tvSeries:      { entity: 'tvshow', workType: 'TV' },
  tvMiniSeries:  { entity: 'tvshow', workType: 'TV Mini-Series' },
  tvSpecial:     { entity: null,     workType: 'TV Special' },
  short:         { entity: null,     workType: 'Short' },
  video:         { entity: null,     workType: 'Video' },
  videoGame:     { entity: null,     workType: 'Video Game' },
  musicVideo:    { entity: null,     workType: 'Music Video' },
  podcastSeries: { entity: null,     workType: 'Podcast' },
};

/**
 * IMDb serves the original upload at `._V1_.jpg`, which is routinely 2000px
 * and several MB. Its URL syntax takes sizing operators before the extension
 * (`_UX600_` = scale to 600px wide), so ask for a size the UI can actually use.
 */
function imdbImage(url, width) {
  if (!url) return null;
  return url.replace(/\._V1_([A-Z0-9,]*_)?\.jpg$/, (_, ops) => `._V1_${ops || ''}UX${width}_.jpg`);
}
const AVATAR_WIDTH = 600;
const POSTER_WIDTH = 400;

/** Cast credits only — "Self", archive footage and crew work aren't performances. */
const CAST_CATEGORIES = new Set(['Actress', 'Actor']);

function fetchPerson(imdbId) {
  return imdb(`query {
    name(id: "${imdbId}") {
      id
      nameText { text }
      primaryImage { url }
      primaryProfessions { category { text } }
      credits(first: 250) {
        total
        edges { node {
          category { text }
          attributes { text }
          ... on Cast {
            characters { name }
            episodeCredits(first: 100) { total edges { node { title { releaseYear { year } } } } }
          }
          title {
            id
            titleText { text }
            releaseYear { year endYear }
            titleType { id text }
            primaryImage { url }
            genres { genres { text } }
          }
        } }
      }
    }
  }`).then((d) => d.name);
}

/**
 * One IMDb credit as this platform stores it. For series the year is the last
 * year the person actually appeared, not the year the show premiered — a 2015
 * guest spot on a show that started in 2009 reads wrong under its premiere year.
 */
function shapeCredit(node) {
  const kind = TITLE_TYPES[node.title.titleType?.id];
  if (!kind) return null;
  if (!CAST_CATEGORIES.has(node.category?.text)) return null;

  const episodeYears = (node.episodeCredits?.edges || [])
    .map((e) => e.node.title.releaseYear?.year).filter(Boolean);
  const year = episodeYears.length ? Math.max(...episodeYears) : node.title.releaseYear?.year ?? null;

  const attributes = (node.attributes || []).map((a) => a.text)
    .filter((t) => !/^as /i.test(t));  // "as Jessica Belkin" is a billing note, not a role note
  const character = (node.characters || []).map((c) => c.name).join(' / ') || 'Actor';
  const episodes = node.episodeCredits?.total || 0;

  return {
    imdbId: node.title.id,
    title: node.title.titleText.text,
    year,
    entityType: kind.entity,
    workType: kind.workType,
    role: attributes.length ? `${character} (${attributes.join(', ')})` : character,
    episodes,
    startYear: node.title.releaseYear?.year ?? null,
    endYear: node.title.releaseYear?.endYear ?? null,
    image: imdbImage(node.title.primaryImage?.url, POSTER_WIDTH),
    genres: (node.title.genres?.genres || []).map((g) => g.text).filter((g) => g !== 'Short').slice(0, 4),
  };
}

/** Upcoming work first, then most recent — the order a filmography is read in. */
function byRecency(a, b) {
  if (a.year === b.year) return a.title.localeCompare(b.title);
  if (a.year === null) return -1;
  if (b.year === null) return 1;
  return b.year - a.year;
}

// ── writing ────────────────────────────────────────────────────────
function randomSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * The entity for a credit, reusing whatever is already on the platform: first by
 * IMDb id, then by title/year/type so a title seeded from Wikidata isn't
 * duplicated under a second page.
 *
 * created_by stays null: the person is in the cast, they did not author the
 * page, and a profile that claims to have created its own filmography reads as
 * a member-built page rather than a reference entry.
 */
async function resolveEntity(credit) {
  const [byImdb] = await sql`
    SELECT id, image_url FROM entities WHERE metadata->>'imdb_id' = ${credit.imdbId} LIMIT 1`;
  if (byImdb) {
    // A page seeded before images were size-bounded still points at the
    // original upload; swap it for the sized one. Anything else stays as is.
    if (credit.image && (!byImdb.image_url || byImdb.image_url.includes('m.media-amazon.com'))
        && byImdb.image_url !== credit.image) {
      await sql`UPDATE entities SET image_url = ${credit.image}, updated_at = NOW() WHERE id = ${byImdb.id}`;
    }
    return { id: byImdb.id, created: false };
  }

  const [byTitle] = await sql`
    SELECT id FROM entities
    WHERE lower(title) = ${credit.title.toLowerCase()}
      AND type = ${credit.entityType}
      AND (year = ${credit.startYear} OR (year IS NULL AND ${credit.startYear}::int IS NULL))
    LIMIT 1`;
  if (byTitle) {
    // Fill in the IMDb id so the next run matches on the cheap path.
    await sql`
      UPDATE entities
      SET metadata = metadata || ${JSON.stringify({ imdb_id: credit.imdbId })}::jsonb, updated_at = NOW()
      WHERE id = ${byTitle.id}`;
    return { id: byTitle.id, created: false };
  }

  const [entity] = await sql`
    INSERT INTO entities (type, title, slug, year, image_url, genre, metadata, created_by)
    VALUES (${credit.entityType}, ${credit.title}, ${randomSlug()}, ${credit.startYear},
            ${credit.image}, ${credit.genres},
            ${JSON.stringify({
              imdb_id: credit.imdbId,
              source: 'imdb',
              source_url: `https://www.imdb.com/title/${credit.imdbId}/`,
              ...(credit.endYear ? { end_year: credit.endYear } : {}),
            })}::jsonb,
            NULL)
    RETURNING id`;
  return { id: entity.id, created: true };
}

async function seed(person) {
  const sourceUrl = `https://www.imdb.com/name/${person.imdbId}/`;
  process.stdout.write(`  ${person.name} … `);

  const data = await fetchPerson(person.imdbId);
  if (!data) throw new Error(`no IMDb record for ${person.imdbId}`);
  if (data.nameText?.text !== person.name) {
    throw new Error(`${person.imdbId} is "${data.nameText?.text}", expected "${person.name}"`);
  }

  const credits = (data.credits?.edges || [])
    .map((e) => shapeCredit(e.node)).filter(Boolean).sort(byRecency);
  console.log(`${credits.length} credits of ${data.credits?.total ?? 0} listed`);

  if (DRY_RUN) {
    for (const c of credits) {
      console.log(`     ${String(c.year ?? '—').padEnd(6)} ${c.workType.padEnd(14)} ${c.title} — ${c.role}`
        + (c.episodes ? ` (${c.episodes} ep)` : '') + (c.entityType ? '' : '  [no page]'));
    }
    return;
  }

  const [profile] = await sql`
    INSERT INTO profiles (email, handle, display_name, headline, bio, location, avatar_url,
                          skills, representation, media_links, featured_credit_ids,
                          is_directory, source, source_url, image_attribution)
    VALUES (${`${person.handle}@directory.hsi.invalid`}, ${person.handle}, ${person.name},
            ${person.headline}, ${person.bio}, ${person.location}, ${imdbImage(data.primaryImage?.url, AVATAR_WIDTH)},
            ${JSON.stringify(person.skills)}::jsonb, '[]'::jsonb,
            ${JSON.stringify([{ url: sourceUrl, title: 'IMDb', type: 'profile' }])}::jsonb, '[]'::jsonb,
            TRUE, 'imdb', ${sourceUrl}, 'Photo via IMDb')
    ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO UPDATE SET
      handle = EXCLUDED.handle, display_name = EXCLUDED.display_name, headline = EXCLUDED.headline,
      bio = EXCLUDED.bio, location = EXCLUDED.location, avatar_url = EXCLUDED.avatar_url,
      skills = EXCLUDED.skills, media_links = EXCLUDED.media_links,
      image_attribution = EXCLUDED.image_attribution, updated_at = NOW()
    RETURNING id`;

  let created = 0;
  const rows = [];
  for (const [i, credit] of credits.entries()) {
    let entityId = null;
    if (credit.entityType) {
      const entity = await resolveEntity(credit);
      entityId = entity.id;
      if (entity.created) created++;
    }
    rows.push([profile.id, 'Acting', credit.title, credit.year, credit.role, credit.workType, entityId, i]);
  }

  // Replace rather than merge: IMDb is the source of record for these credits,
  // so a re-run should drop anything that has since been removed there.
  await sql`DELETE FROM credits WHERE profile_id = ${profile.id}`;
  for (const r of rows) {
    await sql`
      INSERT INTO credits (profile_id, department, title, year, role, work_type, entity_id, sort_order)
      VALUES (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]})`;
  }

  console.log(`     ✓ /profile/${person.handle} — ${rows.length} credits, ${created} new title pages`);
}

async function run() {
  const roster = ONLY ? PEOPLE.filter((p) => ONLY.includes(p.handle)) : PEOPLE;
  if (roster.length === 0) throw new Error(`no one matched --only=${ONLY?.join(',')}`);

  console.log(`Seeding ${roster.length} profile(s) from IMDb${DRY_RUN ? ' (dry run)' : ''}…\n`);
  for (const person of roster) await seed(person);
  console.log(DRY_RUN ? '\nDry run — nothing written.' : '\nDone.');
}

run().catch((err) => { console.error('\nSeed failed:', err.message); process.exit(1); });
