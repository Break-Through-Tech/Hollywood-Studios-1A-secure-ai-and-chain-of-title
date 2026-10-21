import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getToolDef, getDimensionDef } from '../_analysis-config.js';
import { callLLM, getLLMConfig, parseDimensionResult } from '../_llm.js';
import { ensureVaultAnalysesTable, ensureCompReferencesTable } from '../_schema.js';
import { selectComps } from '../_comp-references.js';
import { getGenreConfig } from '../_genre-config.js';
import { resolveVaultAccess, readProjectContent } from '../_access.js';
import {
  dimensionScoringSystemPrompt,
  dimensionScoringUserPrompt,
  formatActAnalyses,
  buildCompContext,
} from '../_prompts.js';

interface DimRecord {
  dimension: string;
  label: string;
  score: number;
  weight: number;
  summary: string;
  detailed_analysis: string;
  completed_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, tool, dimensionKey } = req.body;

  if (!slug || !ownerEmail || !tool || !dimensionKey) {
    return res.status(400).json({ error: 'slug, ownerEmail, tool, and dimensionKey are required' });
  }

  const config = getLLMConfig();

  const toolDef = getToolDef(tool);
  if (!toolDef) return res.status(400).json({ error: 'Invalid tool' });

  const dimDef = getDimensionDef(tool, dimensionKey);
  if (!dimDef) return res.status(400).json({ error: 'Invalid dimension' });

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can run analysis' });
    }

    await ensureVaultAnalysesTable(sql);
    await ensureCompReferencesTable(sql);

    if (toolDef.prerequisite) {
      const prereq = (await sql`SELECT overall_score, status FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${toolDef.prerequisite}`)[0];
      if (!prereq || prereq.status !== 'completed' || (prereq.overall_score ?? 0) < toolDef.unlockThreshold) {
        return res.status(403).json({ error: `Complete ${toolDef.prerequisite} with a score of ${toolDef.unlockThreshold}+ first` });
      }
    }

    const coverageRow = (await sql`
      SELECT script_breakdown, act_analyses, detected_genre, comp_ids
      FROM vault_analyses
      WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'
    `)[0];

    const scriptBreakdown = coverageRow?.script_breakdown;
    const actAnalyses = coverageRow?.act_analyses;
    const detectedGenre = coverageRow?.detected_genre as string | null;

    let breakdownStr = '';
    let actAnalysesStr = '';
    let useLegacyMode = false;

    if (scriptBreakdown && actAnalyses) {
      const bd = typeof scriptBreakdown === 'string' ? JSON.parse(scriptBreakdown) : scriptBreakdown;
      const aa = typeof actAnalyses === 'string' ? JSON.parse(actAnalyses) : actAnalyses;
      breakdownStr = JSON.stringify(bd, null, 2);
      if (breakdownStr.length > 12000) breakdownStr = breakdownStr.slice(0, 12000) + '\n...';
      actAnalysesStr = formatActAnalyses(aa);
    } else {
      useLegacyMode = true;
    }

    let projectContent = '';
    if (useLegacyMode) {
      const vaultItem = (await sql`SELECT workspace_content, workspace_context, file_data, blob_url, item_kind FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`)[0];
      if (!vaultItem) return res.status(404).json({ error: 'Vault item not found' });

      projectContent = await readProjectContent(sql, slug, vaultItem);
      if (!projectContent.trim()) {
        return res.status(400).json({ error: 'Project has no content to analyze' });
      }
    }

    await sql`INSERT INTO vault_analyses (vault_slug, owner_email, tool, status, started_at)
      VALUES (${slug}, ${ownerEmail}, ${tool}, 'running', NOW())
      ON CONFLICT (vault_slug, owner_email, tool)
      DO UPDATE SET status = CASE WHEN vault_analyses.status = 'completed' THEN vault_analyses.status ELSE 'running' END,
                    started_at = COALESCE(vault_analyses.started_at, NOW())`;

    let priorContext: string | undefined;
    if (tool === 'relativity') {
      const cov = (await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'`)[0];
      if (cov) {
        const dims = Array.isArray(cov.dimensions) ? cov.dimensions : JSON.parse(cov.dimensions || '[]');
        priorContext = `Coverage Score: ${cov.overall_score}/100\n` + dims.map((d: DimRecord) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n');
      }
    } else if (tool === 'greenlight') {
      const parts: string[] = [];
      const cov = (await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'coverage'`)[0];
      const rel = (await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = 'relativity'`)[0];
      if (cov) {
        const dims = Array.isArray(cov.dimensions) ? cov.dimensions : JSON.parse(cov.dimensions || '[]');
        parts.push(`Coverage Score: ${cov.overall_score}/100\n` + dims.map((d: DimRecord) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n'));
      }
      if (rel) {
        const dims = Array.isArray(rel.dimensions) ? rel.dimensions : JSON.parse(rel.dimensions || '[]');
        parts.push(`Relativity Score: ${rel.overall_score}/100\n` + dims.map((d: DimRecord) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n'));
      }
      if (parts.length) priorContext = parts.join('\n\n');
    }

    let compContextStr: string | null = null;
    if ((tool === 'relativity' || tool === 'greenlight') && detectedGenre) {
      const bd = scriptBreakdown
        ? (typeof scriptBreakdown === 'string' ? JSON.parse(scriptBreakdown) : scriptBreakdown)
        : null;
      const signals = bd?.genre_signals || [];
      const comps = await selectComps(sql, detectedGenre, signals, 5);
      if (comps.length > 0) {
        compContextStr = buildCompContext(comps);
        const compIds = comps.map(c => c.id);
        await sql`UPDATE vault_analyses SET comp_ids = ${compIds}
          WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${tool}`;
      }
    }

    const genreConfig = detectedGenre ? getGenreConfig(detectedGenre) : null;
    const genreLabel = genreConfig?.label || 'General';
    const genreRubric = genreConfig?.rubric_overrides?.[dimensionKey] || null;

    let result;

    if (useLegacyMode) {
      const { callOllama } = await import('../_ollama.js');
      const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
      const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
      result = await callOllama(ollamaHost, ollamaModel, projectContent, dimDef.label, dimDef.description, priorContext);
    } else {
      const llmResult = await callLLM(
        config,
        dimensionScoringSystemPrompt(genreLabel),
        dimensionScoringUserPrompt(
          dimDef.label,
          dimDef.description,
          breakdownStr,
          actAnalysesStr,
          genreRubric,
          compContextStr,
          priorContext || null,
        ),
        { temperature: 0.6, maxTokens: 8192, timeout: 180_000 },
      );
      result = parseDimensionResult(llmResult.text);
    }

    const genreWeights = genreConfig?.scoring_weights || {};
    const effectiveWeight = genreWeights[dimensionKey] ?? dimDef.weight;

    const dimResult = {
      dimension: dimDef.key,
      label: dimDef.label,
      score: result.score,
      weight: effectiveWeight,
      summary: result.summary,
      detailed_analysis: result.detailed_analysis,
      completed_at: new Date().toISOString(),
    };

    const current = (await sql`SELECT dimensions FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${tool}`)[0];
    const dims: DimRecord[] = Array.isArray(current.dimensions) ? current.dimensions : JSON.parse(current.dimensions || '[]');
    const filtered = dims.filter((d) => d.dimension !== dimDef.key);
    filtered.push(dimResult);

    const completedCount = filtered.length;
    const totalCount = toolDef.dimensions.length;
    const isComplete = completedCount >= totalCount;

    let overallScore: number | null = null;
    if (isComplete) {
      let weightedSum = 0, weightSum = 0;
      for (const d of filtered) {
        const w = genreWeights[d.dimension] ?? (toolDef.dimensions.find(td => td.key === d.dimension)?.weight || (1 / totalCount));
        weightedSum += d.score * w;
        weightSum += w;
      }
      overallScore = Math.round(weightedSum / weightSum);
    }

    await sql`UPDATE vault_analyses SET
      dimensions = ${JSON.stringify(filtered)},
      status = ${isComplete ? 'completed' : 'running'},
      overall_score = ${overallScore},
      completed_at = ${isComplete ? new Date().toISOString() : null}
      WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${tool}`;

    return res.status(200).json({
      dimension: dimDef.key,
      label: dimDef.label,
      score: result.score,
      summary: result.summary,
      detailed_analysis: result.detailed_analysis,
      progress: { completed: completedCount, total: totalCount },
      overall_score: overallScore,
      tool_status: isComplete ? 'completed' : 'running',
      genre: detectedGenre,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    console.error('Analysis run error:', err);
    await sql`UPDATE vault_analyses SET status = 'failed', error_message = ${message} WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${tool}`.catch(() => {});
    return res.status(500).json({ error: message || 'Analysis failed. Is the LLM server running?' });
  }
}
