import { Firecrawl } from "firecrawl";
import "dotenv/config";
import { generateText, tool, Output } from "ai";
import { z } from "zod";

export type Finding = {
  field: string;
  value: string;
  sourceUrl: string;
};

export type CareerInfo = {
  personName: string;
  findings: Finding[];
  needsReview?: Array<{ reason: string; personName?: string }>;
};

const BLOCKED_DOMAINS = ["imdb.com", "linkedin.com"];

const CareerFindingsSchema = z.object({
  personName: z.string().min(1),
  findings: z.array(z.object({
    field: z.string().min(1),
    value: z.string().min(1),
    sourceUrl: z.string().url(),
  }).strict()),
  needsReview: z.array(z.object({
    reason: z.string().min(1),
    personName: z.string().optional(),
  }).strict()).optional(),
}).strict();

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return !BLOCKED_DOMAINS.some((domain) =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function researchPerson(name: string, hint = "film industry"): Promise<CareerInfo> {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY is not set");
  }

  const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const discoveredUrls = new Set<string>();
  let searchCalls = 0;
  let pageReads = 0;

  const getWebpages = tool({
    description: "Search the web for pages containing information about the person.",
    inputSchema: z.object({
      name: z.string().min(2),
      hint: z.string().default("film industry"),
    }),
    execute: async ({ name: searchName, hint: searchHint }) => {
      if (searchCalls >= 1) return { error: "Search limit reached." };
      searchCalls += 1;

      const result = await firecrawl.search(`"${searchName}" ${searchHint} career`, { limit: 5 });
      const pages = (result.web ?? [])
        .filter((page) => "url" in page && typeof page.url === "string" && isAllowedUrl(page.url))
        .slice(0, 5)
        .map((page) => ({ url: page.url, title: page.title ?? "" }));

      for (const page of pages) discoveredUrls.add(page.url);
      return { pages };
    },
  });

  const readPage = tool({
    description: "Read an approved webpage returned by getWebpages. Maximum three pages.",
    inputSchema: z.object({ url: z.string().url() }),
    execute: async ({ url }) => {
      if (!isAllowedUrl(url) || !discoveredUrls.has(url)) {
        return { error: "URL not allowed or not found by the search tool." };
      }
      if (pageReads >= 3) return { error: "Page reading limit reached." };
      pageReads += 1;

      const page = await firecrawl.scrape(url, { formats: ["markdown"] });
      return { url, content: (page.markdown ?? "").slice(0, 12000) };
    },
  });

  const prompt = `You are a research assistant collecting accurate, public career information.
Target person: ${name}
Disambiguating hint: ${hint}

Workflow:
1. Call getWebpages once with the target name and hint.
2. Read no more than three relevant pages using readPage.
3. Never use a source title as evidence.
4. Only include facts supported by successfully retrieved page content.
5. Never confuse people with similar names.
6. Return an empty findings array when reliable information is unavailable.
7. Put uncertain possible matches in needsReview, with a reason.

Blocked domains: imdb.com, linkedin.com.
Do not include private contact details or claims without source URLs.

Return only a JSON object matching this shape:
{
  "personName": "Full Name",
  "findings": [{ "field": "filmCredit", "value": "Verified claim", "sourceUrl": "https://example.com" }],
  "needsReview": [{ "reason": "Possible same-name ambiguity", "personName": "Candidate name" }]
}`;

  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    tools: { getWebpages, readPage },
    output: Output.object({ schema: CareerFindingsSchema }),
    prompt,
  });

  return CareerFindingsSchema.parse(output);
}

export async function GenerateCareerInfo(name: string, hint = "film industry"): Promise<CareerInfo> {
  return researchPerson(name, hint);
}
