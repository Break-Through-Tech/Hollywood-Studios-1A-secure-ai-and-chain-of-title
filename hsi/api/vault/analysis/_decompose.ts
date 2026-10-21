import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAnalysesTable } from '../_schema.js';
import { callLLM, getLLMConfig, parseJSON } from '../_llm.js';
import { decompositionSystemPrompt, decompositionUserPrompt } from '../_prompts.js';
import { detectGenre } from '../_genre-config.js';
import { resolveVaultAccess, readProjectContent } from '../_access.js';

interface ScriptBreakdown {
  metadata: {
    title: string;
    genre: string;
    subgenre: string;
    format: string;
    estimated_page_count: number;
    time_period: string;
    primary_setting: string;
    tone: string;
  };
  characters: Array<{
    name: string;
    role: string;
    first_appearance: number;
    arc_summary: string;
  }>;
  scenes: Array<{
    number: number;
    slug_line: string;
    characters_present: string[];
    beat_summary: string;
    emotional_tone: string;
    estimated_pages: number;
  }>;
  act_structure: {
    act_1: { scenes: number[]; inciting_incident: string; turning_point: string };
    act_2a: { scenes: number[]; midpoint: string };
    act_2b: { scenes: number[]; turning_point: string };
    act_3: { scenes: number[]; climax: string; resolution: string };
  };
  genre_signals: string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;

  if (!slug || !ownerEmail) {
    return res.status(400).json({ error: 'slug and ownerEmail are required' });
  }

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can run decomposition' });
    }

    await ensureVaultAnalysesTable(sql);

    const existing = (await sql`
      SELECT script_breakdown, detected_genre FROM vault_analyses
      WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'
        AND script_breakdown IS NOT NULL
    `)[0];

    if (existing?.script_breakdown) {
      return res.status(200).json({
        breakdown: existing.script_breakdown,
        genre: existing.detected_genre,
        cached: true,
      });
    }

    const vaultItem = (await sql`
      SELECT workspace_content, workspace_context, file_data, blob_url, item_kind FROM vault_scripts
      WHERE slug = ${slug} AND owner_email = ${ownerEmail}
    `)[0];

    if (!vaultItem) return res.status(404).json({ error: 'Vault item not found' });

    const projectContent = await readProjectContent(sql, slug, vaultItem);

    if (!projectContent.trim()) {
      return res.status(400).json({ error: 'Project has no content to analyze' });
    }

    const config = getLLMConfig();
    const result = await callLLM(
      config,
      decompositionSystemPrompt(),
      decompositionUserPrompt(projectContent),
      { temperature: 0.3, maxTokens: 32768, timeout: 300_000 },
    );

    const breakdown = parseJSON<ScriptBreakdown>(result.text, null as unknown as ScriptBreakdown);

    if (!breakdown || !breakdown.metadata || !breakdown.scenes) {
      return res.status(500).json({ error: 'Failed to decompose script — invalid response from LLM' });
    }

    const genreSignals = breakdown.genre_signals || [];
    const genreConfig = detectGenre([breakdown.metadata.genre, breakdown.metadata.subgenre, ...genreSignals]);

    await sql`INSERT INTO vault_analyses (vault_slug, owner_email, tool, status, script_breakdown, detected_genre, started_at)
      VALUES (${slug}, ${ownerEmail}, 'coverage', 'decomposing', ${JSON.stringify(breakdown)}, ${genreConfig.key}, NOW())
      ON CONFLICT (vault_slug, owner_email, tool)
      DO UPDATE SET script_breakdown = ${JSON.stringify(breakdown)}, detected_genre = ${genreConfig.key},
                    status = CASE WHEN vault_analyses.status = 'completed' THEN vault_analyses.status ELSE 'decomposing' END`;

    return res.status(200).json({
      breakdown,
      genre: genreConfig.key,
      genre_label: genreConfig.label,
      scene_count: breakdown.scenes.length,
      character_count: breakdown.characters.length,
      cached: false,
    });
  } catch (err) {
    console.error('Decomposition error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Decomposition failed' });
  }
}
