export interface LLMResult {
  text: string;
}

export interface LLMConfig {
  host: string;
  model: string;
  provider: 'ollama' | 'openai';
}

export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'ollama') as 'ollama' | 'openai';
  const host = process.env.LLM_HOST || process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'llama3';
  return { host, model, provider };
}

export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; timeout?: number; json?: boolean },
): Promise<LLMResult> {
  const temp = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 4096;
  const timeout = options?.timeout ?? 180_000;
  const json = options?.json ?? true;

  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let text: string;

      if (config.provider === 'openai') {
        const res = await fetch(`${config.host}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: temp,
            max_tokens: maxTokens,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
            // reasoning models burn most of the token budget on hidden
            // reasoning, truncating the JSON output (OpenRouter-only param)
            ...(config.host.includes('openrouter') ? { reasoning: { enabled: false } } : {}),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 && attempt < maxAttempts - 1) {
          const body = await res.text().catch(() => '');
          const headerRetry = parseInt(res.headers.get('retry-after') || '', 10);
          const bodyRetry = (() => { try { const m = JSON.parse(body)?.error?.metadata?.retry_after_seconds; return typeof m === 'number' ? Math.ceil(m) : 0; } catch { return 0; } })();
          const wait = ((headerRetry > 0 ? headerRetry : bodyRetry > 0 ? bodyRetry : 15) + attempt * 10) * 1000;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`LLM (openai) returned ${res.status}: ${errText}`);
        }
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        text = data.choices?.[0]?.message?.content || '';
      } else {
        const res = await fetch(`${config.host}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            stream: false,
            ...(json ? { format: 'json' } : {}),
            options: { temperature: temp, num_predict: maxTokens },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 && attempt < maxAttempts - 1) {
          const body = await res.text().catch(() => '');
          const headerRetry = parseInt(res.headers.get('retry-after') || '', 10);
          const bodyRetry = (() => { try { const m = JSON.parse(body)?.error?.metadata?.retry_after_seconds; return typeof m === 'number' ? Math.ceil(m) : 0; } catch { return 0; } })();
          const wait = ((headerRetry > 0 ? headerRetry : bodyRetry > 0 ? bodyRetry : 15) + attempt * 10) * 1000;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`LLM (ollama) returned ${res.status}: ${errText}`);
        }
        const data = await res.json() as { response?: string };
        text = data.response || '';
      }

      return { text: text.trim() };
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
    }
  }

  throw new Error('LLM call failed after retries');
}

export function parseJSON<T>(text: string, fallback: T): T {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* try extraction */ }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch { /* fall through */ }
  }

  return fallback;
}

export interface DimensionResult {
  score: number;
  summary: string;
  detailed_analysis: string;
}

export function parseDimensionResult(text: string): DimensionResult {
  const fallback: DimensionResult = {
    score: 50,
    summary: 'Analysis completed but response format was unexpected.',
    detailed_analysis: text.slice(0, 3000) || 'No detailed analysis available.',
  };

  const parsed = parseJSON<Record<string, unknown>>(text, {});
  if (!parsed || typeof parsed !== 'object' || !('score' in parsed)) {
    const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
    if (scoreMatch) fallback.score = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));
    return fallback;
  }

  let score = typeof parsed.score === 'number' ? parsed.score : 50;
  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    score,
    summary: typeof parsed.summary === 'string' && parsed.summary.length > 0
      ? parsed.summary : 'No summary provided.',
    detailed_analysis: typeof parsed.detailed_analysis === 'string' && parsed.detailed_analysis.length > 0
      ? parsed.detailed_analysis : 'No detailed analysis provided.',
  };
}
