// Interactive lookup: type a name (and optional hint), get back career findings.
//   npm run lookup
// Press Enter on an empty name (or Ctrl+C) to quit.
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { researchPerson, type CareerFindings } from "./agentapicall.js";

const DEFAULT_HINT = "film industry";

function printResult(result: CareerFindings): void {
  console.log(`\n=== ${result.personName} ===`);

  if (result.findings.length === 0) {
    console.log("No verified findings.");
  } else {
    console.log("\nVerified findings:");
    for (const f of result.findings) {
      console.log(`  - [${f.field}] ${f.value}`);
      console.log(`      source: ${f.sourceUrl}`);
    }
  }

  if (result.needsReview.length > 0) {
    console.log("\nFor human review (not verified):");
    for (const r of result.needsReview) {
      console.log(`  - [${r.field}] ${r.value}`);
      console.log(`      why: ${r.reason}`);
      if (r.sourceUrl) console.log(`      source: ${r.sourceUrl}`);
    }
  }
  console.log();
}

const rl = createInterface({ input, output });

try {
  while (true) {
    const name = (await rl.question("Name to look up (Enter to quit): ")).trim();
    if (!name) break;

    const hint =
      (await rl.question(`Hint to identify them (Enter for "${DEFAULT_HINT}"): `)).trim() ||
      DEFAULT_HINT;

    console.log(`Researching ${name} (${hint})... this can take up to a minute.`);
    try {
      printResult(await researchPerson(name, hint));
    } catch (error) {
      console.error("Lookup failed:", error instanceof Error ? error.message : error);
    }
  }
} finally {
  rl.close();
}
