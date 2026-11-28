import { useCallback, useEffect, useState } from 'react';

type ToolName = 'coverage' | 'relativity' | 'greenlight';
type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'decomposing' | 'analyzing';
type EffectiveStatus = 'locked' | 'ready' | 'running' | 'completed' | 'failed';
type PipelinePhase = 'idle' | 'decomposing' | 'act_analysis' | 'scoring';

interface DimensionDef {
  key: string;
  label: string;
  weight: number;
}

interface DimensionResult {
  dimension: string;
  label: string;
  score: number;
  weight: number;
  summary: string;
  detailed_analysis: string;
  completed_at: string;
}

interface AnalysisResult {
  tool: ToolName;
  status: AnalysisStatus;
  overall_score: number | null;
  dimensions: DimensionResult[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  detected_genre?: string | null;
  script_breakdown?: unknown;
  act_analyses?: unknown;
}

interface ToolDef {
  name: ToolName;
  label: string;
  tagline: string;
  dimensions: DimensionDef[];
  prerequisite: ToolName | null;
  unlockThreshold: number;
}

const TOOLS: ToolDef[] = [
  {
    name: 'coverage', label: 'Coverage', tagline: 'Analyze',
    prerequisite: null, unlockThreshold: 0,
    dimensions: [
      { key: 'premise_concept', label: 'Premise & Concept', weight: 0.15 },
      { key: 'structure_plot', label: 'Structure & Plot', weight: 0.15 },
      { key: 'character_development', label: 'Character Development', weight: 0.15 },
      { key: 'dialogue', label: 'Dialogue', weight: 0.12 },
      { key: 'theme_meaning', label: 'Theme & Meaning', weight: 0.10 },
      { key: 'emotional_impact', label: 'Emotional Impact', weight: 0.12 },
      { key: 'pacing_rhythm', label: 'Pacing & Rhythm', weight: 0.10 },
      { key: 'originality', label: 'Originality', weight: 0.11 },
    ],
  },
  {
    name: 'relativity', label: 'Relativity', tagline: 'Compare',
    prerequisite: 'coverage', unlockThreshold: 60,
    dimensions: [
      { key: 'genre_market_fit', label: 'Genre & Market Fit', weight: 0.20 },
      { key: 'target_audience', label: 'Target Audience', weight: 0.18 },
      { key: 'comparable_titles', label: 'Comparable Titles', weight: 0.18 },
      { key: 'timing_cultural_relevance', label: 'Timing & Cultural Relevance', weight: 0.15 },
      { key: 'distribution_platform_fit', label: 'Distribution & Platform Fit', weight: 0.14 },
      { key: 'commercial_viability', label: 'Commercial Viability', weight: 0.15 },
    ],
  },
  {
    name: 'greenlight', label: 'Greenlight', tagline: 'Predict',
    prerequisite: 'relativity', unlockThreshold: 60,
    dimensions: [
      { key: 'investment_risk', label: 'Investment Risk', weight: 0.20 },
      { key: 'revenue_potential', label: 'Revenue Potential', weight: 0.20 },
      { key: 'talent_attractiveness', label: 'Talent Attractiveness', weight: 0.15 },
      { key: 'production_feasibility', label: 'Production Feasibility', weight: 0.15 },
      { key: 'strategic_alignment', label: 'Strategic Alignment', weight: 0.10 },
      { key: 'overall_recommendation', label: 'Overall Recommendation', weight: 0.20 },
    ],
  },
];

const ACT_KEYS = ['act_1', 'act_2a', 'act_2b', 'act_3'] as const;
const ACT_LABELS: Record<string, string> = {
  act_1: 'Act 1 — Setup',
  act_2a: 'Act 2A — Rising Action',
  act_2b: 'Act 2B — Complications',
  act_3: 'Act 3 — Climax & Resolution',
};

const GENRE_LABELS: Record<string, string> = {
  thriller: 'Thriller / Suspense',
  horror: 'Horror',
  comedy: 'Comedy',
  drama: 'Drama',
  action: 'Action / Adventure',
  scifi: 'Science Fiction',
  romance: 'Romance',
  biopic: 'Biopic / True Story',
};

function scoreColor(score: number): string {
  if (score < 40) return 'var(--bad)';
  if (score < 60) return '#f59e0b';
  if (score < 75) return '#eab308';
  return 'var(--good)';
}

function scoreLabel(score: number): string {
  if (score < 20) return 'Critical';
  if (score < 40) return 'Weak';
  if (score < 60) return 'Below Avg';
  if (score < 75) return 'Competent';
  if (score < 85) return 'Strong';
  if (score < 95) return 'Excellent';
  return 'Exceptional';
}

function getEffectiveStatus(
  tool: ToolDef,
  analyses: Record<ToolName, AnalysisResult | null>,
  runningTool: ToolName | null,
): EffectiveStatus {
  const analysis = analyses[tool.name];

  if (runningTool === tool.name) return 'running';

  if (tool.prerequisite) {
    const prereq = analyses[tool.prerequisite];
    if (!prereq || prereq.status !== 'completed' || (prereq.overall_score ?? 0) < tool.unlockThreshold) {
      return 'locked';
    }
  }

  if (!analysis) return 'ready';
  if (analysis.status === 'completed') return 'completed';
  if (analysis.status === 'failed') return 'failed';
  if (analysis.status === 'running' || analysis.status === 'decomposing' || analysis.status === 'analyzing') return 'ready';
  return 'ready';
}

export function VaultAnalysisPanel({ slug, email, projectContent, role = 'owner', hasAttachments = false }: {
  slug: string;
  email: string;
  projectContent: string;
  role?: 'owner' | 'viewer' | 'downloader';
  hasAttachments?: boolean;
}) {
  const hasContent = Boolean(projectContent.trim()) || hasAttachments;
  const isOwner = role === 'owner';
  const [analyses, setAnalyses] = useState<Record<ToolName, AnalysisResult | null>>({
    coverage: null, relativity: null, greenlight: null,
  });
  const [runningTool, setRunningTool] = useState<ToolName | null>(null);
  const [runningDimIndex, setRunningDimIndex] = useState(0);
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>('idle');
  const [actProgress, setActProgress] = useState<{ completed: string[]; current: string | null }>({ completed: [], current: null });
  const [detectedGenre, setDetectedGenre] = useState<string | null>(null);
  const [sceneCount, setSceneCount] = useState<number | null>(null);
  const [characterCount, setCharacterCount] = useState<number | null>(null);
  const [expandedTool, setExpandedTool] = useState<ToolName | null>(null);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/analysis/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyses(data);
        if (data.coverage?.detected_genre) setDetectedGenre(data.coverage.detected_genre);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [slug, email]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function runDecomposition(): Promise<boolean> {
    setPipelinePhase('decomposing');
    try {
      const res = await fetch('/api/vault/analysis/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Decomposition failed' }));
        throw new Error(err.error || 'Decomposition failed');
      }
      const data = await res.json();
      setDetectedGenre(data.genre);
      setSceneCount(data.scene_count || null);
      setCharacterCount(data.character_count || null);
      return true;
    } catch (err) {
      throw err;
    }
  }

  async function runActAnalysis(): Promise<boolean> {
    setPipelinePhase('act_analysis');
    setActProgress({ completed: [], current: null });

    for (const actKey of ACT_KEYS) {
      setActProgress(prev => ({ ...prev, current: actKey }));
      try {
        const res = await fetch('/api/vault/analysis/act-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, ownerEmail: email, actKey }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Act analysis failed' }));
          throw new Error(err.error || `Act analysis failed for ${actKey}`);
        }
        setActProgress(prev => ({
          completed: [...prev.completed, actKey],
          current: null,
        }));
      } catch (err) {
        throw err;
      }
    }
    return true;
  }

  async function runAnalysis(toolName: ToolName) {
    if (runningTool) return;
    if (!hasContent) return;

    const toolDef = TOOLS.find(t => t.name === toolName)!;
    setRunningTool(toolName);
    setExpandedTool(toolName);

    setAnalyses(prev => ({
      ...prev,
      [toolName]: {
        tool: toolName, status: 'running' as const,
        overall_score: null, dimensions: [],
        error_message: null, started_at: new Date().toISOString(),
        completed_at: null,
      },
    }));

    try {
      if (toolName === 'coverage') {
        const existing = analyses.coverage;
        const hasBreakdown = existing?.script_breakdown;

        if (!hasBreakdown) {
          await runDecomposition();
          await runActAnalysis();
        }
      }

      setPipelinePhase('scoring');

      for (let i = 0; i < toolDef.dimensions.length; i++) {
        setRunningDimIndex(i);
        const res = await fetch('/api/vault/analysis/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            ownerEmail: email,
            tool: toolName,
            dimensionKey: toolDef.dimensions[i].key,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
          setAnalyses(prev => ({
            ...prev,
            [toolName]: {
              ...prev[toolName]!,
              status: 'failed' as const,
              error_message: err.error || 'Analysis failed',
            },
          }));
          break;
        }

        const result = await res.json();
        if (result.genre && !detectedGenre) setDetectedGenre(result.genre);

        setAnalyses(prev => {
          const current = prev[toolName];
          const dims = [...(current?.dimensions || [])];
          dims.push({
            dimension: result.dimension,
            label: result.label,
            score: result.score,
            weight: toolDef.dimensions[i].weight,
            summary: result.summary,
            detailed_analysis: result.detailed_analysis,
            completed_at: new Date().toISOString(),
          });
          return {
            ...prev,
            [toolName]: {
              ...current!,
              status: result.tool_status,
              overall_score: result.overall_score,
              dimensions: dims,
            },
          };
        });
      }
    } catch (err) {
      setAnalyses(prev => ({
        ...prev,
        [toolName]: {
          ...prev[toolName]!,
          status: 'failed' as const,
          error_message: err instanceof Error ? err.message : 'Analysis failed',
        },
      }));
    }

    setRunningTool(null);
    setPipelinePhase('idle');
    await loadStatus();
  }

  async function resetAnalysis(toolName: ToolName) {
    if (runningTool) return;
    try {
      await fetch('/api/vault/analysis/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email, tool: toolName }),
      });
      if (toolName === 'coverage') {
        setDetectedGenre(null);
        setSceneCount(null);
        setCharacterCount(null);
      }
      await loadStatus();
    } catch { /* ignore */ }
  }

  if (!loaded) return null;

  const toolIcons: Record<ToolName, React.ReactNode> = {
    coverage: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    relativity: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    greenlight: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  };

  return (
    <div className="vault-analysis-section">
      <div className="vault-analysis-header">
        <div className="vault-analysis-header-top">
          <h2 className="vault-analysis-title">Intelligence <span className="vault-analysis-title-gold">Pipeline</span></h2>
          {detectedGenre && (
            <span className="vault-analysis-genre-badge">{GENRE_LABELS[detectedGenre] || detectedGenre}</span>
          )}
        </div>
        <div className="vault-analysis-crg">CRG Intel™</div>
        <p className="vault-analysis-subtitle">
          Three-stage AI analysis with hierarchical script decomposition.
          {sceneCount && characterCount && (
            <span className="vault-analysis-meta"> {sceneCount} scenes, {characterCount} characters mapped.</span>
          )}
        </p>
        <div className="vault-analysis-steps">
          {TOOLS.map((t, i) => {
            const status = getEffectiveStatus(t, analyses, runningTool);
            return (
              <span key={t.name} className={`vault-analysis-step vault-analysis-step--${status}`}>
                {i > 0 && <span className="vault-analysis-step-line"><span className={`vault-analysis-step-line-fill vault-analysis-step-line-fill--${status}`} /></span>}
                <span className={`vault-analysis-step-num vault-analysis-step-num--${status}`}>{i + 1}</span>
                <span className="vault-analysis-step-text">
                  <strong>{t.label.replace('HSI ', '').replace('™', '')}</strong>
                  <em>{t.tagline}</em>
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="vault-analysis-pipeline">
        {TOOLS.map(tool => {
          const status = getEffectiveStatus(tool, analyses, runningTool);
          const analysis = analyses[tool.name];
          const isExpanded = expandedTool === tool.name;

          return (
            <div
              key={tool.name}
              className={`vault-analysis-card vault-analysis-card--${status}`}
            >
              <div
                className="vault-analysis-card-header"
                onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setExpandedTool(isExpanded ? null : tool.name); }}
              >
                <span className={`vault-analysis-card-icon vault-analysis-card-icon--${status}`}>
                  {toolIcons[tool.name]}
                </span>
                <div className="vault-analysis-card-title">
                  <h3>{tool.label}</h3>
                  <span className="vault-analysis-tagline">{tool.tagline}</span>
                </div>

                <div className="vault-analysis-card-status">
                  {status === 'locked' && (
                    <span className="vault-analysis-lock">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Locked
                    </span>
                  )}
                  {status === 'ready' && isOwner && (
                    <button
                      className="btn btn-primary"
                      onClick={(e) => { e.stopPropagation(); runAnalysis(tool.name); }}
                      disabled={!hasContent}
                    >
                      Run Analysis
                    </button>
                  )}
                  {status === 'ready' && !isOwner && (
                    <span className="vault-analysis-lock" style={{ opacity: 0.5 }}>Owner only</span>
                  )}
                  {status === 'running' && (
                    <span className="vault-analysis-running">
                      <span className="vault-analysis-spinner" />
                      {pipelinePhase === 'decomposing' ? 'Reading...' :
                       pipelinePhase === 'act_analysis' ? 'Analyzing...' :
                       'Scoring...'}
                    </span>
                  )}
                  {status === 'completed' && analysis && (
                    <div className="vault-analysis-score">
                      <span className="vault-analysis-score-ring" style={{ borderColor: scoreColor(analysis.overall_score!) }}>
                        <span className="vault-analysis-score-num" style={{ color: scoreColor(analysis.overall_score!) }}>{analysis.overall_score}</span>
                      </span>
                      <span className="vault-analysis-score-label" style={{ color: scoreColor(analysis.overall_score!) }}>{scoreLabel(analysis.overall_score!)}</span>
                    </div>
                  )}
                  {status === 'failed' && (
                    <span className="vault-analysis-error-badge">Failed</span>
                  )}
                </div>

                <svg className={`vault-analysis-chevron ${isExpanded ? 'vault-analysis-chevron--open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </div>

              {status === 'locked' && isExpanded && (
                <div className="vault-analysis-card-body">
                  <p className="vault-analysis-lock-msg">
                    Complete {TOOLS.find(t => t.name === tool.prerequisite)?.label} with a score of {tool.unlockThreshold}+ to unlock this analysis.
                  </p>
                </div>
              )}

              {status === 'running' && isExpanded && (
                <div className="vault-analysis-card-body">
                  {pipelinePhase === 'decomposing' && (
                    <PreAnalysisProgress
                      phase="decomposing"
                      actProgress={actProgress}
                    />
                  )}
                  {pipelinePhase === 'act_analysis' && (
                    <PreAnalysisProgress
                      phase="act_analysis"
                      actProgress={actProgress}
                    />
                  )}
                  {pipelinePhase === 'scoring' && (
                    <>
                      <ProgressBar
                        current={analysis?.dimensions.length || 0}
                        total={tool.dimensions.length}
                        currentLabel={tool.dimensions[runningDimIndex]?.label || ''}
                      />
                      {analysis && analysis.dimensions.length > 0 && (
                        <div className="vault-analysis-dimensions">
                          {analysis.dimensions.map(dim => (
                            <DimensionRow
                              key={dim.dimension}
                              dim={dim}
                              expanded={expandedDim === dim.dimension}
                              onToggle={() => setExpandedDim(expandedDim === dim.dimension ? null : dim.dimension)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {status === 'completed' && analysis && isExpanded && (
                <div className="vault-analysis-card-body">
                  <div className="vault-analysis-dimensions">
                    {tool.dimensions.map(def => {
                      const dim = analysis.dimensions.find(d => d.dimension === def.key);
                      if (!dim) return null;
                      return (
                        <DimensionRow
                          key={dim.dimension}
                          dim={dim}
                          expanded={expandedDim === dim.dimension}
                          onToggle={() => setExpandedDim(expandedDim === dim.dimension ? null : dim.dimension)}
                        />
                      );
                    })}
                  </div>
                  {isOwner && (
                    <div className="vault-analysis-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => resetAnalysis(tool.name)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                        Re-run Analysis
                      </button>
                    </div>
                  )}
                </div>
              )}

              {status === 'failed' && isExpanded && (
                <div className="vault-analysis-card-body">
                  <p className="vault-analysis-error-msg">{analysis?.error_message || 'Analysis failed.'}</p>
                  {isOwner && (
                    <div className="vault-analysis-actions">
                      <button className="btn btn-primary" onClick={() => { resetAnalysis(tool.name).then(() => runAnalysis(tool.name)); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreAnalysisProgress({ phase, actProgress }: {
  phase: 'decomposing' | 'act_analysis';
  actProgress: { completed: string[]; current: string | null };
}) {
  return (
    <div className="vault-preanalysis">
      <div className="vault-preanalysis-phase">
        <div className={`vault-preanalysis-step ${phase === 'decomposing' ? 'vault-preanalysis-step--active' : 'vault-preanalysis-step--done'}`}>
          <span className="vault-preanalysis-step-icon">
            {phase !== 'decomposing' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <span className="vault-analysis-spinner vault-analysis-spinner--sm" />
            )}
          </span>
          <span className="vault-preanalysis-step-label">Reading script & mapping structure</span>
        </div>
      </div>

      {phase === 'act_analysis' && (
        <div className="vault-preanalysis-acts">
          {ACT_KEYS.map(actKey => {
            const isDone = actProgress.completed.includes(actKey);
            const isCurrent = actProgress.current === actKey;
            return (
              <div
                key={actKey}
                className={`vault-preanalysis-act ${isDone ? 'vault-preanalysis-act--done' : ''} ${isCurrent ? 'vault-preanalysis-act--active' : ''}`}
              >
                <span className="vault-preanalysis-act-icon">
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : isCurrent ? (
                    <span className="vault-analysis-spinner vault-analysis-spinner--sm" />
                  ) : (
                    <span className="vault-preanalysis-act-dot" />
                  )}
                </span>
                <span className="vault-preanalysis-act-label">{ACT_LABELS[actKey]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ current, total, currentLabel }: { current: number; total: number; currentLabel: string }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="vault-analysis-progress">
      <div className="vault-analysis-progress-track">
        <div className="vault-analysis-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="vault-analysis-progress-info">
        <span className="vault-analysis-progress-count">{current}/{total} dimensions</span>
        {currentLabel && current < total && <span className="vault-analysis-progress-label">Scoring {currentLabel}...</span>}
      </div>
    </div>
  );
}

function DimensionRow({ dim, expanded, onToggle }: { dim: DimensionResult; expanded: boolean; onToggle: () => void }) {
  const color = scoreColor(dim.score);
  return (
    <div className={`vault-analysis-dim ${expanded ? 'vault-analysis-dim--open' : ''}`}>
      <div className="vault-analysis-dim-header" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle(); }}>
        <span className="vault-analysis-dim-label">{dim.label}</span>
        <div className="vault-analysis-dim-bar-wrap">
          <div className="vault-analysis-dim-bar-track">
            <div className="vault-analysis-dim-bar" style={{ width: `${dim.score}%`, background: color }} />
          </div>
          <span className="vault-analysis-dim-score" style={{ color }}>{dim.score}</span>
        </div>
        <svg className={`vault-analysis-dim-chevron ${expanded ? 'vault-analysis-dim-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {expanded && (
        <div className="vault-analysis-dim-details">
          <p className="vault-analysis-dim-summary">{dim.summary}</p>
          <div className="vault-analysis-dim-full">{dim.detailed_analysis}</div>
        </div>
      )}
    </div>
  );
}
