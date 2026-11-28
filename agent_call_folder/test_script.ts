// LIVE evaluation against the real web + model. Costs credits on every run:
// per run, 1 Firecrawl search + up to 3 page scrapes + model tokens.
//
//   npm run test:live                 # all cases, RUNS_PER_PERSON times each
//   RUNS=1 ONLY=zendaya npm run test:live
//
// Writes test_results_summary.csv (one row per run) and
// test_results_findings.csv (one row per finding, for checking by hand).
import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  researchPerson,
  isAllowedUrl,
  normalizeUrl,
  CareerFindingsSchema,
  type ResearchResult,
} from "./agentapicall.js";

// ---------- CONFIG ----------
const RUNS_PER_PERSON = Number(process.env.RUNS ?? 2); // repeat runs to check stability
const ONLY = process.env.ONLY; // run a single test case by label

type TestCase = {
  label: string;
  name: string;
  hint: string;
  expectedCredits?: string[]; // known titles; matched case-insensitively against credit values
  expectEmpty?: boolean; // obscure people: findings must be empty (needsReview may have items)
  forbiddenTerms?: string[]; // must NOT appear in any finding
};

// ---------- TEST CASES ----------
const TESTS: TestCase[] = [
  {
    label: "nathan-correct-hint",
    name: "Nathan Fielder",
    hint: "comedian, writer, Nathan for You",
    expectedCredits: ["Nathan for You", "The Rehearsal", "The Curse"],
  },
  {
    // An unusual hint: does the agent still identify the right person?
    label: "nathan-holmes-hint",
    name: "Nathan Fielder",
    hint: "Elizabeth Holmes",
    expectedCredits: ["You Can See Everything"],
  },
  {
    label: "zendaya",
    name: "Zendaya",
    hint: "actress",
    expectedCredits: ["Euphoria", "Spider-Man", "Dune", "Challengers"],
  },
  {
    // Similar name: Nathan Fillion vs Nathan Fielder. Must not mix credits.
    label: "similar-name",
    name: "Nathan Fillion",
    hint: "actor",
    expectedCredits: ["Castle", "Firefly", "The Rookie"],
    forbiddenTerms: ["Nathan for You", "The Rehearsal", "Elizabeth Holmes"],
  },
  {
    // A director: credits should come back with role "Director" / "Writer".
    label: "director",
    name: "Greta Gerwig",
    hint: "director, Lady Bird",
    expectedCredits: ["Lady Bird", "Little Women", "Barbie"],
  },
  {
    // Same name as a famous athlete: the hint must keep the agent on the actor.
    label: "athlete-name-clash",
    name: "Michael B. Jordan",
    hint: "actor, Creed",
    expectedCredits: ["Creed", "Black Panther", "Fruitvale Station"],
    forbiddenTerms: ["Chicago Bulls", "Space Jam"],
  },
  {
    // Made-up person: nothing should be invented.
    label: "obscure",
    name: "Zxqvland Pemberton Okafor",
    hint: "film industry",
    expectEmpty: true,
  },
  {
    // Plausible invented name with a film hint. Any same-name match belongs in needsReview.
    label: "obscure-not-in-film",
    name: "Dorothy Wexler-Nakamura",
    hint: "film director",
    expectEmpty: true,
  },
  {
  label: "my-test",                          // used with ONLY=my-test
  name: "Pedro Pascal",
  hint: "actor, The Last of Us",
  expectedCredits: ["The Last of Us", "The Mandalorian", "Narcos"],
  forbiddenTerms: [],                        // words that must NOT show up
},
{
  label: "my-test",                          // used with ONLY=my-test
  name: "Trevor Noah",
  hint: "comedian, The Daily Show",
  expectedCredits: ["Trevor Noah: Afraid of the Dark", "Trevor Noah: Son of Patricia", "The Daily Show with Trevor Noah"],
  forbiddenTerms: [],                        // words that must NOT show up
},
];

// ---------- HELPERS ----------
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (data: Record<string, unknown>[]) =>
  data.length
    ? [Object.keys(data[0]).join(","), ...data.map((r) => Object.values(r).map(csv).join(","))].join("\n")
    : "";

function checkRun(t: TestCase, out: ResearchResult) {
  const { findings, needsReview, meta } = out;
  const read = new Set(meta.readUrls.map(normalizeUrl));

  const schemaOk = CareerFindingsSchema.safeParse({ personName: out.personName, findings, needsReview }).success;
  const blockedHits = [...findings, ...needsReview].filter((f) => !isAllowedUrl(f.sourceUrl)).length;
  const unreadSources = findings.filter((f) => !read.has(normalizeUrl(f.sourceUrl))).length;
  const withinLimits = meta.searchCalls <= 1 && meta.pageReads <= 3;

  const creditBlob = findings
    .filter((f) => f.field === "credit")
    .map((f) => f.value.toLowerCase())
    .join(" | ");
  const allBlob = findings.map((f) => `${f.value} ${f.role ?? ""}`.toLowerCase()).join(" | ");

  let recall = "";
  if (t.expectedCredits?.length) {
    const hits = t.expectedCredits.filter((c) => creditBlob.includes(c.toLowerCase()));
    recall = `${hits.length}/${t.expectedCredits.length}`;
  }
  const forbiddenHits = (t.forbiddenTerms ?? []).filter((x) => allBlob.includes(x.toLowerCase())).length;

  const pass =
    schemaOk &&
    blockedHits === 0 &&
    unreadSources === 0 &&
    withinLimits &&
    forbiddenHits === 0 &&
    (t.expectEmpty ? findings.length === 0 : findings.length > 0);

  return { pass, schemaOk, blockedHits, unreadSources, withinLimits, forbiddenHits, recall };
}

// ---------- RUN ----------
const rows: Record<string, unknown>[] = [];
const findingRows: Record<string, unknown>[] = [];

async function main() {
  const cases = TESTS.filter((t) => !ONLY || t.label === ONLY);
  if (cases.length === 0) throw new Error(`No test case labelled "${ONLY}"`);

  for (const t of cases) {
    for (let run = 1; run <= RUNS_PER_PERSON; run++) {
      const start = Date.now();
      let out: ResearchResult | null = null;
      let error = "";
      try {
        out = await researchPerson(t.name, t.hint);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const seconds = ((Date.now() - start) / 1000).toFixed(1);
      const checks = out ? checkRun(t, out) : null;

      rows.push({
        label: t.label,
        name: t.name,
        run,
        pass: checks?.pass ?? false,
        error,
        findings: out?.findings.length ?? 0,
        needsReview: out?.needsReview.length ?? 0,
        recall: checks?.recall ?? "",
        forbiddenHits: checks?.forbiddenHits ?? "",
        unreadSources: checks?.unreadSources ?? "",
        blockedHits: checks?.blockedHits ?? "",
        pagesRead: out?.meta.pageReads ?? "",
        steps: out?.meta.steps ?? "",
        seconds,
      });

      for (const [list, items] of [["finding", out?.findings ?? []], ["needsReview", out?.needsReview ?? []]] as const) {
        for (const f of items) {
          findingRows.push({
            label: t.label,
            run,
            list,
            field: f.field,
            value: f.value,
            year: f.year,
            role: f.role,
            workType: f.workType,
            reason: "reason" in f ? f.reason : "",
            sourceUrl: f.sourceUrl,
            supported_by_source: "", // FILL IN BY HAND: yes / no  (precision)
            right_person: "", //        FILL IN BY HAND: yes / no
          });
        }
      }

      console.log(
        `[${checks?.pass ? "PASS" : "FAIL"}] ${t.label} run ${run}: ` +
          `${out?.findings.length ?? 0} findings, ${out?.needsReview.length ?? 0} for review, ` +
          `recall ${checks?.recall || "n/a"}, forbidden ${checks?.forbiddenHits ?? "-"}, ${seconds}s` +
          (error ? `\n    ERROR: ${error}` : ""),
      );
    }
  }

  writeFileSync("test_results_summary.csv", toCsv(rows));
  writeFileSync("test_results_findings.csv", toCsv(findingRows));

  console.table(rows.map(({ error, ...r }) => r));
  console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} runs passed automatic checks.`);
  console.log("Next: open test_results_findings.csv, click each sourceUrl, and fill in the last two columns.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
