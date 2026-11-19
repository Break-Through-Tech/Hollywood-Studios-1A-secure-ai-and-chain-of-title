// Quick single-person run:
//   npm run small -- "Nathan Fielder" "comedian, writer, Nathan for You"
import { researchPerson } from "./agentapicall.js";
// With no arguments it runs the Nathan Fielder example; with only a name, the hint is "film industry".
const args = process.argv.slice(2);
const name = args[0] ?? "Nathan Fielder";
const hint = args[1] ?? (args[0] ? "film industry" : "comedian, writer, Nathan for You");
try {
    const result = await researchPerson(name, hint);
    console.log(JSON.stringify(result, null, 2));
}
catch (error) {
    console.error("Research failed:", error);
    process.exitCode = 1;
}
