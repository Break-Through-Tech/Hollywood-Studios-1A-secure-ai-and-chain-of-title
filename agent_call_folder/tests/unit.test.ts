// Offline tests for the pieces the agent is built from. Free and fast.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedUrl,
  normalizeUrl,
  createResearchSession,
  sanitizeResult,
  buildPrompt,
  buildSearchQuery,
  CareerFindingsSchema,
  LIMITS,
  type CareerFindings,
} from "../agentapicall.js";
import { fakeWeb, PAGES, credit } from "./helpers.js";

// The tools' execute() takes a second "options" argument from the SDK; tests don't need it.
const run = (t: { execute?: Function }, input: object = {}) => t.execute!(input, {} as never);

describe("URL policy (isAllowedUrl)", () => {
  test("allows normal web pages", () => {
    assert.equal(isAllowedUrl("https://en.wikipedia.org/wiki/Zendaya"), true);
    assert.equal(isAllowedUrl("http://variety.com/2024/film/news/x"), true);
  });

  test("blocks listed domains and their subdomains", () => {
    assert.equal(isAllowedUrl("https://www.imdb.com/name/nm1"), false);
    assert.equal(isAllowedUrl("https://m.imdb.com/name/nm1"), false);
    assert.equal(isAllowedUrl("https://IMDB.COM./name/nm1"), false); // case + trailing dot
    assert.equal(isAllowedUrl("https://www.linkedin.com/in/someone"), false);
  });

  test("does not block look-alike domains", () => {
    assert.equal(isAllowedUrl("https://notimdb.com/page"), true);
    assert.equal(isAllowedUrl("https://imdb.com.example.org/page"), true);
  });

  test("rejects non-web and malformed URLs", () => {
    assert.equal(isAllowedUrl("ftp://example.com/file"), false);
    assert.equal(isAllowedUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedUrl("not a url"), false);
    assert.equal(isAllowedUrl(""), false);
  });

  test("a custom block list can be passed in", () => {
    assert.equal(isAllowedUrl("https://www.backstage.com/u/someone", ["backstage.com"]), false);
    assert.equal(isAllowedUrl("https://en.wikipedia.org/wiki/X", ["backstage.com"]), true);
  });

  test("normalizeUrl treats trivially different spellings as the same page", () => {
    assert.equal(normalizeUrl("https://Example.com/a/"), normalizeUrl("https://example.com/a#section"));
  });
});

describe("tools enforce their limits", () => {
  test("search filters blocked domains and caps results", async () => {
    const { web } = fakeWeb();
    const { tools } = createResearchSession("Zendaya", "actress", web);
    const out = await run(tools.get_webpages);
    assert.ok(out.pages.length <= LIMITS.searchResults);
    assert.ok(out.pages.every((p: { url: string }) => !p.url.includes("imdb.com")));
  });

  test("search runs only once per session", async () => {
    const { web, calls } = fakeWeb();
    const { tools } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    const second = await run(tools.get_webpages);
    assert.match(second.error, /limit/i);
    assert.equal(calls.search.length, 1);
  });

  test("search query is built from name and hint, not by the model", async () => {
    const { web, calls } = fakeWeb();
    const { tools } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    assert.equal(calls.search[0], buildSearchQuery("Zendaya", "actress"));
    assert.match(calls.search[0], /"Zendaya"/);
  });

  test("readpage refuses URLs the search did not return", async () => {
    const { web, calls } = fakeWeb();
    const { tools } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    const out = await run(tools.readpage, { url: "https://evil.example.com/" });
    assert.match(out.error, /not allowed/i);
    assert.equal(calls.scrape.length, 0);
  });

  test("readpage refuses blocked domains even if requested directly", async () => {
    const { web, calls } = fakeWeb();
    const { tools } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    const out = await run(tools.readpage, { url: "https://www.imdb.com/name/nm3918035/" });
    assert.match(out.error, /not allowed/i);
    assert.equal(calls.scrape.length, 0);
  });

  test("readpage stops after the page limit", async () => {
    const many = Array.from({ length: 5 }, (_, i) => `https://site${i}.example.com/`);
    const { web, calls } = fakeWeb({
      search: async () => many.map((url) => ({ url, title: url })),
      scrape: async (url) => {
        calls.scrape.push(url);
        return "some text";
      },
    });
    const { tools } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    const results = [];
    for (const url of many) results.push(await run(tools.readpage, { url }));
    assert.equal(calls.scrape.length, LIMITS.pageReads);
    assert.match(results[LIMITS.pageReads].error, /limit/i);
  });

  test("a failing scrape returns an error instead of crashing the agent", async () => {
    const { web } = fakeWeb({ scrape: async () => { throw new Error("timeout"); } });
    const { tools, state } = createResearchSession("Zendaya", "actress", web);
    await run(tools.get_webpages);
    const out = await run(tools.readpage, { url: Object.keys(PAGES)[0] });
    assert.match(out.error, /timeout/);
    assert.equal(state.readUrls.size, 0);
  });

  test("each session has its own counters (regression: shared module-level state)", async () => {
    const a = createResearchSession("Zendaya", "actress", fakeWeb().web);
    await run(a.tools.get_webpages);
    const b = createResearchSession("Nathan Fielder", "comedian", fakeWeb().web);
    const out = await run(b.tools.get_webpages);
    assert.ok(out.pages, "second session should be able to search");
  });
});

describe("prompt", () => {
  test("includes the name and hint", () => {
    const p = buildPrompt("Nathan Fielder", "Nathan for You");
    assert.match(p, /Nathan Fielder/);
    assert.match(p, /Nathan for You/);
  });
});

describe("output format (CareerFindingsSchema)", () => {
  test("accepts a well-formed result", () => {
    const ok = CareerFindingsSchema.safeParse({
      personName: "Zendaya",
      findings: [
        { field: "occupation", value: "Actress", year: null, role: null, workType: null, sourceUrl: "https://a.com" },
        credit("Euphoria", "https://a.com", { year: 2019, role: "Actor (Rue Bennett)", workType: "TV" }),
      ],
      needsReview: [],
    });
    assert.equal(ok.success, true);
  });

  test("rejects unknown fields, unknown 'field' values, and missing keys", () => {
    const base = { personName: "X", findings: [], needsReview: [] };
    assert.equal(CareerFindingsSchema.safeParse({ ...base, extra: 1 }).success, false);
    assert.equal(
      CareerFindingsSchema.safeParse({ ...base, findings: [credit("T", "https://a.com", { field: "filmCredit" })] }).success,
      false,
    );
    assert.equal(CareerFindingsSchema.safeParse({ personName: "X", findings: [] }).success, false);
  });
});

describe("sanitizeResult (rules enforced in code)", () => {
  const read = new Set([normalizeUrl("https://en.wikipedia.org/wiki/Zendaya")]);
  const raw = (findings: unknown[], needsReview: unknown[] = []) =>
    ({ personName: " Zendaya ", findings, needsReview }) as CareerFindings;

  test("keeps findings whose source was read", () => {
    const out = sanitizeResult(raw([credit("Euphoria", "https://en.wikipedia.org/wiki/Zendaya/")]), read);
    assert.equal(out.findings.length, 1);
    assert.equal(out.personName, "Zendaya");
  });

  test("moves findings citing an unread page to needsReview", () => {
    const out = sanitizeResult(raw([credit("Dune", "https://example.com/never-read")]), read);
    assert.equal(out.findings.length, 0);
    assert.equal(out.needsReview.length, 1);
    assert.match(out.needsReview[0].reason, /not read/);
  });

  test("drops blocked or malformed sources and empty values", () => {
    const out = sanitizeResult(
      raw([
        credit("Euphoria", "https://www.imdb.com/title/tt8772296/"),
        credit("Euphoria", "not-a-url"),
        credit("   ", "https://en.wikipedia.org/wiki/Zendaya"),
      ]),
      read,
    );
    assert.equal(out.findings.length + out.needsReview.length, 0);
  });

  test("removes duplicates and impossible years", () => {
    const src = "https://en.wikipedia.org/wiki/Zendaya";
    const out = sanitizeResult(
      raw([credit("Euphoria", src, { year: 2019 }), credit("euphoria ", src, { year: 2019 }), credit("Dune", src, { year: 20211 })]),
      read,
    );
    assert.equal(out.findings.length, 2);
    assert.equal(out.findings[1].year, null);
  });
});
