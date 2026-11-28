import { useState } from 'react';
import { useInView } from '../hooks/useInView';
import { ConstellationBg } from './ConstellationBg';
import { MockBubbleUser, MockBubbleHSI, MockTimestamp, MockCard, MockTag, MockBar } from './MockUI';

/* ── Slide Mocks ── */

function MockChat() {
  return (
    <div style={{ display: 'flex', gap: 24, position: 'relative', zIndex: 2, minHeight: 340, overflow: 'hidden' }}>
      <div className="mock-sidebar" style={{ width: 180, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', flexShrink: 0 }}>
        {['"There was a secret buried in the third act..."', '"When the studio saw the dailies, everything shifted..."', '"I was opening a door that couldn\'t be closed..."'].map((q, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, fontStyle: 'italic' }}>{q}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <MockBubbleUser text="Analyze the market for elevated horror with female leads" />
          <MockTimestamp text="Read 7:01am" />
          <MockBubbleHSI text="Let me check the current landscape." />
          <MockBubbleHSI text="Analyzing comparable titles..." loading />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 4 }}>
            {['#1a1a2e', '#2e1a1a', '#1a2e1a', '#2d1b4e', '#1b2838'].map((c, i) => (
              <div key={i} style={{ width: 56, height: 78, borderRadius: 6, background: `linear-gradient(160deg, ${c}, #0e1520)`, border: '1px solid var(--border)' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', marginTop: 20 }}>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text-muted)' }}>Reply to HSI</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="7" y1="12" x2="7" y2="2" /><polyline points="3,6 7,2 11,6" /></svg>
            </div>
          </div>
        </div>
      </div>
      <div className="mock-sidebar" style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', flexShrink: 0 }}>
        <MockCard style={{ fontSize: 12, color: 'var(--text-dim)' }}><span style={{ fontWeight: 600, color: 'var(--text)' }}>Analysis</span><br />Genre supply down 22%</MockCard>
        <MockCard style={{ fontSize: 12, color: 'var(--text-dim)' }}><span style={{ fontWeight: 600, color: 'var(--text)' }}>Reply</span><br />3 comparable scripts found</MockCard>
      </div>
    </div>
  );
}

function MockScriptEditor() {
  return (
    <div style={{ display: 'flex', gap: 20, position: 'relative', zIndex: 2, minHeight: 340, overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', borderRadius: 12, padding: '28px 24px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {['U', 'B', 'I'].map((t, i) => <span key={i} style={{ width: 28, height: 24, borderRadius: 4, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t}</span>)}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Words: 847</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 2 }}>
          <p style={{ marginBottom: 12 }}><span style={{ background: 'rgba(41,55,88,0.08)', padding: '2px 4px', borderRadius: 3 }}>The detective arrived</span> at the estate as the last light drained from the sky. <span style={{ background: 'rgba(41,55,88,0.08)', padding: '2px 4px', borderRadius: 3 }}>And three hours later, discovered the witness wasn't alone.</span></p>
          <p style={{ marginBottom: 12, color: 'var(--text-dim)' }}>She first started appearing in the background of crime scene photos a few weeks ago. No one noticed at first.</p>
          <p style={{ marginBottom: 12, color: 'var(--text-dim)' }}>But then the surveillance footage went missing, and the lead detective couldn't stop thinking about who was erasing the trail.</p>
          <p style={{ color: 'var(--text-dim)' }}>So she built a case from nothing.</p>
        </div>
      </div>
      <div className="mock-sidebar" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
        <MockCard>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>New Chat</div>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>Make the opening hook sharper — match my best-performing cold opens</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>Your two strongest scripts open with sensory detail and an unanswered question. This draft opens with exposition — <strong style={{ color: 'var(--text)' }}>try leading with the arrival image</strong>.</div>
        </MockCard>
        <MockCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Apply Change?</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>✕</div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>✓</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>The detective arrived at the estate.</span><br />
            <span style={{ color: 'var(--text)' }}>Rain hammered the estate roof as the detective stepped from the car.</span>
          </div>
        </MockCard>
      </div>
    </div>
  );
}

function MockBeatBoard() {
  const beats = [
    { n: 1, title: 'Cold Open', tag: 'HOOK', tagColor: '#C9A84C', cards: [{ type: 'Action', text: 'Detective arrives at rain-soaked estate at dusk.' }, { type: 'Dialog', text: '"I was told this would be straightforward."' }] },
    { n: 2, title: 'Discovery', tag: 'SETUP', tagColor: '#3B82F6', cards: [{ type: 'Action', text: 'Witness found in locked room — not alone.' }, { type: 'Dialog', text: '"She never came close enough to identify."' }, { type: 'Note', text: 'Build tension through withholding.' }] },
    { n: 3, title: 'Unraveling', tag: 'TENSION', tagColor: '#EF4444', cards: [{ type: 'Action', text: 'Surveillance footage goes missing overnight.' }, { type: 'Dialog', text: '"Someone is erasing the trail before we find it."' }] },
    { n: 4, title: 'Revelation', tag: 'CLIMAX', tagColor: '#10B981', cards: [{ type: 'Action', text: 'The detective realizes the witness was the suspect all along.' }] },
  ];

  return (
    <div style={{ position: 'relative', zIndex: 2, minHeight: 340, overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 20px', fontSize: 13, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Add this Beat?
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#dc2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff' }}>✕</span>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff' }}>✓</span>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        {beats.map((b) => (
          <div key={b.n} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MockCard style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}><span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{b.n}</span>{b.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⋮⋮</span>
              </div>
              <MockTag label={b.tag} color={b.tagColor} />
            </MockCard>
            {b.cards.map((c, i) => (
              <MockCard key={i} style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {c.type === 'Action' && '⚡'}{c.type === 'Dialog' && '💬'}{c.type === 'Note' && '📋'} {c.type}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{c.text}</div>
              </MockCard>
            ))}
            <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>+ Add Card</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockAnalytics() {
  const chartPoints = [40, 55, 48, 62, 78, 72, 85, 92, 88, 95, 110, 105];
  const maxY = 120;
  const svgW = 500;
  const svgH = 140;
  const pathD = chartPoints.map((v, i) => `${(i / (chartPoints.length - 1)) * svgW},${svgH - (v / maxY) * svgH}`).join(' ');

  return (
    <div style={{ display: 'flex', gap: 20, position: 'relative', zIndex: 2, minHeight: 340, overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #1a1a2e, #2d1b4e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff' }}>S</div>
            <div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>The Signal</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Elevated Thriller</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Market Score: 87', 'Audience: 92%'].map((s, i) => <span key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--text-dim)' }}>{s}</span>)}
          </div>
        </div>
        <MockCard style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div><span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 12 }}>Comp Performance</span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Audience Index</span></div>
            <div style={{ display: 'flex', gap: 4 }}>{['7d', '30d', '90d', '1y'].map((t, i) => <span key={i} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, color: i === 1 ? '#fff' : 'var(--text-muted)', background: i === 1 ? 'var(--navy)' : 'transparent', border: '1px solid var(--border)' }}>{t}</span>)}</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>8,940,847</div>
          <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <polyline points={pathD} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" />
            <polyline points={`0,${svgH} ${pathD} ${svgW},${svgH}`} fill="rgba(22,163,74,0.08)" stroke="none" />
          </svg>
        </MockCard>
        <MockCard style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3B82F6' }}>● MAY 3, 2PM</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>Comp title "The Hollow" just crossed $100M domestic, validating the elevated horror thesis.</div>
          <div style={{ width: 50, height: 35, borderRadius: 6, background: 'linear-gradient(135deg,#2e1a1a,#111)', flexShrink: 0 }} />
        </MockCard>
      </div>
      <div className="mock-sidebar" style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
        <MockCard style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>48h Market Signals</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} /><span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>2,147</span></div>
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 8, height: 30, alignItems: 'flex-end' }}>
            {Array.from({ length: 20 }, (_, i) => { const x = Math.sin(i + 1) * 10000; return 15 + (x - Math.floor(x)) * 85; }).map((h, i) => <div key={i} style={{ width: 4, height: `${h}%`, background: '#16a34a', borderRadius: 1, opacity: 0.6 + h / 250 }} />)}
          </div>
        </MockCard>
        <MockCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Contributing:</div>
          {[{ t: 'The Hollow', v: '$102M' }, { t: 'Night Moves', v: '$67M' }, { t: 'Inheritance', v: '$43M' }].map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: 'linear-gradient(135deg,#1a1a2e,#111)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{c.t}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ height: 3, borderRadius: 2, background: '#16a34a', width: `${60 + i * 15}%` }} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.v}</span></div>
              </div>
            </div>
          ))}
        </MockCard>
      </div>
    </div>
  );
}

function MockGreenlight() {
  return (
    <div style={{ display: 'flex', gap: 24, position: 'relative', zIndex: 2, minHeight: 340, overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>Greenlight Assessment</div>
          <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>87<span style={{ fontSize: 24, color: 'var(--text-muted)' }}>/100</span></div>
          <div style={{ fontSize: 13, color: '#16a34a', marginTop: 4 }}>Top 15% of candidates</div>
        </div>
        <MockCard style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Score Breakdown</div>
          <MockBar label="Script Quality" value={91} max={100} color="var(--navy)" />
          <MockBar label="Market Timing" value={88} max={100} color="var(--navy)" />
          <MockBar label="Package Strength" value={82} max={100} color="var(--navy)" />
          <MockBar label="Audience Ceiling" value={79} max={100} color="#EF4444" />
          <MockBar label="Budget Efficiency" value={85} max={100} color="var(--navy)" />
        </MockCard>
      </div>
      <div className="mock-sidebar" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
        <MockCard>
          <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>● Opportunities</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>Director-genre alignment is in the 95th percentile. International pre-sales potential is above median for this budget tier.</div>
        </MockCard>
        <MockCard>
          <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>● Risks</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>Budget-to-audience ceiling ratio is tight. Consider restructuring the third-act set piece or exploring co-financing.</div>
        </MockCard>
        <MockCard>
          <div style={{ fontSize: 12, color: '#3B82F6', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>● Recommendation</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}><strong style={{ color: 'var(--text)' }}>Proceed with conditions.</strong> Address budget risk and this project moves to top-decile confidence.</div>
        </MockCard>
      </div>
    </div>
  );
}

/* ── Carousel ── */

const carouselSlides = [
  { title: 'Ask HSI anything', desc: 'Brainstorm ideas, plan your creative strategy, or break down why a comparable title performed the way it did. HSI holds your entire project world in its head and brings that depth to every conversation.', mock: MockChat },
  { title: 'Write with intelligence', desc: "Every script revision is informed by the storytelling mechanics that drive engagement in your genre. Write together in real time, refine structure, and sharpen dialogue until it's ready for the room.", mock: MockScriptEditor },
  { title: 'Turn concepts into structure', desc: "Outline is a modular beat board designed for HSI's intelligence. HSI doesn't just suggest — it moves beats, rearranges structure, and builds the framework in front of you. You direct. It builds.", mock: MockBeatBoard },
  { title: 'All your analytics, one dashboard', desc: "Every comp title, every market signal, every audience data point — live. Start from the top, then go deeper. Genre by genre, title by title. Each layer shows exactly what's driving the numbers above it.", mock: MockAnalytics },
  { title: 'Greenlight with confidence', desc: "HSI scores every project across 40+ dimensions — from script structure and comp performance to director-genre fit and market timing — giving you a data-backed confidence signal before you commit.", mock: MockGreenlight },
];

export function AnalysisSection() {
  const [ref, inView] = useInView(0.1);
  const [activeIdx, setActiveIdx] = useState(0);
  const slide = carouselSlides[activeIdx];
  const goTo = (idx: number) => setActiveIdx((idx + carouselSlides.length) % carouselSlides.length);

  const slideWidth = 'min(1100px, calc(100vw - 80px))';
  const offset = `calc(-${activeIdx} * (${slideWidth} + 24px))`;

  return (
    <section className="section" ref={ref as React.RefObject<HTMLElement>} style={{ maxWidth: '100%', padding: '120px 0', overflow: 'hidden' }}>
      <div className="reveal" style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}>
        <div className="carousel-track-wrapper">
          <div className="carousel-track" style={{ transform: `translateX(${offset})` }}>
            {carouselSlides.map((s, i) => {
              const Mock = s.mock;
              return (
                <div className="carousel-slide" key={i}>
                  <div className="carousel-panel">
                    <ConstellationBg count={20} color="rgba(0,0,0,0.02)" dotColor="rgba(0,0,0,0.03)" />
                    <Mock />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div key={`t-${activeIdx}`} className="carousel-text" style={{ animation: 'fadeInUp 0.4s ease 0.1s both' }}>
          <h2 style={{ marginBottom: 12, fontSize: 'clamp(28px, 3vw, 40px)' }}>{slide.title}</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 16, lineHeight: 1.7, maxWidth: 720 }}>{slide.desc}</p>
        </div>

        <div className="carousel-nav">
          <button className="carousel-arrow" onClick={() => goTo(activeIdx - 1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="10,3 5,8 10,13" /></svg>
          </button>
          <div className="carousel-dots">
            {carouselSlides.map((_, i) => (
              <button key={i} className={`carousel-dot ${activeIdx === i ? 'active' : ''}`} onClick={() => goTo(i)} />
            ))}
          </div>
          <button className="carousel-arrow" onClick={() => goTo(activeIdx + 1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6,3 11,8 6,13" /></svg>
          </button>
        </div>
      </div>
    </section>
  );
}
