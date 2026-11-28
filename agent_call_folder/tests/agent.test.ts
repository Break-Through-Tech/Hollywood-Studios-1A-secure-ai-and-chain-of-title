// End-to-end tests of researchPerson() with a scripted model and fake web.
// They check the wiring (tools, step limit, structured output, clean-up)
// without network access or API keys.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { researchPerson } from "../agentapicall.js";
import { fakeWeb, scriptedModel, credit } from "./helpers.js";

const WIKI = "https://en.wikipedia.org/wiki/Zendaya";
const HBO = "https://www.hbo.com/euphoria";

describe("researchPerson (offline, scripted model)", () => {
  test("happy path: search, read pages, return cleaned findings", async () => {
    const { web, calls } = fakeWeb();
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      [
        { tool: "readpage", input: { url: WIKI } },
        { tool: "readpage", input: { url: HBO } },
      ],
      {
        json: {
          personName: "Zendaya",
          findings: [
            { field: "occupation", value: "Actress", year: null, role: null, workType: null, sourceUrl: WIKI },
            credit("Euphoria", HBO, { year: 2019, role: "Actor (Rue Bennett)", workType: "TV" }),
            credit("Dune", WIKI, { year: 2021, role: "Actor (Chani)", workType: "Film" }),
            credit("Mystery Film", "https://example.com/never-read"), // found by search but never read
          ],
          needsReview: [],
        },
      },
    ]);

    const result = await researchPerson("Zendaya", "actress", { model, web });

    assert.equal(result.personName, "Zendaya");
    assert.deepEqual(
      result.findings.map((f) => f.value),
      ["Actress", "Euphoria", "Dune"],
    );
    assert.equal(result.needsReview.length, 1);
    assert.equal(result.needsReview[0].value, "Mystery Film");
    assert.equal(calls.search.length, 1);
    assert.equal(result.meta.pageReads, 2);
    assert.equal(result.meta.steps, 3);
    assert.ok(result.meta.discoveredUrls.every((u) => !u.includes("imdb.com")));
  });

  test("model calls get_webpages twice: the second search is refused", async () => {
    const { web, calls } = fakeWeb();
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      { tool: "get_webpages", input: {} },
      { json: { personName: "Zendaya", findings: [], needsReview: [] } },
    ]);
    await researchPerson("Zendaya", "actress", { model, web });
    assert.equal(calls.search.length, 1);
  });

  test("model tries a blocked URL: nothing is scraped and the run still completes", async () => {
    const { web, calls } = fakeWeb();
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      { tool: "readpage", input: { url: "https://www.imdb.com/name/nm3918035/" } },
      { json: { personName: "Zendaya", findings: [credit("Euphoria", "https://www.imdb.com/x")], needsReview: [] } },
    ]);
    const result = await researchPerson("Zendaya", "actress", { model, web });
    assert.equal(calls.scrape.length, 0);
    assert.equal(result.findings.length, 0);
    assert.equal(result.needsReview.length, 0);
  });

  test("unknown person: empty result is returned, not invented data", async () => {
    const { web } = fakeWeb({ search: async () => [] });
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      { json: { personName: "Zxqvland Okafor", findings: [], needsReview: [] } },
    ]);
    const result = await researchPerson("Zxqvland Okafor", "film industry", { model, web });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.needsReview, []);
  });

  test("model returns JSON in the wrong format: researchPerson throws", async () => {
    const { web } = fakeWeb();
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      { json: { personName: "Zendaya", findings: [{ field: "filmCredit", value: "Euphoria" }] } },
    ]);
    await assert.rejects(researchPerson("Zendaya", "actress", { model, web }));
  });

  test("items the model flags keep their reason in needsReview", async () => {
    const { web } = fakeWeb();
    const model = scriptedModel([
      { tool: "get_webpages", input: {} },
      { tool: "readpage", input: { url: WIKI } },
      {
        json: {
          personName: "Zendaya",
          findings: [credit("Euphoria", WIKI, { year: 2019, role: "Actor", workType: "TV" })],
          needsReview: [{ ...credit("Shake It Up", WIKI), reason: "Year not stated on the page" }],
        },
      },
    ]);
    const result = await researchPerson("Zendaya", "actress", { model, web });
    assert.equal(result.findings.length, 1);
    assert.equal(result.needsReview[0].value, "Shake It Up");
    assert.equal(result.needsReview[0].reason, "Year not stated on the page");
  });

  test("rejects an empty name before spending anything", async () => {
    const { web, calls } = fakeWeb();
    await assert.rejects(researchPerson(" ", "actress", { model: scriptedModel([]), web }), /name/);
    assert.equal(calls.search.length, 0);
  });

  test("clear error when the gateway key is missing", async () => {
    const saved = { gw: process.env.AI_GATEWAY_API_KEY, oidc: process.env.VERCEL_OIDC_TOKEN };
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    try {
      await assert.rejects(researchPerson("Zendaya", "actress", { web: fakeWeb().web }), /AI_GATEWAY_API_KEY/);
    } finally {
      if (saved.gw !== undefined) process.env.AI_GATEWAY_API_KEY = saved.gw;
      if (saved.oidc !== undefined) process.env.VERCEL_OIDC_TOKEN = saved.oidc;
    }
  });
});
