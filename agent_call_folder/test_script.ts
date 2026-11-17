import "dotenv/config";
import { writeFileSync } from "node:fs";
// ASSUMES agentapicall.ts exports:
//   researchPerson(name: string, hint: string)
// returning { personName, findings: [{field, value, sourceUrl}], needsReview?: any[] }
import { researchPerson } from "./agentapicall";

// ---------- CONFIG ----------
const RUNS_PER_PERSON = 2; // repeat runs to check stability
const BLOCKED_DOMAINS = ["imdb.com", "linkedin.com"];

type TestCase = {
  label: string;
  name: string;
  hint: string;
  expectedCredits?: string[]; // known titles; matched case-insensitively in finding values
  expectEmpty?: boolean; // true for obscure people: nothing should be invented
  forbiddenTerms?: string[]; // must NOT appear in any finding (optional)
};

// ---------- TEST CASES ----------
const TESTS: TestCase[] = [
  {
    label: "nathan-correct-hint",
    name: "Nathan Fielder",
    hint: "comedian, writer, Nathan for You",
    expectedCredits: ["Nathan for You", "The Rehearsal", "The Curse", "You Can See Everything"],
  },
  {
    label: "nathan-holmes-hint",
    name: "Nathan Fielder",
    hint: "Elizabeth Holmes",
    // The hint points at his 2026 A24 documentary about Elizabeth Holmes (co-directed with Lance Oppenheim)
    expectedCredits: ["You Can See Everything"],
  },
  {
    label: "zendaya",
    name: "Zendaya",
    hint: "actress",
    expectedCredits: ["Euphoria", "Spider-Man", "Dune", "Challengers"],
  },
  {
    // Similar name: Nathan Fillion (Castle, Firefly) vs Nathan Fielder.
    // The agent must not mix in Fielder's credits.
    label: "similar-name",
    name: "Nathan Fillion",
    hint: "actor",
    expectedCredits: ["Castle", "Firefly", "The Rookie"],
    forbiddenTerms: ["Nathan for You", "The Rehearsal", "You Can See Everything", "Elizabeth Holmes"],
  },
  {
    label: "obscure",
    name: "Zxqvland Pemberton Okafor",
    hint: "film industry",
    expectEmpty: true,
  },
  {
    // Plausible-sounding invented name with a film hint. Not involved in film,
    // so findings should be empty; any same-name match should go to needsReview.
    label: "obscure-not-in-film",
    name: "Dorothy Wexler-Nakamura",
    hint: "film director",
    expectEmpty: true,
  },
];

// ---------- HELPERS ----------
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const isBlocked = (u: string) =>
  BLOCKED_DOMAINS.some((d) => hostOf(u) === d || hostOf(u).endsWith("." + d));
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (data: Record<string, unknown>[]) =>
  data.length
    ? [Object.keys(data[0]).join(","), ...data.map((r) => Object.values(r).map(csv).join(","))].join("\n")
    : "";

const rows: Record<string, unknown>[] = [];
const findingRows: Record<string, unknown>[] = [];

// ---------- RUN ----------
async function main() {
  for (const t of TESTS) {
    for (let run = 1; run <= RUNS_PER_PERSON; run++) {
      const start = Date.now();
      let out: any = null;
      let error = "";
      try {
        out = await researchPerson(t.name, t.hint);
      } catch (e: any) {
        error = e?.message ?? String(e);
      }
      const secs = ((Date.now() - start) / 1000).toFixed(1);

      const findings: any[] = out?.findings ?? [];
      const review: any[] = out?.needsReview ?? [];

      // Automatic checks
      const schemaOk =
        !error &&
        typeof out?.personName === "string" &&
        findings.every((f) => f.field && f.value && hostOf(f.sourceUrl));
      const missingSource = findings.filter((f) => !f.sourceUrl).length;
      const blockedHits = findings.filter((f) => isBlocked(f.sourceUrl)).length;

      const blob = findings.map((f) => String(f.value).toLowerCase()).join(" | ");

      let recall = "";
      if (t.expectedCredits?.length) {
        const hits = t.expectedCredits.filter((c) => blob.includes(c.toLowerCase()));
        recall = `${hits.length}/${t.expectedCredits.length}`;
      }

      let forbiddenHits = 0;
      if (t.forbiddenTerms?.length) {
        forbiddenHits = t.forbiddenTerms.filter((x) => blob.includes(x.toLowerCase())).length;
      }

      const pass =
        schemaOk &&
        blockedHits === 0 &&
        missingSource === 0 &&
        forbiddenHits === 0 &&
        (t.expectEmpty ? findings.length === 0 : true);

      rows.push({
        label: t.label,
        name: t.name,
        run,
        pass,
        error,
        schemaOk,
        findings: findings.length,
        needsReview: review.length,
        blockedHits,
        missingSource,
        forbiddenHits,
        recall,
        seconds: secs,
      });

      // One row per finding so you can open the source and mark it correct
      for (const f of findings) {
        findingRows.push({
          name: t.name,
          run,
          field: f.field,
          value: f.value,
          sourceUrl: f.sourceUrl,
          supported_by_source: "", // FILL IN BY HAND: yes / no (for precision)
          right_person: "", // FILL IN BY HAND: yes / no
        });
      }

      console.log(
        `[${pass ? "PASS" : "FAIL"}] ${t.label} / ${t.name} run ${run}: ` +
          `${findings.length} findings, ${review.length} for review, ` +
          `recall ${recall || "n/a"}, forbidden ${forbiddenHits}, ${secs}s` +
          (error ? `  ERROR: ${error}` : "")
      );
    }
  }

  // ---------- OUTPUT ----------
  writeFileSync("test_results_summary.csv", toCsv(rows));
  writeFileSync("test_results_findings.csv", toCsv(findingRows));

  console.table(rows);
  console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} runs passed automatic checks.`);
  console.log("Wrote test_results_summary.csv and test_results_findings.csv");
  console.log("Next: open test_results_findings.csv, click each sourceUrl, and fill in the last two columns.");
}

main();
