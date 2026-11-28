// Shared fakes for the offline tests: no network, no API keys, no cost.
import { MockLanguageModelV4 } from "ai/test";
import type { WebClient } from "../agentapicall.js";

export const PAGES: Record<string, string> = {
  "https://en.wikipedia.org/wiki/Zendaya":
    "Zendaya is an American actress. She stars as Rue Bennett in the HBO series Euphoria (2019). " +
    "She played Chani in Dune (2021) and Tashi in Challengers (2024).",
  "https://www.hbo.com/euphoria": "Euphoria stars Zendaya as Rue Bennett.",
  "https://example.com/never-read": "A page the model finds but never reads.",
};

/** Fake search + scrape. Records every call so tests can count them. */
export function fakeWeb(overrides: Partial<WebClient> = {}) {
  const calls = { search: [] as string[], scrape: [] as string[] };
  const web: WebClient = {
    async search(query) {
      calls.search.push(query);
      return [
        { url: "https://www.imdb.com/name/nm3918035/", title: "Zendaya - IMDb" }, // blocked
        { url: "https://m.imdb.com/name/nm3918035/", title: "Zendaya - IMDb mobile" }, // blocked subdomain
        ...Object.keys(PAGES).map((url) => ({ url, title: url })),
      ];
    },
    async scrape(url) {
      calls.scrape.push(url);
      if (!(url in PAGES)) throw new Error("404");
      return PAGES[url];
    },
    ...overrides,
  };
  return { web, calls };
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

type Step = { tool: string; input: object } | { tool: string; input: object }[] | { json: unknown };

/**
 * A scripted model. Each entry is one model turn: a tool call, several tool
 * calls at once, or the final JSON answer.
 */
export function scriptedModel(steps: Step[]) {
  let id = 0;
  return new MockLanguageModelV4({
    modelId: "mock-model",
    doGenerate: steps.map((step) => {
      if ("json" in step) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(step.json) }],
          finishReason: { unified: "stop" as const, raw: "end_turn" },
          usage,
          warnings: [],
        };
      }
      const calls = Array.isArray(step) ? step : [step];
      return {
        content: calls.map((c) => ({
          type: "tool-call" as const,
          toolCallId: `call-${++id}`,
          toolName: c.tool,
          input: JSON.stringify(c.input),
        })),
        finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
        usage,
        warnings: [],
      };
    }),
  });
}

export function credit(value: string, sourceUrl: string, extra: Record<string, unknown> = {}) {
  return { field: "credit", value, year: null, role: null, workType: null, sourceUrl, ...extra };
}
