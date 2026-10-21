import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAnalysesTable } from '../_schema.js';
import { callLLM, getLLMConfig, parseJSON } from '../_llm.js';
import { actAnalysisSystemPrompt, actAnalysisUserPrompt } from '../_prompts.js';
import { resolveVaultAccess, readProjectContent } from '../_access.js';

interface SceneEntry {
  number: number;
  slug_line: string;
  characters_present: string[];
  beat_summary: string;
  emotional_tone: string;
  estimated_pages: number;
}

interface ActStructure {
  scenes: number[];
  [key: string]: unknown;
}

interface ActAnalysisResult {
  act: string;
  character_work: string;
  dialogue_quality: string;
  pacing_notes: string;
  structural_effectiveness: string;
  craft_strengths: string[];
  craft_weaknesses: string[];
  notable_moments: string[];
  emotional_trajectory: string;
}

const ACT_LABELS: Record<string, string> = {
  act_1: 'Act 1 — Setup & Inciting Incident',
  act_2a: 'Act 2A — Rising Action & Midpoint',
  act_2b: 'Act 2B — Complications & Crisis',
  act_3: 'Act 3 — Climax & Resolution',
};

function extractActText(fullScript: string, scenes: SceneEntry[], actSceneRange: number[]): string {
  if (!actSceneRange || actSceneRange.length < 2) return fullScript.slice(0, 15000);

  const startScene = actSceneRange[0];
  const endScene = actSceneRange[actSceneRange.length - 1];

  const startSlug = scenes.find(s => s.number === startScene)?.slug_line;
  const nextActFirstScene = scenes.find(s => s.number === endScene + 1);
  const endSlug = nextActFirstScene?.slug_line;

  if (!startSlug) return fullScript.slice(0, 15000);

  const startIdx = fullScript.indexOf(startSlug);
  if (startIdx === -1) return fullScript.slice(0, 15000);

  let endIdx = fullScript.length;
  if (endSlug) {
    const found = fullScript.indexOf(endSlug, startIdx + startSlug.length);
    if (found !== -1) endIdx = found;
  }

  const extracted = fullScript.slice(startIdx, endIdx);
  return extracted.length > 20000 ? extracted.slice(0, 20000) + '\n\n[... act text truncated ...]' : extracted;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, actKey } = req.body;

  if (!slug || !ownerEmail || !actKey) {
    return res.status(400).json({ error: 'slug, ownerEmail, and actKey are required' });
  }

  const validActs = ['act_1', 'act_2a', 'act_2b', 'act_3'];
  if (!validActs.includes(actKey)) {
    return res.status(400).json({ error: 'actKey must be one of: act_1, act_2a, act_2b, act_3' });
  }

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can run act analysis' });
    }

    await ensureVaultAnalysesTable(sql);

    const analysis = (await sql`
      SELECT script_breakdown, act_analyses FROM vault_analyses
      WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'
    `)[0];

    if (!analysis?.script_breakdown) {
      return res.status(400).json({ error: 'Script decomposition must be run first' });
    }

    const breakdown = typeof analysis.script_breakdown === 'string'
      ? JSON.parse(analysis.script_breakdown)
      : analysis.script_breakdown;

    const existingActAnalyses: Record<string, unknown> = analysis.act_analyses
      ? (typeof analysis.act_analyses === 'string' ? JSON.parse(analysis.act_analyses) : analysis.act_analyses)
      : {};

    if (existingActAnalyses[actKey]) {
      return res.status(200).json({
        act: actKey,
        analysis: existingActAnalyses[actKey],
        cached: true,
      });
    }

    const actStructure = breakdown.act_structure?.[actKey] as ActStructure | undefined;
    if (!actStructure) {
      return res.status(400).json({ error: `Act structure for ${actKey} not found in breakdown` });
    }

    const vaultItem = (await sql`
      SELECT workspace_content, workspace_context, file_data, blob_url FROM vault_scripts
      WHERE slug = ${slug} AND owner_email = ${ownerEmail}
    `)[0];

    const fullScript = vaultItem ? await readProjectContent(sql, slug, vaultItem) : '';

    const sceneRange = actStructure.scenes || [];
    const actRawText = extractActText(fullScript, breakdown.scenes || [], sceneRange);
    const sceneRangeStr = `Scenes ${sceneRange[0]}–${sceneRange[sceneRange.length - 1]}`;

    const config = getLLMConfig();
    const result = await callLLM(
      config,
      actAnalysisSystemPrompt(),
      actAnalysisUserPrompt(
        ACT_LABELS[actKey],
        sceneRangeStr,
        JSON.stringify(breakdown, null, 2).slice(0, 6000),
        actRawText,
      ),
      { temperature: 0.5, maxTokens: 8192, timeout: 180_000 },
    );

    const actResult = parseJSON<ActAnalysisResult>(result.text, {
      act: actKey,
      character_work: 'Analysis could not be parsed.',
      dialogue_quality: '',
      pacing_notes: '',
      structural_effectiveness: '',
      craft_strengths: [],
      craft_weaknesses: [],
      notable_moments: [],
      emotional_trajectory: '',
    });

    existingActAnalyses[actKey] = actResult;

    await sql`UPDATE vault_analyses SET
      act_analyses = ${JSON.stringify(existingActAnalyses)},
      status = CASE WHEN status = 'completed' THEN status ELSE 'analyzing' END
      WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'`;

    const completedActs = validActs.filter(a => existingActAnalyses[a]);

    return res.status(200).json({
      act: actKey,
      analysis: actResult,
      cached: false,
      progress: { completed: completedActs.length, total: 4 },
    });
  } catch (err) {
    console.error('Act analysis error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Act analysis failed' });
  }
}
