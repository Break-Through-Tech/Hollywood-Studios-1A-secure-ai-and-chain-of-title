import { useState, type ReactNode } from 'react';
import { useInView } from '../hooks/useInView';
import { IconScript, IconTrend } from './Icons';

interface PersonaCard {
  bubble?: string;
  time?: string;
  hasTyping?: boolean;
  hasAttachment?: boolean;
  attachTitle?: string;
  attachSub?: string;
  hasOpinion?: boolean;
  opinionTitle?: string;
  opinionText?: string;
  stat?: string;
  badge?: string;
}

interface Step {
  n: string;
  text: ReactNode;
}

const content: Record<string, { cards: PersonaCard[]; steps: Step[] }> = {
  independent: {
    cards: [
      { bubble: "I'm developing a psychological thriller feature", time: 'Read 7:01am', hasTyping: true },
      { bubble: "Here's some comparable titles and structures...", hasAttachment: true, attachTitle: 'Gone Girl × Nightcrawler', attachSub: 'Comp Analysis' },
      { hasOpinion: true, opinionTitle: 'Opinion', opinionText: 'Your protagonist lacks a clear want in Act 1. Adding a tangible goal will strengthen the first 15 pages — your last script did this well.', stat: 'Above Avg Engagement', badge: '3.1x' },
    ],
    steps: [
      { n: '1.', text: <span><strong>Tell HSI what you're building.</strong> HSI will analyze your concept against thousands of comparable titles to shape your creative strategy.</span> },
      { n: '2.', text: <span><strong>Learn what's working in your genre.</strong> HSI guides you through narrative structures, casting strategies, and market dynamics active right now.</span> },
      { n: '3.', text: <span><strong>Keep creating and HSI keeps learning.</strong> As your project evolves, HSI refines its analysis — getting sharper with every draft.</span> },
    ],
  },
  studio: {
    cards: [
      { bubble: 'Evaluate this IP for series adaptation potential', time: 'Read 9:15am', hasTyping: true },
      { bubble: "Here's the market analysis and talent landscape...", hasAttachment: true, attachTitle: 'IP Valuation Report', attachSub: 'Market Analysis' },
      { hasOpinion: true, opinionTitle: 'Insight', opinionText: 'This IP has strong franchise potential. Similar adaptations in the last 24 months averaged 2.8x ROI. Recommend limited series format for de-risked entry.', stat: 'Projected ROI', badge: '2.8x' },
    ],
    steps: [
      { n: '1.', text: <span><strong>Feed HSI your development slate.</strong> HSI will cross-reference market data, talent, and audience demand signals across your portfolio.</span> },
      { n: '2.', text: <span><strong>Get greenlight intelligence.</strong> HSI scores projects on 40+ dimensions — from comp title performance to director-genre fit — so you invest with confidence.</span> },
      { n: '3.', text: <span><strong>Track performance in real time.</strong> As projects move through production, HSI monitors every signal and adjusts its models continuously.</span> },
    ],
  },
};

export function PersonaSection() {
  const [ref, inView] = useInView(0.1);
  const [persona, setPersona] = useState<'independent' | 'studio'>('independent');
  const c = content[persona];

  return (
    <section className="section reveal" ref={ref as React.RefObject<HTMLElement>}
      style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2>Meets you where you're at</h2>
        <p className="section-sub" style={{ margin: '16px auto 36px', maxWidth: 560, textAlign: 'center' }}>
          HSI's intelligence adapts to wherever you are in your creative journey, and grows with you as you scale.
        </p>
        <div className="persona-toggle">
          <button className={`persona-btn ${persona === 'independent' ? 'active' : ''}`}
            onClick={() => setPersona('independent')}>
            <IconScript /> Independent Creator
          </button>
          <button className={`persona-btn ${persona === 'studio' ? 'active' : ''}`}
            onClick={() => setPersona('studio')}>
            <IconTrend /> Studio Professional
          </button>
        </div>
      </div>

      <div className="persona-cards" key={persona} style={{ animation: 'fadeInUp 0.5s ease both' }}>
        {c.cards.map((card, i) => (
          <div className="persona-card" key={i}>
            {card.bubble && <div className="card-bubble">{card.bubble}</div>}
            {card.time && <div className="card-time">{card.time}</div>}
            {card.hasTyping && (
              <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(d => (
                  <div key={d} style={{
                    width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)',
                    animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
            {card.hasAttachment && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 12, padding: '12px 16px',
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: 'var(--bg)',
                }}>H</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{card.attachTitle}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.attachSub}</div>
                </div>
              </div>
            )}
            {card.hasOpinion && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 12, padding: '16px 18px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                  {card.opinionTitle}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 12 }}>
                  {card.opinionText}
                </div>
                <div className="analysis-card-stat">
                  {card.stat} <span className="badge">{card.badge}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="steps-row" style={{ animation: 'fadeInUp 0.6s ease 0.2s both' }}>
        {c.steps.map((s, i) => (
          <div className="step-card" key={i}>
            <div className="step-number">{s.n}</div>
            <div className="step-text">{s.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
