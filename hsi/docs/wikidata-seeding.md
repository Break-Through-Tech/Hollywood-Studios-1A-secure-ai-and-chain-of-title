# Seeding the directory from Wikidata

How the public-figure profiles, their filmographies and the movie pages behind
them get into Neon (2,100 profiles / 32,700 films / 65,500 credits as of the
September 2026 pass). Everything is fetched at run time — **no people or
film data is committed to the repo** — so this document plus `scripts/` is the
whole method.

Seeded profiles carry `is_directory = TRUE`, `source = 'wikidata'` and
`source_url = https://www.wikidata.org/wiki/<QID>`. They render read-only with a
reference badge and are excluded from People and connection requests.

---

## Prerequisites

- `DATABASE_URL` in `.env.local` or `.env` (`scripts/_db.mjs` picks the first
  file that actually *defines* the key — `vercel link` writes a `.env.local`
  containing only `VERCEL_OIDC_TOKEN`, so "first file that exists" is wrong).
- `schema.sql` applied. The seed depends on three things in it:
  - `profiles.is_directory / source / source_url / image_attribution`
  - `CREATE UNIQUE INDEX idx_profiles_source_url ON profiles(source_url) WHERE source_url IS NOT NULL`
    — this is what makes a re-run **update** a person instead of duplicating them.
  - `entities.metadata->>'wikidata_id'` — how a film row is recognised on later runs.
- `BLOB_READ_WRITE_TOKEN` only if you run the poster→Blob migration.
- Node 20+. No extra deps beyond what `package.json` already has.

Nothing is rate-limit-exempt: every endpoint call sends the
`HSI-Seed-Script/1.0` User-Agent defined in `scripts/_wikidata.mjs`. Keep a
contact address in it — Wikimedia blocks anonymous bulk clients.

---

## The pipeline

Run in this order. Each step is idempotent and safe to re-run.

```bash
node scripts/seed-people.mjs --dry-run     # 1. inspect the roster, no writes
node scripts/seed-people.mjs               # 2. profiles + movies + credits
node scripts/fetch-posters.mjs             # 3. backfill missing posters
node scripts/resolve-image-urls.mjs        # 4. strip the Special:FilePath hop
node scripts/verify-images.mjs             # 5. audit; add --fix to repair
node scripts/verify-live.mjs               # 6. prove the pages actually render
```

### 1–2. `seed-people.mjs` — the seed itself

```
node scripts/seed-people.mjs                  # 500 people, 20 credits each
node scripts/seed-people.mjs --total=50       # smaller run
node scripts/seed-people.mjs --films=10       # fewer credits per person
node scripts/seed-people.mjs --roles=director,editor
node scripts/seed-people.mjs --dry-run        # fetch + report, no writes
node scripts/seed-people.mjs --refresh        # ignore the response cache
node scripts/seed-people.mjs --pool=8         # widen the discovery pools
node scripts/seed-people.mjs --recent         # newest credits, not best-known
node scripts/seed-people.mjs --min-sitelinks=30 --min-films=10
```

`--pool` is the over-fetch multiplier for discovery (default 3). Exclusions come
off the *top* of each pool — the already-seeded people are the most notable ones
— so the default runs dry on later passes. At 600 people already seeded, a
second 500-person run needs `--pool=8` to fill its quotas.

`--recent` changes what a filmography longer than `--films` gets truncated to:
the most recently released titles instead of the most-linked ones. Credits are
written in that order too, so profiles lead with current work. Films with no
release date sort last either way.

`--min-sitelinks` / `--min-films` override the per-role floors in `ROLES` for
the whole run. They exist because the floors are sized for the *first* pass:
each role has a finite population above its floor, and once the notable tier is
seeded the only way to go deeper is to lower it. Measured actor populations:

| floors (sitelinks / films) | qualifying actors |
| --- | --- |
| 45 / 12 (`ROLES` default) | 1,540 |
| 30 / 10 | 3,579 |
| 20 / 8 | 6,888 |
| 12 / 6 | 13,410 |

So a second 1000-actor pass cannot run at the defaults — 1,540 total against
~550 already seeded. Lower the floor rather than raising `--pool`; a wider pool
of an exhausted population is still exhausted.

Five phases, printed as `1/5 … 5/5`:

1. **Load existing state** — one round trip pulls every profile handle, every
   already-seeded QID, and every movie row keyed by both Wikidata id and
   `title|year`. Doing this per-person instead would be thousands of queries.
2. **Discover** — two SPARQL queries per role (see below), pooled and then
   de-duplicated globally: a person who works in several roles is assigned to
   the role where they have the *most* credits, so polymaths don't consume
   several slots. Pools are over-fetched 3× because dedupe and exclusions eat
   into every pool.
3. **Enrich** — details (photo, birth, occupations, enwiki article) in batches
   of 50, Commons licence credits in batches of 40, then per-person Wikipedia
   summary + filmography. A filmography WDQS will not answer **skips that
   person** rather than throwing: at 1,000 people the loop runs for half an
   hour, and a late failure used to discard every enrichment before it. The
   skipped names are listed at the end of the phase.
4. **Write** — one upsert per profile, missing movie rows created in a single
   multi-row insert, then credits replaced wholesale
   (`DELETE FROM credits WHERE profile_id = …` then insert).
5. **Report** — profiles / new movie pages / credits written.

#### Role table

`ROLES` in `seed-people.mjs` is the knob that decides who gets seeded. Each
entry is:

| field | meaning |
| --- | --- |
| `occupation` | Wikidata occupation QID used to find practitioners |
| `filmProp` | property linking a **film** to this role — the credit itself |
| `share` | portion of `--total` filled from this role |
| `minSitelinks` | notability floor; below-the-line crafts are less famous, so lower |
| `minFilms` | real-practice floor — keeps out incidental credits |
| `department` / `roleName` / `skill` | how the credit renders |

Current roster — `share` (occupation QID → film property):

| role | share | occupation | film property |
| --- | --- | --- | --- |
| actor | .30 | Q10800557 film actor | P161 cast member |
| director | .22 | Q2526255 film director | P57 director |
| producer | .16 | Q3282637 film producer | P162 producer |
| writer | .14 | Q28389 screenwriter | P58 screenwriter |
| composer | .08 | Q36834 composer | P86 composer |
| cinematographer | .06 | Q222344 cinematographer | P344 director of photography |
| editor | .04 | Q7042855 film editor | P1040 film editor |

#### Discovery is two queries, not one

Ranking and the credit-count floor **cannot share a query**. Joining every film
to every practitioner of an occupation and then grouping is too expensive for
WDQS: it returns `504 upstream request timeout` after its 60s ceiling, at any
`LIMIT`, for every role — including at the original `45 / 12` actor floors. So
`discoverPeople()` splits the work:

1. `fetchCandidates()` — practitioners of the occupation above `minSitelinks`,
   ranked by sitelinks. No film join, so it is cheap: 3,000 rows in ~6s.
2. `screenCandidates()` — of a **bounded** set of those candidates, who really
   practises the role, plus their credit count and English label. The film join
   costs ~110ms per candidate, so batches are `SCREEN_BATCH = 200` (~20s, well
   inside the ceiling; 400 takes ~43s and leaves no headroom).

Candidates are screened in notability order and screening stops as soon as
`limit` of them qualify, so the result is the same ranked pool the single query
produced. `candidateFactor` (default 2) is the phase-1 over-fetch — roughly 70%
of ranked candidates clear a `minFilms` of 10. Each batch caches separately, so
an interrupted discovery pass resumes where it stopped.

The filters are deliberately strict — each one removed a class of junk:

- `wdt:P31 wd:Q5` — humans only.
- `?f wdt:<filmProp> ?p` — the person must be linked *from the film by that
  property*. Occupation alone gives you novelists with one adaptation.
- `HAVING COUNT(DISTINCT ?f) >= minFilms` — one-off credits out.
- `FILTER(?s > minSitelinks)` — cross-language sitelink count as the notability
  proxy; it is also the sort key (`ORDER BY DESC(SAMPLE(?s))`).
- `FILTER NOT EXISTS { ?p wdt:P570 ?d . FILTER(YEAR(?d) < 1930) }` — excludes
  anyone who died before 1930; silent-era figures rarely have a usable photo.
- `FILTER NOT EXISTS { ?p wdt:P106 wd:Q82955 }` — excludes politicians.
- `Q93204` filters on the film side, by both `P31` and `P136` — drops
  documentaries, so credits reflect narrative features. `?f wdt:P31 wd:Q11424`
  keeps it to films (not TV episodes or video games).
- **Adult-industry exclusions**, on both sides: `P106` of `Q488111`
  (pornographic film actor), `Q17456089` (director) or `Q17456111` (producer)
  drops the person; `Q185529` (pornographic film) as `P31` or `P136` drops the
  film, in discovery *and* in `fetchFilmography`. These matter more the deeper a
  run goes — the notable tier has almost none, the long tail has plenty. Note
  `Q93204` is *documentary film*; it was never an adult-content filter.

**Adding a role:** append a row to `ROLES` with the right occupation QID and
film property, give it a `share` (shares are normalised, they need not sum to 1),
start `minSitelinks` around 16–25 for a craft role, then run
`--roles=<key> --total=40 --dry-run` and read the pool/quota line. A pool much
smaller than `quota * 3` means the floors are too high.

#### Caching

Every endpoint response is cached to `seed-people-cache.local.json`
(gitignored via `*-cache.local.json`). Writes are batched on a 5s timer —
rewriting a multi-MB cache per entry dominated runtime. Cache keys are
versioned (`details:v3:`, `films:v3:`, `candidates:v1:`, `practice:v1:`) —
**bump the version in
`_wikidata.mjs` when you change a query's SELECT shape**, otherwise old rows
are served for the new query. `--refresh` discards the whole cache.

The cache is also a backup: `restore-avatars.mjs` rebuilds `avatar_url` for
every directory profile straight from the cached detail responses, no
re-querying. That is the recovery path after a bad image repair.

### 3. `fetch-posters.mjs`

Fills `entities.image_url` where it is NULL. Seeded rows carry their Wikidata
id, so the exact enwiki article is resolved through the sitelink (200 QIDs per
SPARQL query) rather than guessed from the title — guessing misses most
foreign-language and long-tail films, which is the bulk of the catalogue. Rows
with no QID fall back to title candidates (`Title (2013 film)`, `Title (film)`,
…) and are rejected unless the summary text actually looks like a film, because
a bare title is usually the novel or the album.

Concurrency is capped at 5; a 429 is retried with `Retry-After`, never treated
as "no poster".

`--limit=N` to do a slice.

### 4. `resolve-image-urls.mjs`

`Special:FilePath` is a redirect endpoint, so every image costs the browser an
extra ~250ms hop. This rewrites stored URLs to the final
`upload.wikimedia.org` target for both `profiles.avatar_url` and
`entities.image_url`. `--dry-run` supported.

**Budget it against the catalogue size.** Serial at ~33 rows/min, a full pass
over 32,700 posters plus 2,100 avatars is over a day; it is worth running on a
few thousand fresh rows, not as a routine step after a large seed.

**This step is cosmetic** — it removes a redirect hop, it does not fix anything
broken. The stored `Special:FilePath` URLs render either way, so a failed or
skipped pass costs latency, never correctness.

**Do not parallelise it.** It is deliberately serial, ~33 rows/min. The
`Special:FilePath` redirect endpoint answers a throttled request with a status
indistinguishable from a genuinely dead file, so a concurrent pass reports live
images as unresolvable: a 6-way run once returned `Resolved 10, failed 2519`,
where the serial retry pass on the same rows returned `Resolved 2519, failed 0`.
`resolve()` honours `Retry-After` and retries on 429/5xx rather than concluding
— the same rule `verify-images.mjs` follows. Nothing is damaged either way (an
unresolved row keeps its working URL), but the pass is wasted and the rate
budget is spent.

### 5. `verify-images.mjs` — the destructive one

A URL in the database is not proof the browser can render it. This walks every
avatar and poster and returns one of three verdicts, never a bare boolean:

- `ok` — 2xx **and** `content-type: image/*`
- `missing` — 404/410, or a 200 whose content-type is HTML (a redirect that
  landed on an error page)
- `unknown` — throttled, timed out, inconclusive → **left strictly alone**

Two guardrails, both learned the hard way: treating a 429 as broken once wiped
hundreds of valid photos, so throttling retries instead of concluding; and
`--fix` refuses to run at all if more than 50% of a set reports missing, which
means an outage, not dead links.

```
node scripts/verify-images.mjs            # report only
node scripts/verify-images.mjs --fix      # repair via Commons, else clear
node scripts/verify-images.mjs --avatars  # or --posters
```

`--fix` asks Commons for a working 500px thumbnail of the same file; if there
isn't one it sets the column NULL so the UI falls back to its placeholder
rather than rendering a broken image.

### 6. `verify-live.mjs`

The database having a row is not proof the page works. This hits the deployed
API and checks what the pages actually depend on:

- every directory profile through `/api/profile/get` — flagged `is_directory`,
  has headline and bio, avatar survived, credit count matches the DB, and no
  credit is missing a `department` (the page groups by it, so a NULL department
  silently drops the credit)
- the 40 busiest movie pages through `/api/entity/get` — cast size matches
- 60 search probes through `/api/search/query` — the person is findable by surname
- `/api/people/list` as a real member — asserts **zero** directory profiles leak
  into the member surface

```
node scripts/verify-live.mjs
node scripts/verify-live.mjs --base=http://localhost:3111
node scripts/verify-live.mjs --sample=50
```

Exits non-zero on any failure.

---

## Optional / situational

| script | when |
| --- | --- |
| `restore-avatars.mjs` | after a bad `--fix` pass — rebuilds photos from the seed caches (`--dry-run` first) |
| `migrate-posters-to-blob.mjs` | move posters off Wikimedia onto Vercel Blob; needs `BLOB_READ_WRITE_TOKEN`, skips rows already on Blob |
| `seed-actors.mjs` | the original actors-only seed, superseded by `seed-people.mjs`; kept because its cache (`seed-actors-cache.local.json`) is still a photo source for `restore-avatars.mjs` |
| `seed-steven-saxton.mjs` | hand-authored real profile, not Wikidata-derived — not part of this pipeline |

---

## Invariants worth not breaking

- **Never commit seed data.** The caches are gitignored; the repo stays free of
  scraped people data and the pipeline stays the source of truth.
- **`source_url` is the identity key.** Re-running is an upsert, not a
  duplicate. Anything that mints profiles without it will duplicate on re-run.
- **Attribution ships with the photo.** `image_attribution` holds
  `Artist · LicenseShortName` from Commons; keep rendering it.
- **Every seeded profile links out** — `media_links` carries the Wikipedia
  article and the Wikidata item.
- **Emails are `<handle>@directory.hsi.invalid`.** `.invalid` is reserved by
  RFC 2606, so these can never collide with or mail a real address. Queries that
  look for real members filter on `email NOT LIKE '%invalid%'`.
- **A person with zero films is skipped**, not written as an empty profile.
- **Postgres caps a statement at 65535 parameters** — `insertRows()` batches at
  `60000 / columns`. Don't replace it with one giant insert.

---

## Full rebuild, from nothing

```bash
psql "$DATABASE_URL" -f schema.sql
node scripts/seed-people.mjs --refresh
node scripts/fetch-posters.mjs
node scripts/resolve-image-urls.mjs
node scripts/verify-images.mjs --fix
node scripts/verify-live.mjs
```

Budget a few hours for `--refresh` at `--total=500`: it is thousands of
individually-rate-limited Wikipedia and SPARQL calls. With a warm cache the
same run is minutes.
