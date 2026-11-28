/**
 * Shared Wikidata / Wikipedia fetching used by the directory seed scripts.
 *
 * Nothing here writes to the database — callers own persistence. Responses are
 * cached to a gitignored file so re-runs don't re-hit the public endpoints.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UA = 'HSI-Seed-Script/1.0 (https://hollywoodstudios.ai; contact: m@prowco.ai)';

// ── cache ──────────────────────────────────────────────────────────
let cachePath = resolve(ROOT, 'seed-cache.local.json');
let cache = {};
let dirty = false;
let flushTimer = null;

export function initCache(filename, { refresh = false } = {}) {
  cachePath = resolve(ROOT, filename);
  cache = !refresh && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  return Object.keys(cache).length;
}

export function flushCache() {
  if (!dirty) return;
  writeFileSync(cachePath, JSON.stringify(cache));
  dirty = false;
}

/** Writes are batched — rewriting a multi-MB cache on every entry dominates runtime. */
async function cached(key, fn) {
  if (cache[key] !== undefined) return cache[key];
  const value = await fn();
  cache[key] = value;
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushCache(); }, 5000);
  return value;
}

// ── endpoints ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sparql(query, { attempts = 4 } = {}) {
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), {
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
      });
    } catch {
      await sleep(2000 * (i + 1));
      continue;
    }
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (i + 1)); continue; }
    throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error(`SPARQL failed after ${attempts} attempts`);
}

export const qidOf = (uri) => uri.split('/').pop();
export const val = (b, k) => b[k]?.value || null;

// Adult-industry exclusions, shared by discovery and filmography. Q488111
// pornographic film actor, Q17456089 director, Q17456111 producer; Q185529 the
// films themselves, matched as both instance-of and genre.
const ADULT_OCCUPATIONS = ['Q488111', 'Q17456089', 'Q17456111'];
const ADULT_PERSON_FILTER = ADULT_OCCUPATIONS
  .map((q) => `FILTER NOT EXISTS { ?p wdt:P106 wd:${q} }`).join('\n      ');
const adultFilmFilter = (v) =>
  `FILTER NOT EXISTS { ${v} wdt:P31 wd:Q185529 }\n      FILTER NOT EXISTS { ${v} wdt:P136 wd:Q185529 }`;

// People screened per phase-2 query. The film join costs roughly 110ms per
// candidate, so 200 lands near 20s — comfortably inside WDQS's 60s ceiling,
// where 400 (~43s) leaves no headroom for a slow day.
const SCREEN_BATCH = 200;

/**
 * Phase 1 — the most-linked practitioners of an occupation, ranked by
 * cross-language sitelinks. No film join, so it stays cheap even at several
 * thousand rows.
 */
function fetchCandidates({ occupation, minSitelinks, limit, cacheKey }) {
  return cached(`candidates:v1:${cacheKey}:${minSitelinks}:${limit}`, async () => {
    const rows = await sparql(`
      SELECT ?p ?fm WHERE {
        ?p wdt:P106 wd:${occupation} ;
           wdt:P31 wd:Q5 ;
           wikibase:sitelinks ?fm .
        FILTER(?fm > ${minSitelinks})
      }
      ORDER BY DESC(?fm)
      LIMIT ${limit}`);
    return rows.map((r) => ({ qid: qidOf(val(r, 'p')), fame: Number(val(r, 'fm')) }));
  });
}

/**
 * Phase 2 — of a bounded candidate set, who actually practises the role, with
 * their credit count and English label. Cached per batch, so an interrupted
 * discovery pass resumes where it stopped.
 */
function screenCandidates(qids, { filmProp, minFilms }) {
  return cached(`practice:v1:${filmProp}:${minFilms}:${qids.join(',')}`, async () => {
    const rows = await sparql(`
      SELECT ?p ?pLabel (COUNT(DISTINCT ?f) AS ?films) WHERE {
        VALUES ?p { ${qids.map((q) => `wd:${q}`).join(' ')} }
        ?p rdfs:label ?pLabel . FILTER(LANG(?pLabel) = "en")
        FILTER NOT EXISTS { ?p wdt:P570 ?d . FILTER(YEAR(?d) < 1930) }
        FILTER NOT EXISTS { ?p wdt:P106 wd:Q82955 }
      ${ADULT_PERSON_FILTER}
        ?f wdt:${filmProp} ?p ; wdt:P31 wd:Q11424 .
        FILTER NOT EXISTS { ?f wdt:P31 wd:Q93204 }
        FILTER NOT EXISTS { ?f wdt:P136 wd:Q93204 }
      ${adultFilmFilter('?f')}
      }
      GROUP BY ?p ?pLabel
      HAVING (COUNT(DISTINCT ?f) >= ${minFilms})`);
    return rows.map((r) => ({
      qid: qidOf(val(r, 'p')),
      name: val(r, 'pLabel'),
      roleFilms: Number(val(r, 'films')),
    }));
  });
}

/**
 * Notable people in one profession who actually practise it, ranked by
 * cross-language notability. minFilms keeps out incidental credits — the
 * novelist with one adaptation, the musician whose song was licensed.
 *
 * Ranking and the film-count floor are two queries, not one: WDQS times out
 * joining every film to every practitioner of an occupation, so candidates are
 * ranked first and only then screened, `SCREEN_BATCH` at a time, stopping as
 * soon as `limit` of them qualify. `candidateFactor` is the over-fetch for
 * phase 1 — roughly 70% of ranked candidates clear a minFilms of 10.
 *
 * Adult-industry people and films are excluded on both sides: the deeper a run
 * goes down the notability list, the more of them the raw occupation pool has.
 */
export async function discoverPeople({
  occupation, filmProp, minSitelinks, minFilms, limit, cacheKey, candidateFactor = 2,
}) {
  const candidates = await fetchCandidates({
    occupation, minSitelinks, limit: Math.ceil(limit * candidateFactor), cacheKey,
  });
  const fameOf = new Map(candidates.map((c) => [c.qid, c.fame]));
  const found = [];
  for (let i = 0; i < candidates.length && found.length < limit; i += SCREEN_BATCH) {
    const batch = candidates.slice(i, i + SCREEN_BATCH).map((c) => c.qid);
    for (const p of await screenCandidates(batch, { filmProp, minFilms })) {
      found.push({ ...p, fame: fameOf.get(p.qid) ?? 0 });
    }
    process.stdout.write(
      `\r    ${cacheKey}: screened ${Math.min(i + SCREEN_BATCH, candidates.length)}/${candidates.length}` +
      ` — ${found.length} qualify   `);
  }
  if (candidates.length) process.stdout.write('\n');
  return found.sort((a, b) => b.fame - a.fame).slice(0, limit);
}

/** Headshot, birth, origin and occupations for a batch of people. */
export function fetchDetails(qids) {
  return cached(`details:v3:${qids.join(',')}`, async () => {
    const values = qids.map((q) => `wd:${q}`).join(' ');
    const rows = await sparql(`
      SELECT ?p (SAMPLE(?img) AS ?image) (SAMPLE(?birth) AS ?born)
             (SAMPLE(?bpLabel) AS ?birthPlace) (SAMPLE(?bcLabel) AS ?birthCountry)
             (GROUP_CONCAT(DISTINCT ?occLabel; separator="|") AS ?occupations)
             (SAMPLE(?article) AS ?article) WHERE {
        VALUES ?p { ${values} }
        OPTIONAL { ?p wdt:P18 ?img }
        OPTIONAL { ?p wdt:P569 ?birth }
        OPTIONAL { ?p wdt:P19 ?bp . ?bp rdfs:label ?bpLabel . FILTER(LANG(?bpLabel)="en") }
        OPTIONAL {
          ?p wdt:P19 ?bp2 . ?bp2 wdt:P17 ?bc .
          FILTER NOT EXISTS { ?bc wdt:P576 ?dis }
          ?bc rdfs:label ?bcLabel . FILTER(LANG(?bcLabel)="en")
        }
        OPTIONAL { ?p wdt:P106 ?occ . ?occ rdfs:label ?occLabel . FILTER(LANG(?occLabel)="en") }
        OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
      }
      GROUP BY ?p`);
    const out = {};
    for (const r of rows) {
      out[qidOf(val(r, 'p'))] = {
        image: val(r, 'image'),
        born: val(r, 'born'),
        birthPlace: val(r, 'birthPlace'),
        birthCountry: val(r, 'birthCountry'),
        occupations: (val(r, 'occupations') || '').split('|').filter(Boolean),
        article: val(r, 'article'),
      };
    }
    return out;
  });
}

/**
 * A person's films in one role. `characterQualifier` pulls the played character
 * for cast credits; other roles get a fixed role label.
 *
 * `order` picks what "best" means when a filmography is longer than `limit`:
 * 'fame' takes the most-linked films, 'recent' the most recently released.
 * Films with no release date sort last either way.
 */
export function fetchFilmography(qid, filmProp, limit, { characterQualifier = false, order = 'fame' } = {}) {
  return cached(`films:v3:${qid}:${filmProp}:${limit}:${order}`, async () => {
    const charBlock = characterQualifier
      ? `OPTIONAL { ?film p:${filmProp} ?st . ?st ps:${filmProp} wd:${qid} ; pq:P453 ?c .
                    ?c rdfs:label ?charLabel . FILTER(LANG(?charLabel)="en") }`
      : '';
    const charSelect = characterQualifier ? '(SAMPLE(?charLabel) AS ?character)' : '';
    const orderBy = order === 'recent' ? 'DESC(MIN(?y)) DESC(SAMPLE(?sl))' : 'DESC(SAMPLE(?sl))';
    const rows = await sparql(`
      SELECT ?film ?filmLabel (MIN(?y) AS ?year) (SAMPLE(?img) AS ?image) (SAMPLE(?sl) AS ?fame)
             (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres) ${charSelect} WHERE {
        ?film wdt:${filmProp} wd:${qid} ;
              wdt:P31 wd:Q11424 ;
              wikibase:sitelinks ?sl ;
              rdfs:label ?filmLabel .
        FILTER(LANG(?filmLabel) = "en")
        FILTER NOT EXISTS { ?film wdt:P31 wd:Q93204 }
        ${adultFilmFilter('?film')}
        OPTIONAL { ?film wdt:P577 ?d . BIND(YEAR(?d) AS ?y) }
        OPTIONAL { ?film wdt:P18 ?img }
        OPTIONAL { ?film wdt:P136 ?g . ?g rdfs:label ?genreLabel . FILTER(LANG(?genreLabel)="en") }
        ${charBlock}
      }
      GROUP BY ?film ?filmLabel
      ORDER BY ${orderBy}
      LIMIT ${limit}`);
    return rows.map((r) => ({
      qid: qidOf(val(r, 'film')),
      title: val(r, 'filmLabel'),
      year: val(r, 'year') ? Number(val(r, 'year')) : null,
      image: val(r, 'image'),
      genres: (val(r, 'genres') || '').split('|').filter(Boolean),
      character: val(r, 'character'),
      fame: Number(val(r, 'fame')),
    }));
  });
}

/** Wikipedia lead paragraph and short descriptor, for bio and headline. */
export function fetchSummary(articleUrl) {
  if (!articleUrl) return Promise.resolve(null);
  const title = decodeURIComponent(articleUrl.split('/wiki/')[1] || '');
  if (!title) return Promise.resolve(null);
  return cached(`summary:${title}`, async () => {
    try {
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
    } catch { return null; }
  });
}

/** Licence and author for Commons files, so seeded photos carry attribution. */
export function fetchImageCredits(filenames) {
  if (filenames.length === 0) return Promise.resolve({});
  return cached(`credits:${filenames.join('|')}`, async () => {
    const titles = filenames.map((f) => `File:${decodeURIComponent(f.split('/').pop())}`).join('|');
    try {
      const res = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
        `&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`, { headers: { 'User-Agent': UA } });
      if (!res.ok) return {};
      const pages = (await res.json()).query?.pages || {};
      const out = {};
      const strip = (html) => (html || '').replace(/<[^>]*>/g, '').trim();
      for (const page of Object.values(pages)) {
        const meta = page.imageinfo?.[0]?.extmetadata;
        if (!meta) continue;
        const parts = [strip(meta.Artist?.value), strip(meta.LicenseShortName?.value)].filter(Boolean);
        out[page.title.replace(/^File:/, '')] = parts.join(' · ') || null;
      }
      return out;
    } catch { return {}; }
  });
}

// ── shaping ────────────────────────────────────────────────────────
export const commonsUrl = (p18, width = 500) =>
  p18 ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decodeURIComponent(p18.split('/').pop()))}?width=${width}` : null;

export function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function randomSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** "war film" -> "War", "romantic comedy film" -> "Romantic Comedy" */
export function cleanGenre(g) {
  const base = g.replace(/\s+films?$/i, '').replace(/-related$/i, '').trim();
  if (!base) return null;
  return base.split(' ').map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

const OCCUPATION_SKILLS = {
  'film actor': 'Acting', 'actor': 'Acting', 'stage actor': 'Theatre',
  'television actor': 'Television', 'voice actor': 'Voice Acting',
  'film producer': 'Producing', 'television producer': 'Producing',
  'film director': 'Directing', 'television director': 'Directing',
  'screenwriter': 'Screenwriting', 'writer': 'Writing', 'author': 'Writing',
  'composer': 'Composing', 'songwriter': 'Songwriting', 'singer': 'Music',
  'cinematographer': 'Cinematography', 'film editor': 'Editing',
  'production designer': 'Production Design', 'costume designer': 'Costume Design',
  'casting director': 'Casting', 'model': 'Modelling', 'comedian': 'Comedy',
  'dancer': 'Dance', 'choreographer': 'Choreography',
  'stunt performer': 'Stunts', 'martial artist': 'Martial Arts',
  'businessperson': 'Business', 'entrepreneur': 'Business',
};

export function deriveSkills(occupations, primarySkill) {
  const skills = new Set(primarySkill ? [primarySkill] : []);
  for (const occ of occupations) {
    const skill = OCCUPATION_SKILLS[occ.toLowerCase()];
    if (skill) skills.add(skill);
  }
  return [...skills].slice(0, 6);
}

export const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
