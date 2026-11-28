// Quick live check: research one person and print the result.
// Uses real API credits (1 search + up to 3 page reads + model tokens).
//
//   npm run try -- "Zendaya" "actress"
import { researchPerson } from "./agentapicall.js";

const [name = "Zendaya", hint = "actress"] = process.argv.slice(2);

console.log(`Researching ${name} (hint: ${hint})...`);
const started = Date.now();

try {
  const result = await researchPerson(name, hint);
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${result.findings.length} findings, ${result.needsReview.length} for review, ` +
      `${result.meta.pageReads} pages read, ${result.meta.steps} model steps.`,
  );
} catch (err) {
  console.error("\nResearch failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
