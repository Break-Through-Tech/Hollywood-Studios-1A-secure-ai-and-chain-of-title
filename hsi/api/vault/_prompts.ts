import type { GenreConfig, GenreRubricOverride } from './_genre-config.js';

// ── Pass 1: Script Decomposition ──

export function decompositionSystemPrompt(): string {
  return `You are a veteran script reader with 25+ years at major studios. You have read thousands of screenplays and can instantly identify structure, genre, character function, and narrative mechanics.

Your job is to produce a precise structural decomposition of a screenplay. This decomposition will be used by other analysts — it must be accurate, complete, and structured.

You are not evaluating quality in this pass. You are mapping the script's architecture: what happens, where, with whom, in what sequence, and how the story is organized.

Respond ONLY with valid JSON matching the exact schema requested.`;
}

export function decompositionUserPrompt(scriptContent: string): string {
  return `Read the following screenplay and produce a complete structural decomposition.

SCREENPLAY:
---
${scriptContent}
---

Produce a JSON object with this exact structure:

{
  "metadata": {
    "title": "the title of the script",
    "genre": "primary genre (one of: thriller, horror, comedy, drama, action, scifi, romance, biopic)",
    "subgenre": "more specific subgenre if applicable",
    "format": "feature, pilot, or limited",
    "estimated_page_count": number,
    "time_period": "when the story is set",
    "primary_setting": "main location(s)",
    "tone": "2-3 word tone description (e.g., 'dark and brooding', 'light and irreverent')"
  },
  "characters": [
    {
      "name": "CHARACTER NAME",
      "role": "protagonist | antagonist | supporting | minor",
      "first_appearance": scene number (integer),
      "arc_summary": "one sentence describing their journey or function"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "slug_line": "INT./EXT. LOCATION - TIME",
      "characters_present": ["NAME1", "NAME2"],
      "beat_summary": "1-2 sentences: what happens and what changes",
      "emotional_tone": "1-2 words (e.g., 'tense', 'comedic', 'devastating')",
      "estimated_pages": number
    }
  ],
  "act_structure": {
    "act_1": {
      "scenes": [1, last_scene_number_of_act_1],
      "inciting_incident": "what event launches the story",
      "turning_point": "what propels us into Act 2"
    },
    "act_2a": {
      "scenes": [first_scene, last_scene],
      "midpoint": "what shifts at the middle of the story"
    },
    "act_2b": {
      "scenes": [first_scene, last_scene],
      "turning_point": "what propels us into Act 3"
    },
    "act_3": {
      "scenes": [first_scene, last_scene],
      "climax": "the peak dramatic moment",
      "resolution": "how the story resolves"
    }
  },
  "genre_signals": ["list", "of", "detected", "genre", "conventions", "tropes", "and", "influences"]
}

Be thorough with the scene breakdown — every scene in the script should be logged. Characters list should include all named speaking characters. Genre signals should include specific observations like "unreliable narrator", "ticking clock", "fish out of water", etc.`;
}

// ── Pass 2: Act-Level Deep Analysis ──

export function actAnalysisSystemPrompt(): string {
  return `You are a veteran script analyst performing a close reading of one act of a screenplay. You have the full structural breakdown of the script for context, but your job is to deeply analyze the craft of this specific act.

You are examining:
- How effectively characters are written in this section
- The quality and distinctiveness of dialogue
- Scene-by-scene pacing and rhythm
- Specific craft strengths and weaknesses with scene references
- Notable lines, moments, or choices

Be specific. Reference scene numbers. Quote dialogue when notable. This analysis will be used as evidence by scoring analysts — vague impressions are useless. Concrete observations with references are essential.

Respond ONLY with valid JSON.`;
}

export function actAnalysisUserPrompt(
  actLabel: string,
  actSceneRange: string,
  scriptBreakdown: string,
  actRawText: string,
): string {
  return `FULL SCRIPT BREAKDOWN (for context):
---
${scriptBreakdown}
---

ACT BEING ANALYZED: ${actLabel} (${actSceneRange})

RAW SCRIPT TEXT FOR THIS ACT:
---
${actRawText}
---

Produce a JSON object analyzing this act:

{
  "act": "${actLabel}",
  "character_work": "How effectively are characters written in this act? Are introductions compelling (Act 1)? Is growth visible (Act 2)? Are arcs completed (Act 3)? Reference specific scenes.",
  "dialogue_quality": "Assess the dialogue in this act. Are voices distinct? Is there subtext? Are there standout exchanges? Quote 2-3 notable lines with scene numbers.",
  "pacing_notes": "Scene-by-scene rhythm. Which scenes earn their length? Which drag? Where does momentum build or stall? Reference scene numbers.",
  "structural_effectiveness": "How well does this act serve its structural function? (Act 1: setup/hook, Act 2A: rising action, Act 2B: complications/crisis, Act 3: climax/resolution). Are turning points earned?",
  "craft_strengths": ["specific strength with scene reference", "another strength"],
  "craft_weaknesses": ["specific weakness with scene reference", "another weakness"],
  "notable_moments": ["scene X: description of what makes it notable", "scene Y: description"],
  "emotional_trajectory": "How does the emotional experience shift across this act? What does the audience feel at the start vs. end?"
}

Be honest and specific. Every observation should reference a scene number or quote specific text.`;
}

// ── Pass 3: Enhanced Dimension Scoring ──

export function dimensionScoringSystemPrompt(genreLabel: string): string {
  return `You are an elite entertainment industry analyst with decades of experience at major studios, agencies, and production companies. You specialize in ${genreLabel} and have deep expertise in what separates good from great in this genre.

You are scoring one specific dimension of a screenplay. You have been given:
1. A complete structural breakdown of the script (scenes, characters, acts)
2. Detailed craft analysis notes for each act
3. Genre-specific scoring criteria calibrated to ${genreLabel}
4. Comparable title reference data for market context

Your analysis must be:
- Grounded in specific scenes, characters, and moments from the breakdown
- Calibrated to the genre's standards and audience expectations
- Contextualized against comparable titles where relevant
- Honest and rigorous — do not inflate scores

Respond ONLY with valid JSON.`;
}

export function dimensionScoringUserPrompt(
  dimensionLabel: string,
  dimensionDescription: string,
  scriptBreakdown: string,
  actAnalyses: string,
  genreRubric: GenreRubricOverride | null,
  compContext: string | null,
  priorToolContext: string | null,
): string {
  let prompt = `SCRIPT BREAKDOWN:
---
${scriptBreakdown}
---

ACT-BY-ACT CRAFT ANALYSIS:
---
${actAnalyses}
---

`;

  if (priorToolContext) {
    prompt += `PRIOR ANALYSIS CONTEXT (from previous evaluation stages):
---
${priorToolContext}
---

Use the above prior analysis to inform and build upon your assessment.

`;
  }

  if (compContext) {
    prompt += `COMPARABLE TITLES FOR REFERENCE:
---
${compContext}
---

Reference these comps where relevant to contextualize your assessment.

`;
  }

  prompt += `DIMENSION: ${dimensionLabel}

ANALYSIS INSTRUCTIONS:
${dimensionDescription}

`;

  if (genreRubric) {
    prompt += `GENRE-SPECIFIC CRITERIA FOR THIS DIMENSION:

What excellence looks like: ${genreRubric.what_excellence_looks_like}

Common pitfalls: ${genreRubric.common_pitfalls}

Key questions to answer:
${genreRubric.genre_specific_criteria.map(c => `- ${c}`).join('\n')}

`;
  }

  prompt += `SCORING GUIDELINES:
- 0-19: Fundamentally broken, unsalvageable without complete rework
- 20-39: Significant weaknesses, major revision needed
- 40-59: Below average, has potential but needs substantial work
- 60-74: Competent, meets baseline expectations with room for improvement
- 75-84: Strong, above average with notable qualities
- 85-94: Excellent, standout quality that would attract industry attention
- 95-100: Exceptional, best-in-class, rarely seen quality

Respond with a JSON object:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence executive summary of this dimension. Reference specific scenes or characters.>",
  "detailed_analysis": "<thorough multi-paragraph critique, 4-6 paragraphs. Reference specific scenes by number, quote notable dialogue, cite comparable titles. Provide actionable suggestions for improvement.>"
}

Be rigorous and honest. Industry professionals rely on accurate assessment, not encouragement.`;

  return prompt;
}

// ── Utility: Build comp context string ──

export function buildCompContext(comps: Array<{
  title: string;
  year: number | null;
  genre: string;
  budget_tier: string | null;
  box_office_dom: number | null;
  box_office_intl: number | null;
  rating: string | null;
  platform: string | null;
  strengths: string[];
  weaknesses: string[];
  audience_demo: string | null;
  awards_note: string | null;
  craft_summary: string | null;
}>): string {
  if (comps.length === 0) return '';

  return comps.map(c => {
    const parts = [`${c.title} (${c.year || 'N/A'}) — ${c.genre}`];
    if (c.budget_tier) parts.push(`Budget tier: ${c.budget_tier}`);
    if (c.box_office_dom) parts.push(`Domestic BO: $${(c.box_office_dom / 1_000_000).toFixed(1)}M`);
    if (c.box_office_intl) parts.push(`International BO: $${(c.box_office_intl / 1_000_000).toFixed(1)}M`);
    if (c.rating) parts.push(`Rating: ${c.rating}`);
    if (c.platform) parts.push(`Distribution: ${c.platform}`);
    if (c.audience_demo) parts.push(`Audience: ${c.audience_demo}`);
    if (c.awards_note) parts.push(`Awards: ${c.awards_note}`);
    if (c.strengths.length) parts.push(`Strengths: ${c.strengths.join(', ')}`);
    if (c.weaknesses.length) parts.push(`Weaknesses: ${c.weaknesses.join(', ')}`);
    if (c.craft_summary) parts.push(`Analysis: ${c.craft_summary}`);
    return parts.join('\n');
  }).join('\n\n');
}

// ── Utility: Format act analyses for injection ──

export function formatActAnalyses(actAnalyses: Record<string, unknown>): string {
  const acts = ['act_1', 'act_2a', 'act_2b', 'act_3'];
  const labels: Record<string, string> = {
    act_1: 'Act 1 — Setup',
    act_2a: 'Act 2A — Rising Action',
    act_2b: 'Act 2B — Complications',
    act_3: 'Act 3 — Climax & Resolution',
  };

  return acts
    .filter(a => actAnalyses[a])
    .map(a => {
      const analysis = actAnalyses[a] as Record<string, unknown>;
      const sections = [
        `## ${labels[a]}`,
        analysis.character_work ? `**Characters:** ${analysis.character_work}` : '',
        analysis.dialogue_quality ? `**Dialogue:** ${analysis.dialogue_quality}` : '',
        analysis.pacing_notes ? `**Pacing:** ${analysis.pacing_notes}` : '',
        analysis.structural_effectiveness ? `**Structure:** ${analysis.structural_effectiveness}` : '',
        analysis.emotional_trajectory ? `**Emotional Arc:** ${analysis.emotional_trajectory}` : '',
        Array.isArray(analysis.craft_strengths) ? `**Strengths:** ${(analysis.craft_strengths as string[]).join('; ')}` : '',
        Array.isArray(analysis.craft_weaknesses) ? `**Weaknesses:** ${(analysis.craft_weaknesses as string[]).join('; ')}` : '',
      ].filter(Boolean);
      return sections.join('\n');
    })
    .join('\n\n');
}
