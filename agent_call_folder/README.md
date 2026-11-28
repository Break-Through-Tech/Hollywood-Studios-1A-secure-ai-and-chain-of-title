# Credit research agent

Finds a person's public film/TV credits from their name and a hint, so they can review and approve their credit history instead of typing it in.

## Setup

```bash
cd agent_call_folder
npm install
cp .env.example .env     # then fill in FIRECRAWL_API_KEY and AI_GATEWAY_API_KEY
```

## Commands

| Command | What it does | Costs money? |
|---|---|---|
| `npm test` | Offline tests: fake web + scripted model | No |
| `npm run typecheck` | TypeScript check | No |
| `npm run try -- "Zendaya" "actress"` | Researches one person and prints the JSON | Yes (1 run) |
| `npm run test:live` | Runs every live test case twice and writes CSVs | Yes (12 runs) |
| `RUNS=1 ONLY=zendaya npm run test:live` | Runs one live case once | Yes (1 run) |

## How it works

```
researchPerson(name, hint)
  │
  ├─ model (AGENT_MODEL, default openai/gpt-4.1-mini, via Vercel AI Gateway) decides which tool to call
  │    ├─ get_webpages  → Firecrawl search (once), blocked domains removed, ≤5 URLs
  │    └─ readpage      → Firecrawl scrape of one of those URLs (≤3 pages)
  │
  ├─ model returns JSON matching CareerFindingsSchema
  │
  └─ sanitizeResult() enforces the rules in code:
       • a finding whose source page was never read → moved to needsReview
       • blocked / malformed source URLs, empty values → dropped
       • duplicates and impossible years → removed
```

All code is in `agentapicall.ts`. Each call to `researchPerson` gets its own usage counters, so concurrent and repeated calls don't affect each other.

## Output format

```json
{
  "personName": "Zendaya",
  "findings": [
    { "field": "occupation", "value": "Actress", "year": null, "role": null, "workType": null,
      "sourceUrl": "https://en.wikipedia.org/wiki/Zendaya" },
    { "field": "credit", "value": "Euphoria", "year": 2019, "role": "Actor (Rue Bennett)", "workType": "TV",
      "sourceUrl": "https://en.wikipedia.org/wiki/Zendaya" }
  ],
  "needsReview": [
    { "field": "credit", "value": "Some Film", "year": 2018, "role": "Writer", "workType": "Film",
      "sourceUrl": "https://example.com/page", "reason": "May be a different person with the same name" }
  ],
  "meta": { "model": "...", "steps": 4, "searchCalls": 1, "pageReads": 2, "discoveredUrls": [], "readUrls": [] }
}
```

- `field` is one of `occupation | affiliation | credit | achievement | other`.
- `workType` is one of `Film | TV | Music Video | Short | Web Series | Other`, the same list the hsi app uses.
- `meta` is for debugging and tests. The UI can ignore it.

## Blocked sites

`BLOCKED_DOMAINS` lists sites whose terms prohibit scraping or automated collection (IMDb, LinkedIn, Meta, X, TikTok, and others). Entries marked "verify" are there to be safe. Have someone check each site's current terms before launch. Wikipedia text is CC BY-SA, so commercial use is allowed with attribution, which the `sourceUrl` makes possible.

## Troubleshooting

| Error / symptom | Cause | Fix |
|---|---|---|
| `AI_GATEWAY_API_KEY is not set` | Missing gateway key | Add it to `.env` (from vercel.com → AI Gateway → API keys). |
| `FIRECRAWL_API_KEY is not set` | Missing Firecrawl key | Add it to `.env` (from firecrawl.dev dashboard). |
| `401` / `Unauthorized` / `Invalid API key` | Wrong or expired key | Make a new key. Check for extra spaces or quotes in `.env`. |
| `Free tier users do not have access to this model` | Model needs paid gateway credits | Set `AGENT_MODEL` in `.env` to a free-tier model (e.g. `openai/gpt-4.1-mini`, `google/gemini-2.5-flash`), or add credits. |
| `402` / `Payment required` / credits error | Out of Firecrawl or gateway credits | Top up, or lower `RUNS` when running live tests. |
| `429` / rate limit | Too many requests | Wait and retry. Use `RUNS=1`. |
| `No output generated` / `NoOutputGeneratedError` | Model ran out of steps before answering, or answered in plain text | Raise `LIMITS.maxSteps`. Run `npm run try` and check `meta.steps`. |
| Schema / `type validation` error | Model's JSON didn't match the schema | Usually a one-off: retry. If it keeps happening, simplify the schema or tighten the prompt. |
| Findings empty for a well-known person | Search found only blocked sites, or the scrapes failed | Check `meta.discoveredUrls` and `meta.readUrls`. Try a more specific hint. |
| Everything ends up in `needsReview` with "source page was not read" | Model cited URLs it didn't read | Expected behaviour (the code is protecting you). If it happens a lot, tighten the prompt. |
| Wrong person's credits | Ambiguous name | Use a more specific hint (a known title or role). Add a `forbiddenTerms` case to `test_script.ts`. |
| `Cannot find module` | Dependencies not installed | Run `npm install`. |

## Tests

**Offline (`npm test`)**: 29 tests that need no keys and run in under a second. Run them before every commit.
- URL policy: blocked domains, subdomains, look-alike domains, malformed URLs
- Tool limits: one search, three reads, only URLs the search returned, failed scrapes don't crash the run, each session has its own counters
- Output format: valid JSON accepted, wrong `field` values and extra keys rejected
- Cleanup rules: unread sources go to review, blocked sources dropped, duplicates removed
- End to end with a scripted model: normal run, model ignoring the limits, unknown person, malformed model output, missing key

**Live (`npm run test:live`)**: real people, real web. Each run is checked automatically for valid schema, no blocked sources, every finding citing a page that was read, staying within limits, recall of known credits, and no credits from a similarly named person. Then open `test_results_findings.csv` and mark by hand whether each finding is supported by its source and is about the right person. That gives you precision.

## Used by the app (hsi)

The `/credits/import` page in `hsi/` runs this agent and lets the member confirm or remove each credit.

- `hsi/api/profile/credits/_research.ts` calls `researchPerson()` and turns the result into the review format (`CreditSuggestion` in `hsi/api/profile/credits/_suggestions.ts`). It saves nothing.
- `hsi/api/profile/credits/_add.ts` appends the confirmed credits to the profile and skips ones already there.
- In `npm run dev`, the hsi dev server reads `AI_GATEWAY_API_KEY`, `FIRECRAWL_API_KEY` and `AGENT_MODEL` from this folder's `.env`. Values in `hsi/.env.local` take priority.
- If you change the agent's output format, update `toSuggestions()` and run `npm run test:credits` in `hsi/`.
