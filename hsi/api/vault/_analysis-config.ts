export interface DimensionDef {
  key: string;
  label: string;
  weight: number;
  description: string;
}

export interface ToolDef {
  name: 'coverage' | 'relativity' | 'greenlight';
  label: string;
  tagline: string;
  dimensions: DimensionDef[];
  prerequisite: 'coverage' | 'relativity' | null;
  unlockThreshold: number;
}

export const TOOLS: ToolDef[] = [
  {
    name: 'coverage',
    label: 'HSI Coverage™',
    tagline: 'Evaluate',
    prerequisite: null,
    unlockThreshold: 0,
    dimensions: [
      {
        key: 'premise_concept',
        label: 'Premise & Concept',
        weight: 0.15,
        description: `Evaluate the core premise and concept of this project. Consider:
- Is the central idea compelling, original, and clearly articulated?
- Does the premise have a strong hook that would attract audiences, talent, and buyers?
- Can the concept sustain a full narrative (feature, series, or intended format)?
- Is the premise commercially viable — does it fit recognizable genre or market categories while offering something fresh?
- Does the logline or opening setup promise a story worth telling?
Provide specific examples from the text to support your assessment.`,
      },
      {
        key: 'structure_plot',
        label: 'Structure & Plot',
        weight: 0.15,
        description: `Analyze the narrative structure and plot construction. Consider:
- Does the story follow a coherent structural framework (three-act, five-act, non-linear, etc.) and does that choice serve the material?
- Are the act breaks, turning points, and climax well-placed and impactful?
- Is the plot logic sound — do events follow causally or does the story rely on coincidence and contrivance?
- Are subplots woven effectively into the main throughline?
- Does the story build momentum, or does it sag in places? Identify specific sections that drag or feel rushed.
- Is the ending satisfying and earned by what precedes it?
Cite specific structural moments and page/section references where possible.`,
      },
      {
        key: 'character_development',
        label: 'Character Development',
        weight: 0.15,
        description: `Evaluate character depth, arcs, and authenticity. Consider:
- Is the protagonist well-defined with clear wants, needs, flaws, and agency?
- Does the protagonist undergo meaningful transformation or reveal?
- Are supporting characters distinct, purposeful, and dimensionally written — or do they serve only as functional plot devices?
- Is the antagonist (if present) compelling with understandable motivation?
- Do character decisions drive the plot, or does the plot drag characters along?
- Are character voices distinct from one another?
- Are relationships between characters developed with nuance and specificity?
Reference specific characters and moments.`,
      },
      {
        key: 'dialogue',
        label: 'Dialogue',
        weight: 0.12,
        description: `Critique the quality and effectiveness of dialogue throughout. Consider:
- Does each character have a distinctive voice, speech pattern, and vocabulary?
- Is dialogue serving multiple purposes simultaneously (revealing character, advancing plot, conveying subtext)?
- Is there effective use of subtext — do characters say one thing while meaning another?
- Does the dialogue sound natural and speakable, or is it overly expository or "on the nose"?
- Are there standout exchanges or memorable lines?
- Does the dialogue match the tone and genre expectations?
- Is exposition handled gracefully through dialogue or does it feel like information dumps?
Quote specific dialogue passages in your analysis.`,
      },
      {
        key: 'theme_meaning',
        label: 'Theme & Meaning',
        weight: 0.10,
        description: `Assess the thematic depth and resonance of the project. Consider:
- What are the central themes, and are they explored with complexity rather than simplicity?
- Does the story have something meaningful to say about the human condition?
- Are themes woven organically into the narrative or do they feel imposed or preachy?
- Does the story reward deeper reading — are there layers of meaning beyond the surface plot?
- Are the themes relevant and resonant for contemporary audiences?
- Does the ending crystallize or comment on the themes in a satisfying way?
Identify specific thematic threads and how they manifest.`,
      },
      {
        key: 'emotional_impact',
        label: 'Emotional Impact',
        weight: 0.12,
        description: `Evaluate the emotional power and audience engagement of the project. Consider:
- Does the story create genuine emotional investment in the characters and their outcomes?
- Are there moments of real tension, surprise, humor, sadness, or triumph?
- Does the emotional journey feel earned or manipulative?
- Is the pacing of emotional beats effective — does the story give the audience time to feel?
- Would this story move an audience in a theater, at home, or on a device?
- Does it leave a lasting emotional impression or is it forgettable?
- Are the stakes (personal, physical, emotional) clear and escalating?
Describe specific emotional peaks and valleys in the narrative.`,
      },
      {
        key: 'pacing_rhythm',
        label: 'Pacing & Rhythm',
        weight: 0.10,
        description: `Analyze the pacing, rhythm, and momentum of the narrative. Consider:
- Does the story open with sufficient energy to hook the reader/viewer?
- Is the pace appropriate for the genre — thrillers should drive, dramas can breathe, comedies need timing?
- Are there sections that stall, meander, or feel padded?
- Does the second act maintain momentum or does it sag?
- Is the climax given appropriate weight and build-up?
- Are scene lengths varied effectively — mixing long development scenes with shorter, punchier ones?
- Does the overall length feel right, or is this over/under-written?
Point to specific sections that exemplify pacing strengths or weaknesses.`,
      },
      {
        key: 'originality',
        label: 'Originality',
        weight: 0.11,
        description: `Judge the originality and creative distinctiveness of this project. Consider:
- Does this feel fresh, or is it derivative of existing well-known works?
- If working within familiar genre territory, does it find a unique angle or voice?
- Are there genuinely surprising choices in plot, character, or structure?
- Does the world-building or setting offer something audiences haven't seen before?
- Is the writing voice distinctive — would you recognize this writer's work?
- Does it take creative risks, and do those risks pay off?
- How does it distinguish itself in a crowded market of similar projects?
Compare to relevant existing works to contextualize your originality assessment.`,
      },
    ],
  },
  {
    name: 'relativity',
    label: 'HSI Relativity™',
    tagline: 'Position',
    prerequisite: 'coverage',
    unlockThreshold: 60,
    dimensions: [
      {
        key: 'genre_market_fit',
        label: 'Genre & Market Fit',
        weight: 0.20,
        description: `Analyze how well this project fits current market demand and genre expectations. Consider:
- What genre(s) does this project occupy, and how is that genre performing commercially right now?
- Does it deliver on genre expectations while offering enough novelty to stand out?
- Is the genre oversaturated or underserved in the current marketplace?
- What budget tier does this project naturally fit (micro-budget, mid-range, tentpole)?
- Does the genre/budget combination have a track record of returns?
- Are there current buyer mandates or studio slates that align with this type of project?
Reference real market trends and recent industry data in your assessment.`,
      },
      {
        key: 'target_audience',
        label: 'Target Audience',
        weight: 0.18,
        description: `Define and evaluate the target audience for this project. Consider:
- Who is the primary audience demographic (age, gender, psychographic profile)?
- Is there a clear secondary audience that could expand reach?
- How large is the addressable audience — niche passion project or four-quadrant potential?
- Does the content, tone, and subject matter align with what this audience actually watches and pays for?
- What rating/content level is appropriate, and does that align with audience expectations?
- Are there built-in audience communities (fandoms, social groups, cultural movements) this could tap into?
- What is the international appeal? Does this concept translate across cultures?
Be specific about audience segments and their viewing behaviors.`,
      },
      {
        key: 'comparable_titles',
        label: 'Comparable Titles (Comps)',
        weight: 0.18,
        description: `Identify and analyze comparable titles in the marketplace. Consider:
- Name 3-5 specific comparable projects that share genre, tone, audience, or concept DNA
- How did those comps perform commercially (box office, streaming metrics, awards)?
- What can we learn from the comps' marketing, positioning, and release strategies?
- Does this project fill a gap between existing comps or feel redundant?
- If you had to pitch this as "X meets Y," what would X and Y be, and does that combination excite?
- Are the comps recent enough to be relevant to current market conditions?
- Do the comps suggest an upward or downward trend for this type of content?
Name real titles with real performance data in your analysis.`,
      },
      {
        key: 'timing_cultural_relevance',
        label: 'Timing & Cultural Relevance',
        weight: 0.15,
        description: `Evaluate the cultural timing and relevance of this project. Consider:
- Does this project tap into current cultural conversations, anxieties, or movements?
- Is the subject matter timely — will it feel more or less relevant in 18-24 months (typical development timeline)?
- Are there upcoming cultural events, anniversaries, or trends that could boost interest?
- Does it risk being too tied to a specific moment that could pass?
- How does it relate to broader societal shifts in what audiences want to see?
- Is there cultural sensitivity considerations that could affect reception?
- Does it contribute something meaningful to the cultural conversation or feel opportunistic?
Reference specific cultural touchpoints and timing considerations.`,
      },
      {
        key: 'distribution_platform_fit',
        label: 'Distribution & Platform Fit',
        weight: 0.14,
        description: `Assess the ideal distribution pathway and platform fit. Consider:
- Is this best suited for theatrical, streaming (SVOD), cable/broadcast, or hybrid release?
- Which specific platforms/studios/networks would be the ideal home? Name them.
- Does the project's format, length, and content align with that platform's brand and audience?
- If a series, does it have multi-season potential? If a feature, franchise potential?
- What window strategy makes sense (theatrical-to-streaming, day-and-date, streaming-first)?
- Is this a premium content play or a volume/library title?
- Does the project's scope match what the target distributors are currently acquiring?
Be specific about platform strategies and distributor profiles.`,
      },
      {
        key: 'commercial_viability',
        label: 'Commercial Viability',
        weight: 0.15,
        description: `Provide an overall commercial viability assessment. Consider:
- What is a realistic budget range for producing this project?
- Given that budget, what revenue/viewership benchmarks would constitute success?
- Are there ancillary revenue opportunities (merchandise, IP extensions, franchising)?
- What is the risk/reward profile — could this be a breakout hit or is the ceiling limited?
- Are there elements that could attract pre-sales, tax incentives, or co-production funding?
- How does the projected ROI compare to alternative investments at the same budget level?
- What are the key financial risks and how could they be mitigated?
Provide realistic financial framing, not aspirational projections.`,
      },
    ],
  },
  {
    name: 'greenlight',
    label: 'HSI Greenlight™',
    tagline: 'Decide',
    prerequisite: 'relativity',
    unlockThreshold: 60,
    dimensions: [
      {
        key: 'investment_risk',
        label: 'Investment Risk Assessment',
        weight: 0.20,
        description: `Provide a comprehensive investment risk analysis. Consider:
- What are the primary risk factors for this project (creative, financial, market, reputational)?
- How dependent is success on specific attachments (star, director, showrunner)?
- What happens if the budget escalates — is there a floor on quality at lower budgets?
- Are there legal, rights, or IP risks?
- How sensitive is this project to market timing — does a 6-month delay significantly impact viability?
- What is the worst-case scenario and how bad is the downside?
- Are there comparable projects that failed, and what drove their failure?
- Rate the overall risk level and justify it with specific factors.
This should read like an investment memo risk section.`,
      },
      {
        key: 'revenue_potential',
        label: 'Revenue Potential',
        weight: 0.20,
        description: `Estimate the revenue potential across all windows and territories. Consider:
- Domestic theatrical or first-window revenue projections (range: low/mid/high)
- International potential — which territories are strongest for this type of content?
- Secondary windows (home entertainment, FAST channels, airline, library licensing)
- If streaming: subscriber acquisition potential, completion rates, social media buzz factor
- Awards potential and how that impacts long-tail revenue and prestige value
- IP extension opportunities (sequels, spinoffs, adaptations, merchandise, games)
- What is the realistic total addressable market for this project?
Provide a range-based revenue framework, not a single number. Reference comps for calibration.`,
      },
      {
        key: 'talent_attractiveness',
        label: 'Talent Attractiveness',
        weight: 0.15,
        description: `Assess how attractive this project is to key talent. Consider:
- Would A-list actors find compelling roles here? Which roles and why?
- Is the material the kind of project that attracts directors seeking awards or creative challenges?
- Does it offer opportunities for breakout performances?
- Is the writing quality strong enough that a writer-driven packaging strategy could work?
- Would established producers see this as a passion project or a commercial play?
- Are there roles that could attract talent seeking specific types of parts (against-type, transformation, etc.)?
- How does the project's prestige/commercial balance affect talent interest?
Name the tier and type of talent this would realistically attract.`,
      },
      {
        key: 'production_feasibility',
        label: 'Production Feasibility',
        weight: 0.15,
        description: `Evaluate the practical production feasibility. Consider:
- What is the realistic budget range and is it achievable for the scope described?
- Are there significant VFX, location, period, or logistical challenges?
- How long is the likely production timeline from greenlight to delivery?
- Are there favorable production incentives available (tax credits, rebates) in logical shoot locations?
- Can the project be produced at multiple budget levels, or does it require a specific minimum?
- Are there scheduling or seasonal constraints?
- What are the key production risks (weather, stunts, child actors, animals, etc.)?
- Is this a straightforward production or does complexity add risk?
Provide a practical production assessment, not a creative one.`,
      },
      {
        key: 'strategic_alignment',
        label: 'Strategic Alignment',
        weight: 0.10,
        description: `Assess how this project aligns with broader strategic objectives. Consider:
- Does this project build or strengthen an IP portfolio?
- Does it serve brand-building goals for a studio or platform?
- Could it open doors to new audience segments or demographics?
- Does it complement or compete with projects already in development?
- Is it the kind of project that generates cultural conversation and press coverage?
- Does it align with industry-wide pushes (diversity, international co-production, new formats)?
- Would greenlighting this project send the right signal to the creative community?
Frame this from the perspective of a studio or platform's slate strategy.`,
      },
      {
        key: 'overall_recommendation',
        label: 'Overall Recommendation',
        weight: 0.20,
        description: `Provide a definitive greenlight recommendation synthesizing all prior analysis. Consider:
- Summarize the key strengths that argue FOR greenlighting
- Summarize the key risks that argue AGAINST greenlighting
- What specific conditions would need to be true for this to succeed (attachments, budget level, timing)?
- What is your confidence level in this recommendation?
- If you recommend passing, what would need to change for reconsideration?
- If you recommend greenlighting, what are the critical next steps?
- Where does this project sit on a priority ranking — immediate greenlight, development with conditions, or pass?
- Provide a clear, decisive recommendation with a confidence score
This should be the executive summary a decision-maker reads last.`,
      },
    ],
  },
];

export function getToolDef(name: string): ToolDef | undefined {
  return TOOLS.find(t => t.name === name);
}

export function getDimensionDef(toolName: string, dimensionKey: string): DimensionDef | undefined {
  return getToolDef(toolName)?.dimensions.find(d => d.key === dimensionKey);
}
