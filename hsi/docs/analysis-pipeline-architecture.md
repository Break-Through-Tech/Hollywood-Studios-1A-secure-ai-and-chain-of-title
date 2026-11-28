# Intelligence Pipeline Architecture

## Overview

A hierarchical multi-pass analysis system that transforms raw scripts into industry-veteran-level coverage across three tools: Coverage, Relativity, and Greenlight. Each analysis runs through multiple passes that build on each other, producing grounded, scene-specific analysis rather than generic AI output.

---

## Multi-Pass Flow

### Pass 1: Script Decomposition (new)

**Purpose:** Create a compressed, structured representation of the full script that fits within context windows and grounds all subsequent analysis in specific scenes.

**Input:** Raw script text (30-50k tokens)

**Output:** A structured breakdown stored as `script_breakdown` JSONB on the vault analysis record.

```
{
  metadata: {
    title, genre, subgenre, format (feature/pilot/limited),
    estimated_page_count, time_period, setting, tone
  },
  characters: [
    { name, role (protagonist/antagonist/supporting), 
      first_appearance (scene #), arc_summary }
  ],
  scenes: [
    { number, slug_line (INT/EXT, LOCATION, TIME),
      characters_present, beat_summary (1-2 sentences),
      emotional_tone, estimated_pages }
  ],
  act_structure: {
    act_1: { scenes: [1-25], turning_point },
    act_2a: { scenes: [26-55], midpoint },
    act_2b: { scenes: [56-80], turning_point },
    act_3: { scenes: [81-105], climax, resolution }
  },
  genre_signals: [list of detected genre conventions/tropes]
}
```

**Implementation:** This is a single LLM call with a specialized prompt. The script is sent in full (or near-full) — this is the one pass that needs the largest context window. The output is a ~3-5k token structured document that captures everything downstream passes need.

**Why this matters:** Every subsequent analysis call receives this breakdown instead of the raw script, so they can reference specific scenes by number and make structural observations across the full narrative arc without needing 50k tokens of context.

---

### Pass 2: Act-Level Deep Analysis (new)

**Purpose:** Produce detailed analytical notes for each act, examining craft elements that require reading continuous sequences of scenes.

**Input:** Script breakdown (from Pass 1) + raw script text for one act at a time

**Output:** 4 act analyses (one per structural unit) stored as `act_analyses` JSONB.

```
{
  act_1: {
    character_introductions: "how effectively are characters established",
    world_building: "how well is the world/rules set up",
    hook_strength: "does the opening grab attention",
    inciting_incident: "clarity and impact of the catalyst",
    dialogue_samples: ["notable lines with scene references"],
    pacing_notes: "scene-by-scene rhythm observations",
    craft_flags: ["specific issues or strengths with scene refs"]
  },
  act_2a: { ... midpoint_effectiveness, subplot_tracking ... },
  act_2b: { ... escalation_quality, character_growth ... },
  act_3: { ... climax_payoff, resolution_satisfaction, thematic_landing ... }
}
```

**Implementation:** 4 sequential LLM calls, one per act. Each receives the full script breakdown (for context) plus the raw text of that act's scenes. This is where the model does close reading — examining dialogue line by line, tracking character voice consistency, evaluating scene transitions.

**Why this matters:** This creates the analytical foundation that dimension scoring draws from. Instead of asking the model to simultaneously read AND evaluate, we separate the two concerns. The act analyses become evidence that dimension scores cite.

---

### Pass 3: Dimension Scoring (enhanced existing)

**Purpose:** Score each dimension with genre-calibrated rubrics, grounded in the scene breakdown and act analyses, contextualized against comparable titles.

**Input per dimension call:**
- Script breakdown (from Pass 1)
- Act analyses (from Pass 2)
- Genre-specific scoring rubric
- Comparable title reference data
- Prior tool results (for Relativity/Greenlight)

**Output:** Same as current — score (0-100), summary, detailed_analysis — but now the analysis references specific scenes, characters, and comp titles.

**Enhancement over current:** The model no longer needs to read the script. It's working from structured analytical notes and a comprehensive breakdown. This means:
- Responses are grounded in specific scenes ("Scene 34's revelation undermines the setup in Scene 12")
- Analysis naturally compares against comps ("Unlike Parasite's class commentary, this script's social critique remains surface-level")
- Scoring follows genre-appropriate rubrics rather than one-size-fits-all

---

## Genre Configuration System

### Structure

```typescript
interface GenreConfig {
  key: string;              // 'thriller', 'comedy', 'drama', etc.
  label: string;
  subgenres: string[];      // for auto-detection refinement
  
  // What matters most in this genre (adjusts scoring emphasis)
  scoring_weights: {
    premise_concept: number;     // default 0.15
    structure_plot: number;      // default 0.15
    character_development: number;
    dialogue: number;
    theme_meaning: number;
    emotional_impact: number;
    pacing_rhythm: number;
    originality: number;
  };
  
  // Genre-specific evaluation criteria injected into prompts
  rubric_overrides: {
    [dimensionKey: string]: {
      what_excellence_looks_like: string;
      common_pitfalls: string;
      genre_specific_criteria: string[];
    };
  };
  
  // Reference points for this genre
  comp_pool_tags: string[];   // tags to filter comp_references
}
```

### Genre Configs (initial set)

**Thriller/Suspense**
- Elevated weights: pacing_rhythm (0.15), structure_plot (0.18)
- Reduced weights: theme_meaning (0.07)
- Rubric: "Tension must escalate across acts, not plateau. Clock/stakes must be clear by end of Act 1. Misdirection should reward re-reading, not feel like cheating."
- Pitfalls: "False tension from withheld information vs earned tension from dramatic irony. Twists that invalidate character motivations."

**Horror**
- Elevated weights: emotional_impact (0.16), pacing_rhythm (0.14)
- Rubric: "Atmosphere is as important as scares. The rules of the threat must be internally consistent. Dread > shock. Character decisions must feel plausible under fear."
- Pitfalls: "Over-reliance on jump scares in description. Characters making inexplicably stupid decisions. Unclear mythology."

**Comedy**
- Elevated weights: dialogue (0.18), character_development (0.16)
- Rubric: "Comedy works when grounded in character truth. Joke density matters but so does variety — physical, verbal, situational. Comedic setups must pay off."
- Pitfalls: "Mistaking cruelty for humor. Sacrificing character consistency for a joke. Comedy that only works in performance, not on page."

**Drama**
- Elevated weights: character_development (0.18), theme_meaning (0.14), emotional_impact (0.15)
- Rubric: "Character change must be earned through specific dramatic events, not announced. Subtext > text. Restraint in emotional peaks makes them land harder."
- Pitfalls: "Melodrama. Characters as mouthpieces for themes. Endings that resolve too neatly."

**Action/Adventure**
- Elevated weights: pacing_rhythm (0.16), structure_plot (0.16), premise_concept (0.16)
- Rubric: "Set pieces must escalate in stakes and creativity, not just scale. Hero's competence must be established before tested. World-building should be embedded in action, not exposition."
- Pitfalls: "Action without emotional stakes. Invincible protagonists. Reliance on spectacle over story logic."

**Sci-Fi**
- Elevated weights: premise_concept (0.18), originality (0.14), theme_meaning (0.13)
- Rubric: "The speculative element must be load-bearing to the story — if you can tell the same story without it, the sci-fi is decoration. Internal logic must be consistent. Exposition must be dramatized."

**Romance/Rom-Com**
- Elevated weights: character_development (0.18), dialogue (0.16), emotional_impact (0.14)
- Rubric: "Both leads must be fully realized, not just the protagonist. The obstacle to love must be internal and meaningful, not a misunderstanding. Chemistry lives in specificity of interaction."

**Biopic/True Story**
- Elevated weights: character_development (0.18), structure_plot (0.16)
- Rubric: "Must justify the cinematic format — what does this reveal that a documentary couldn't? Compression of timeline must feel natural. The subject's contradiction/complexity is the story."

---

## Comp Reference System

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS comp_references (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  year        INTEGER,
  genre       TEXT NOT NULL,
  subgenre    TEXT,
  tags        TEXT[] DEFAULT '{}',
  
  -- Market data
  budget_tier     TEXT CHECK (budget_tier IN ('micro', 'low', 'mid', 'high', 'tentpole')),
  box_office_dom  BIGINT,
  box_office_intl BIGINT,
  rating          TEXT,        -- PG, PG-13, R
  platform        TEXT,        -- theatrical, streaming, hybrid
  
  -- Analysis reference points
  strengths       TEXT[],      -- ['tight plotting', 'subversive genre work']
  weaknesses      TEXT[],      -- ['thin supporting cast']
  audience_demo   TEXT,        -- 'M18-34', 'broad quadrant', etc.
  awards_note     TEXT,        -- 'Oscar nom for screenplay', etc.
  
  -- Craft notes (what makes this a useful comp)
  craft_summary   TEXT,        -- 2-3 sentences on why this is notable
  
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_refs_genre ON comp_references(genre);
CREATE INDEX IF NOT EXISTS idx_comp_refs_tags ON comp_references USING gin(tags);
```

### How Comps Are Used

**In Relativity (Pass 3):** When scoring "Comparable Titles" and "Commercial Viability" dimensions, the prompt receives 3-5 relevant comps matched by genre + subgenre + detected tone. The analysis references how the script's market positioning compares.

**In Greenlight (Pass 3):** "Revenue Potential" and "Investment Risk" dimensions receive budget/box office data from comps to ground financial projections in reality.

**Comp Selection Logic:**
```
1. Filter by genre match
2. Filter by subgenre/tag overlap with detected genre_signals
3. Prefer comps from last 10 years (recency)
4. Prefer comps with similar budget_tier (if detectable from script scope)
5. Return top 5 ranked by relevance score
```

### Initial Comp Data

Seeded with ~100 well-known titles across all genres with pre-written craft summaries. Not a complete database — a curated set of strong reference points that a veteran reader would naturally cite. Examples:

- **Get Out** (2017, Horror/Thriller): "Subverted genre expectations by embedding social commentary in horror mechanics. Every comedic beat serves tension release. The Sunken Place is a masterclass in visual metaphor."
- **Parasite** (2019, Drama/Thriller): "Genre-fluid structure that shifts without losing coherence. Class commentary embedded in architecture and spatial relationships. Every setup pays off."
- **Bridesmaids** (2011, Comedy): "Character-driven comedy where every set piece reveals character. Ensemble managed without losing protagonist focus. Vulnerability as comedy engine."

---

## Pipeline Execution Flow

### Timing Expectations (approximate)

| Pass | Calls | Est. Time per Call | Total |
|------|-------|--------------------|-------|
| 1. Decomposition | 1 | 30-60s | ~45s |
| 2. Act Analysis | 4 | 20-40s each | ~2min |
| 3. Coverage (8 dims) | 8 | 15-25s each | ~2.5min |
| 3. Relativity (6 dims) | 6 | 15-25s each | ~2min |
| 3. Greenlight (6 dims) | 6 | 15-25s each | ~2min |
| **Total full pipeline** | **25 calls** | | **~9min** |

This feels right — a real coverage reader spends 2-4 hours. Nine minutes with visible progress feels thorough without being interminable.

### Frontend UX During Execution

**New pre-analysis phase visible to user:**

```
Step 1/3: Reading script...
  ✓ Identifying structure and characters
  ✓ Mapping scene-by-scene breakdown
  → Analyzing Act 1 of 4...

Step 2/3: Deep analysis...
  ✓ Act 1 — Setup & Inciting Incident
  ✓ Act 2A — Rising Action & Midpoint  
  → Act 2B — Complications & Crisis
  ○ Act 3 — Climax & Resolution

Step 3/3: Scoring dimensions...
  ✓ Premise & Concept — 78
  ✓ Structure & Plot — 72
  → Character Development...
```

Passes 1 and 2 run once and are shared across all three tools. If you run Coverage, the decomposition and act analysis are stored. When you later run Relativity, it skips straight to Pass 3 using the existing breakdown.

---

## Storage Changes

### New columns on `vault_analyses`

```sql
ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS script_breakdown JSONB;
ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS act_analyses JSONB;
ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS detected_genre TEXT;
ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS comp_ids INTEGER[];
```

`script_breakdown` and `act_analyses` are stored once (on the Coverage run) and referenced by Relativity/Greenlight. `detected_genre` is set during decomposition and drives rubric selection. `comp_ids` records which comps were selected for traceability.

---

## LLM Hosting

### Requirements
- **Context window:** 64k+ tokens (for Pass 1 with full script)
- **Model quality:** 70B+ parameter for nuanced analysis
- **Privacy:** Self-hosted, no data retention by provider
- **Output quality:** Must produce coherent multi-paragraph analysis with scene references

### Recommended Setup
- **Provider:** Dedicated GPU instance (RunPod, Lambda Labs, or Vast.ai)
- **Serving:** vLLM or text-generation-inference (TGI) for OpenAI-compatible API
- **Model:** Llama 3.1 70B-Instruct or Qwen 2.5 72B-Instruct
- **Hardware:** 2x A100 80GB or 4x A6000 48GB (for 70B at reasonable speed)
- **API compatibility:** Swap Ollama's `POST /api/generate` for vLLM's `POST /v1/chat/completions` — same interface the code already expects, just different URL

### Migration Path
The current `_ollama.ts` calls Ollama's `/api/generate`. Refactor to:
1. New `_llm.ts` module that supports both Ollama (local dev) and vLLM/TGI (production)
2. Environment variable `LLM_PROVIDER=ollama|vllm` switches behavior
3. Same response contract — the analysis pipeline doesn't care which backend serves it

---

## File Changes Summary

### New files
- `api/vault/_genre-config.ts` — Genre configs with rubrics and weight overrides
- `api/vault/_comp-references.ts` — Comp selection logic
- `api/vault/_llm.ts` — Unified LLM client (replaces _ollama.ts)
- `api/vault/_prompts.ts` — All prompt templates (decomposition, act analysis, dimension scoring)
- `api/vault/analysis/decompose.ts` — Pass 1 endpoint
- `api/vault/analysis/act-analysis.ts` — Pass 2 endpoint

### Modified files
- `api/vault/analysis/run.ts` — Enhanced to use breakdown + act analyses + genre rubrics + comps
- `api/vault/_analysis-config.ts` — Add genre-aware weight system
- `src/components/VaultAnalysisPanel.tsx` — New pre-analysis UI, genre display, comp references in results
- `schema.sql` — New columns + comp_references table

### Deprecated
- `api/vault/_ollama.ts` — Replaced by `_llm.ts`
