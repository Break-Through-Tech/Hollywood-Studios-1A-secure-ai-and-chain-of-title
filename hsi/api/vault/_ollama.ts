export interface OllamaResult {
  score: number;
  summary: string;
  detailed_analysis: string;
}

export async function callOllama(
  host: string,
  model: string,
  projectContent: string,
  dimensionLabel: string,
  dimensionDescription: string,
  priorContext?: string,
): Promise<OllamaResult> {
  const prompt = buildPrompt(projectContent, dimensionLabel, dimensionDescription, priorContext);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const res = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.7, num_predict: 4096 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama returned ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { response?: string };
      const responseText: string = data.response || '';
      return parseResponse(responseText);
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }

  throw new Error('Ollama call failed after retries');
}

function buildPrompt(
  projectContent: string,
  dimensionLabel: string,
  dimensionDescription: string,
  priorContext?: string,
): string {
  const contentExcerpt = projectContent.length > 32_000
    ? projectContent.slice(0, 32_000) + '\n\n[... content truncated for analysis ...]'
    : projectContent;

  let prompt = `You are an elite entertainment industry analyst with decades of experience in script coverage, market analysis, and greenlighting decisions. You have worked at major studios, agencies, and production companies. Your analysis is thorough, specific, and actionable.

TASK: Analyze the following project for the dimension "${dimensionLabel}".

`;

  if (priorContext) {
    prompt += `PRIOR ANALYSIS CONTEXT (from previous evaluation stages):
---
${priorContext}
---

Use the above prior analysis to inform and build upon your assessment for this dimension.

`;
  }

  prompt += `PROJECT TEXT:
---
${contentExcerpt}
---

DIMENSION: ${dimensionLabel}

ANALYSIS INSTRUCTIONS:
${dimensionDescription}

SCORING GUIDELINES:
- 0-19: Fundamentally broken, unsalvageable without complete rework
- 20-39: Significant weaknesses, major revision needed
- 40-59: Below average, has potential but needs substantial work
- 60-74: Competent, meets baseline expectations with room for improvement
- 75-84: Strong, above average with notable qualities
- 85-94: Excellent, standout quality that would attract industry attention
- 95-100: Exceptional, best-in-class, rarely seen quality

Respond with a JSON object containing exactly these fields:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence executive summary of this dimension>",
  "detailed_analysis": "<thorough multi-paragraph critique, 4-6 paragraphs, with specific examples and quotes from the text, constructive feedback, and actionable suggestions>"
}

Be rigorous and honest. Do not inflate scores. Industry professionals rely on accurate assessment, not encouragement. If the project text is thin or underdeveloped, say so directly.

Respond ONLY with valid JSON.`;

  return prompt;
}

function parseResponse(text: string): OllamaResult {
  const cleaned = text.trim();

  try {
    const parsed = JSON.parse(cleaned);
    return validateResult(parsed);
  } catch {
    // empty
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateResult(parsed);
    } catch {
      // empty
    }
  }

  const scoreMatch = cleaned.match(/"score"\s*:\s*(\d+)/);
  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 50;

  return {
    score,
    summary: 'Analysis completed but response format was unexpected.',
    detailed_analysis: cleaned.slice(0, 3000) || 'No detailed analysis available.',
  };
}

function validateResult(parsed: Record<string, unknown>): OllamaResult {
  let score = typeof parsed.score === 'number' ? parsed.score : 50;
  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    score,
    summary: typeof parsed.summary === 'string' && parsed.summary.length > 0
      ? parsed.summary
      : 'No summary provided.',
    detailed_analysis: typeof parsed.detailed_analysis === 'string' && parsed.detailed_analysis.length > 0
      ? parsed.detailed_analysis
      : 'No detailed analysis provided.',
  };
}
