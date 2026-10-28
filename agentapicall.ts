// const greeting: string = "Hello from TypeScript in Colab!";
// console.log(greeting);


const firecrawl = new Firecrawl({apiKey: FIRECRAWL_API_KEY!}) // where the api key would go; could hide with dotenv
/*
dotenv version:
import "dotenv/config";
const firecrawl = new Firecrawl({apiKey: process.env.FIRECRAWL_API_KEY!});
*/

import { generateText } from 'ai';
import { generateObject } from 'ai';
import { z } from 'zod'; // allows ai agent to export structured generateText
// instantiating policy
const blockedDomains = ['imdb.com', 'linkedin.com']; // fill in all blocked urls (ex. imdb, linkedin)

// TODO: write function that checks links from the websearch tool and returns False if they're in the blocked list
function isBlockedUrl(value: string): boolean {
  try {
    const url = new URL(value);

    // Reject malformed URLs and non-web protocols.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

    return blockedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
      return (
        hostname === normalizedDomain ||
        hostname.endsWith(`.${normalizedDomain}`)
      );
    });
  } catch {
    // Don't pass malformed URLs through to the next step.
    return true;
  }
}
# TODO: Set up API call to AI agent for web query
// TODO: Give agents descriptions for their tools

// websearch tool
const get_webpages = tool({
  description: "Search the web and collect urls on pages containing information about the person.",
  inputSchema: z.object({
    name: z.string().min(2),
    hint: z.string().default("film industry"),
  }),
  execute: async ({ name, hint }) => {
    if (searchCalls >= 1) return { error: "Search limit reached." };
    searchCalls += 1;
    const result = await firecrawl.search(
      `"${name}" ${hint} career site:en.wikipedia.org`,
      { limit: 5 }
    );
    const pages = (result.web ?? [])
      .filter(page => isApprovedUrl(page.url)) // maybe change: don't condition on approved urls but instead blocked urls (ex. blog pages are fair game)
      .slice(0, 5)
      .map(page => ({ url: page.url, title: page.title ?? "" }));
    for (const page of pages) discoveredUrls.add(page.url);
    return { pages };
  },

});

// readpage tool
const readpage = tool({
  description: "Read one of the approved links returned by get_webpages. Maximum three pages.",
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    if (!isApprovedUrl(url) || !discoveredUrls.has(url)) {
      return { error: "URL not allowed or not found by the search tool." };
    }
    if (pageReads >= 3) return { error: "Page reading limit reached." };
    pageReads += 1;
    const page = await firecrawl.scrape(url, { formats: ["markdown"] });
    return { url, content: (page.markdown ?? "").slice(0, 12000) };
  },
});
# TODO: Provide prompt instructions to AI agent for web query
// TODO: write instruction prompt to LLM
const LLM_prompt = ["", ""].join("\n")


// setting up call to LLM

export async function GET() {
  const { object } = await generateObject({
    model: 'fill_in_later',
    tools: {
      // insert tool names
    }
    schema: z.object({
      name: z.string(),
      age: z.number(),
      location: z.string(),
      occupation: z.string(),
      credits: z.string(),
      //fill in necessary profile information we want that matches schema_db
    }),
    prompt: {LLM_prompt}',
  });

  return Response.json(object);
}
# TODO: Check JSON formatting

import { z } from 'zod';

const CareerFindingsSchema = z.object({
  personName: z.string().min(1),
  findings: z.array(
    z.object({
      field: z.string().min(1),
      value: z.string().min(1),
      sourceUrl: z.string().url(),
    }).strict(),
  ),
}).strict();

type CareerFindings = z.infer<typeof CareerFindingsSchema>;

function validateFindingsJson(
  raw: string,
):
  | { ok: true; data: CareerFindings }
  | { ok: false; error: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Output is not valid JSON.' };
  }

  const result = CareerFindingsSchema.safeParse(parsed);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    return { ok: false, error: `JSON has the wrong format: ${details}` };
  }

  return { ok: true, data: result.data };
}

