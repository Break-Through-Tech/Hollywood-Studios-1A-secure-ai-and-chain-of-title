import { useState, useRef, useEffect } from 'react';
import { useInView } from '../hooks/useInView';
import { ConstellationBg } from './ConstellationBg';
import { IconScript, IconCasting, IconAudience, IconTrend, IconGreenlight, IconTracker } from './Icons';
import type { ReactNode } from 'react';

interface PrimaryNode {
  id: string;
  label: string;
  x: number;
  y: number;
  icon: ReactNode;
  desc: string;
}

const primaryNodes: PrimaryNode[] = [
  { id: 'analysis', label: "HSI's Analysis", x: 960, y: 680, icon: <IconScript />, desc: 'Deep script and narrative analysis powered by industry-trained AI.' },
  { id: 'market', label: 'Market Position', x: 1500, y: 620, icon: <IconTrend />, desc: 'Real-time market positioning against comparable titles and trends.' },
  { id: 'audience', label: 'Audience Fit', x: 900, y: 1120, icon: <IconAudience />, desc: 'Predictive audience demographics, sentiment, and engagement modeling.' },
  { id: 'talent', label: 'Talent Network', x: 1520, y: 1100, icon: <IconCasting />, desc: 'Cast and crew intelligence with availability and attachment tracking.' },
];

const secondaryNodes = [
  { label: 'Genre Trends', x: 620, y: 520, icon: <IconTrend /> },
  { label: 'Comp Titles', x: 1750, y: 450, icon: <IconScript /> },
  { label: 'Box Office', x: 1800, y: 820, icon: <IconAudience /> },
  { label: 'Streaming Data', x: 580, y: 1000, icon: <IconTracker /> },
  { label: 'IP Pipeline', x: 700, y: 1300, icon: <IconTracker /> },
  { label: 'Greenlight', x: 1700, y: 1300, icon: <IconGreenlight color="#16a34a" /> },
  { label: 'Script Coverage', x: 400, y: 650, icon: <IconScript /> },
  { label: 'Distribution', x: 1950, y: 1250, icon: <IconTrend /> },
  { label: 'International', x: 350, y: 1200, icon: <IconAudience /> },
  { label: 'Awards Circuit', x: 1550, y: 350, icon: <IconCasting /> },
  { label: 'Social Buzz', x: 900, y: 350, icon: <IconTracker /> },
  { label: 'Budget Model', x: 1400, y: 1550, icon: <IconTrend /> },
];

const insightCards = [
  { x: 420, y: 350, title: 'Genre Signal', text: 'Elevated horror supply down 22% — demand holding steady.', color: '#293758' },
  { x: 1850, y: 600, title: 'Comp Alert', text: 'Three titles in your vertical exceeded $100M domestic this quarter.', color: '#3B82F6' },
  { x: 350, y: 850, title: 'Audience Shift', text: 'F25-44 demo showing 34% increased interest in psychological thrillers.', color: '#10B981' },
  { x: 1900, y: 1050, title: 'Talent Window', text: 'Two A-list leads with open Q3 windows match your project profile.', color: '#A855F7' },
  { x: 500, y: 1450, title: 'IP Opportunity', text: 'Bestselling true crime podcast — rights available, built-in audience 2.4M.', color: '#EF4444' },
  { x: 1650, y: 1500, title: 'Score Update', text: 'Greenlight confidence improved to 87/100 after package revision.', color: '#16a34a' },
  { x: 200, y: 550, title: 'Coverage Note', text: 'Act 2 pacing flagged — similar structure in "Gone Girl" resolved with subplot compression.', color: '#293758' },
  { x: 2100, y: 450, title: 'Awards Tracker', text: 'Director shortlisted for two guild nominations — increases package value 18%.', color: '#A855F7' },
  { x: 150, y: 1050, title: 'Streaming Signal', text: 'Netflix acquiring elevated thrillers at 1.4x previous rate. Window closing Q4.', color: '#3B82F6' },
  { x: 2150, y: 850, title: 'Box Office Intel', text: 'Mid-budget thrillers averaging $67M DOM on $25M spend. Strong unit economics.', color: '#10B981' },
  { x: 300, y: 1550, title: 'Rights Alert', text: 'Adaptation rights for "The Vanishing Hour" podcast expiring in 60 days.', color: '#EF4444' },
  { x: 1900, y: 1450, title: 'Budget Flag', text: 'Third-act set piece pushing budget 12% over ceiling. Consider VFX alternatives.', color: '#EF4444' },
  { x: 750, y: 200, title: 'Social Momentum', text: '#ElevatedHorror trending across film Twitter. Conversation volume up 280% in 30 days.', color: '#3B82F6' },
  { x: 2050, y: 1250, title: 'Distribution', text: 'A24 and Neon both actively acquiring in this space. Pre-sales leverage is high.', color: '#16a34a' },
];

const dataPoints = [
  { x: 780, y: 400, label: '$1.2B', sub: 'Genre ceiling' },
  { x: 1650, y: 350, label: '9.1', sub: 'Avg comp rating' },
  { x: 450, y: 1150, label: '78%', sub: 'Awareness pred.' },
  { x: 1950, y: 900, label: '2.4x', sub: 'ROI benchmark' },
  { x: 850, y: 1400, label: '34%', sub: 'Growth signal' },
  { x: 1400, y: 1450, label: '40+', sub: 'Dimensions scored' },
  { x: 300, y: 420, label: '147', sub: 'Scripts analyzed' },
  { x: 2100, y: 700, label: '$67M', sub: 'Avg DOM gross' },
  { x: 600, y: 1550, label: '12', sub: 'Active IP leads' },
  { x: 1100, y: 280, label: '92%', sub: 'Script score' },
  { x: 1750, y: 1150, label: '3.1x', sub: 'Engagement mult.' },
  { x: 200, y: 1350, label: '$4.2M', sub: 'Intl pre-sales est.' },
];

const compPosters = [
  { x: 1600, y: 480, title: 'Gone Girl', year: '2014', gross: '$369M', gradient: ['#1a1a2e', '#16213e'] },
  { x: 1780, y: 530, title: 'Get Out', year: '2017', gross: '$255M', gradient: ['#2e1a1a', '#1f0f0f'] },
  { x: 1680, y: 600, title: 'Nightcrawler', year: '2014', gross: '$50M', gradient: ['#1b2838', '#0f1923'] },
  { x: 280, y: 700, title: 'Parasite', year: '2019', gross: '$266M', gradient: ['#1a2e1a', '#0f1f0f'] },
  { x: 180, y: 780, title: 'The Menu', year: '2022', gross: '$79M', gradient: ['#2d1b4e', '#1a1a2e'] },
  { x: 2050, y: 1100, title: 'Promising Young Woman', year: '2020', gross: '$35M', gradient: ['#2a1f0e', '#1a150a'] },
];

const talentNodes = [
  { x: 1580, y: 1020, name: 'Director A', tag: 'Available Q3', fit: 95 },
  { x: 1650, y: 1150, name: 'Lead Actor', tag: 'In negotiations', fit: 88 },
  { x: 1450, y: 1180, name: 'Writer B', tag: 'Attached', fit: 91 },
  { x: 1380, y: 1060, name: 'Producer C', tag: 'First look deal', fit: 82 },
];

const sparklines = [
  { x: 680, y: 580, label: 'Horror Supply', data: [40, 38, 35, 33, 30, 28, 31], color: '#EF4444', dir: 'down' as const },
  { x: 1850, y: 760, label: 'Thriller DOM', data: [45, 52, 58, 55, 67, 72, 78], color: '#16a34a', dir: 'up' as const },
  { x: 520, y: 1080, label: 'Stream Acq.', data: [20, 25, 22, 30, 35, 42, 48], color: '#3B82F6', dir: 'up' as const },
  { x: 1150, y: 1500, label: 'Budget Eff.', data: [70, 68, 72, 75, 71, 78, 82], color: '#293758', dir: 'up' as const },
];

const CENTER = { x: 1200, y: 900 };
const WORLD_W = 2400;
const WORLD_H = 1800;

export function BrainSection() {
  const [ref, inView] = useInView(0.2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.brain-node-interactive')) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ x: pan.x, y: pan.y });
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({ x: panStart.x + (e.clientX - dragStart.x), y: panStart.y + (e.clientY - dragStart.y) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    if (e.currentTarget) (e.currentTarget as HTMLElement).style.cursor = 'grab';
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [expanded]);

  return (
    <section
      className="section section-split reveal"
      ref={ref as React.RefObject<HTMLElement>}
      id="features"
      style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}
    >
      <div>
        <h2 style={{ marginBottom: 8 }}>The Network That Powers What Gets Made</h2>
        <p style={{ fontSize: 15, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 28 }}>
          From Idea → Recognition → Monetization
        </p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>The Platform</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Hollywood Studios™</div>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, margin: 0 }}>
            A verified network where creators, talent, studios, and capital connect, collaborate, and move projects forward.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Intelligence Layer</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Hollywood Studios Intelligence™ (HSI)</div>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, margin: 0 }}>
            Secure IP. Secure AI. <span className="phrase-highlight">Decision Engine.</span>
          </p>
        </div>

        <div style={{ marginBottom: 28 }}>
          <button className="lp-btn lp-btn-primary">Apply for Access</button>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
            Private Beta · Access by invitation and approved application.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>How HSI Works</h3>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 10 }}>
            HSI analyzes scripts, talent, audiences, market signals, and distribution dynamics — helping creators and studios make smarter creative and business decisions.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 0 }}>
            Drag around the map to explore how HSI connects projects, people, and market intelligence.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Security Layer</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Creative OS &amp; Studios</div>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, margin: 0 }}>
            A secure creative environment where ideas are developed, refined, and protected — ensuring your work remains private, owned, and verifiable at every stage.
          </p>
        </div>

        {activeNode && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
            borderRadius: 12, padding: '14px 18px', maxWidth: 360,
            fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6,
            animation: 'fadeInUp 0.3s ease both', marginBottom: 24,
          }}>
            {primaryNodes.find(n => n.id === activeNode)?.desc}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button className="lp-btn lp-btn-primary">Try HSI Free</button>
          <button className="lp-btn lp-btn-secondary">Join Waitlist</button>
        </div>
      </div>

      {expanded && <div className="brain-overlay" onClick={() => setExpanded(false)} />}
      <div
        ref={containerRef}
        className={`brain-container ${expanded ? 'brain-container--expanded' : ''}`}
        style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div style={{
          position: 'absolute', width: WORLD_W, height: WORLD_H,
          left: '50%', top: '50%',
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
          transformOrigin: 'center center',
          transition: dragging ? 'none' : 'transform 0.15s ease-out',
        }}>
          <ConstellationBg count={60} color="rgba(41,55,88,0.05)" dotColor="rgba(41,55,88,0.08)" />

          {/* Connection lines */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {primaryNodes.map(n => (
              <line key={n.id} x1={CENTER.x} y1={CENTER.y} x2={n.x} y2={n.y}
                stroke={activeNode === n.id ? 'rgba(41,55,88,0.4)' : 'rgba(41,55,88,0.12)'}
                strokeWidth={activeNode === n.id ? 2 : 1} style={{ transition: 'all 0.3s' }} />
            ))}
            {secondaryNodes.map((s, i) => {
              const nearest = primaryNodes.reduce((best, p) => {
                const d = Math.hypot(p.x - s.x, p.y - s.y);
                return d < best.d ? { p, d } : best;
              }, { p: primaryNodes[0], d: Infinity });
              return <line key={`s${i}`} x1={nearest.p.x} y1={nearest.p.y} x2={s.x} y2={s.y} stroke="rgba(41,55,88,0.08)" strokeWidth="0.8" strokeDasharray="4 4" />;
            })}
          </svg>

          {/* Center hub */}
          <div style={{ position: 'absolute', left: CENTER.x, top: CENTER.y, transform: 'translate(-50%,-50%)', zIndex: 5 }}>
            <div className="brain-center">
              <span style={{ fontSize: 28 }}>🎬</span>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Your Project</div>
          </div>

          {/* Primary nodes */}
          {primaryNodes.map(n => (
            <div key={n.id} className="brain-node-interactive" style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)', zIndex: 4 }}>
              <div className={`brain-node ${activeNode === n.id ? 'active' : ''}`}
                style={{ position: 'relative', transform: 'none' }}
                onClick={(e) => { e.stopPropagation(); setActiveNode(activeNode === n.id ? null : n.id); }}
                onPointerDown={(e) => e.stopPropagation()}>
                <span className="brain-node-icon">{n.icon}</span>{n.label}
              </div>
            </div>
          ))}

          {/* Secondary nodes */}
          {secondaryNodes.map((n, i) => (
            <div key={`sec${i}`} style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)', zIndex: 3 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <span style={{ opacity: 0.5, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n.icon}</span>
                {n.label}
              </div>
            </div>
          ))}

          {/* Insight cards */}
          {insightCards.map((c, i) => (
            <div key={`ins${i}`} style={{
              position: 'absolute', left: c.x, top: c.y, transform: 'translate(-50%,-50%)', zIndex: 3,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '14px 16px', width: 220, pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, color: c.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
                {c.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{c.text}</div>
            </div>
          ))}

          {/* Data point badges */}
          {dataPoints.map((d, i) => (
            <div key={`dp${i}`} style={{
              position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%,-50%)', zIndex: 2,
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', opacity: 0.15 }}>{d.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.sub}</div>
            </div>
          ))}

          {/* Comp title poster cards */}
          {compPosters.map((p, i) => (
            <div key={`cp${i}`} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', zIndex: 3 }}>
              <div style={{
                width: 80, height: 112, borderRadius: 8,
                background: `linear-gradient(160deg, ${p.gradient[0]}, ${p.gradient[1]})`,
                border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{p.year}</div>
                <div style={{ fontSize: 11, color: '#fff', fontWeight: 600, marginTop: 2 }}>{p.title}</div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: '#16a34a', fontWeight: 500 }}>{p.gross}</div>
            </div>
          ))}

          {/* Talent profile nodes */}
          {talentNodes.map((t, i) => (
            <div key={`tn${i}`} style={{ position: 'absolute', left: t.x, top: t.y, transform: 'translate(-50%,-50%)', zIndex: 3 }}>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '12px 16px', width: 160, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #A855F7, #6366F1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff',
                  }}>{t.name.charAt(0)}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.tag}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-elevated)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: t.fit > 90 ? '#16a34a' : '#C9A84C', width: `${t.fit}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>{t.fit}%</span>
                </div>
              </div>
            </div>
          ))}

          {/* Sparkline trend charts */}
          {sparklines.map((s, i) => {
            const max = Math.max(...s.data);
            const min = Math.min(...s.data);
            const w = 100;
            const h = 32;
            const pts = s.data.map((v, j) => `${(j / (s.data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(' ');
            return (
              <div key={`sp${i}`} style={{
                position: 'absolute', left: s.x, top: s.y, transform: 'translate(-50%,-50%)', zIndex: 2,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 14px', width: 140, pointerEvents: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.label}</span>
                  <span style={{ fontSize: 10, color: s.dir === 'up' ? '#16a34a' : '#EF4444', fontWeight: 600 }}>{s.dir === 'up' ? '↑' : '↓'}</span>
                </div>
                <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
                  <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
            );
          })}
        </div>

        {expanded && (
          <button style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
            border: '1px solid var(--border)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
            fontSize: 18, fontWeight: 300, lineHeight: 1,
          }} onClick={(e) => { e.stopPropagation(); setExpanded(false); setPan({ x: 0, y: 0 }); setScale(1); }}
             onPointerDown={(e) => e.stopPropagation()}>
            ✕
          </button>
        )}

        {/* UI overlay */}
        <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', zIndex: 10, pointerEvents: 'none' }}>
          Drag to explore · Scroll to zoom
        </div>
        <button style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 10,
          width: 32, height: 32, borderRadius: 8, background: 'var(--bg-card)',
          border: '1px solid var(--border)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)',
        }} onClick={() => { setExpanded(e => !e); setPan({ x: 0, y: 0 }); setScale(1); }}>
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="5,1 1,1 1,5" /><polyline points="9,13 13,13 13,9" /><polyline points="1,9 1,13 5,13" /><polyline points="13,5 13,1 9,1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="1,5 1,1 5,1" /><polyline points="9,1 13,1 13,5" /><polyline points="13,9 13,13 9,13" /><polyline points="5,13 1,13 1,9" />
            </svg>
          )}
        </button>
      </div>

      <div style={{
        textAlign: 'center', marginTop: 48, paddingTop: 24,
        borderTop: '1px solid var(--border)',
        fontSize: 15, color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.02em',
      }}>
        <span className="phrase-highlight">Relationships Drive Creation</span> <span style={{ color: 'var(--text-muted)', margin: '0 12px' }}>|</span> <span className="phrase-highlight">Infrastructure Drives Scale</span>
      </div>
    </section>
  );
}
