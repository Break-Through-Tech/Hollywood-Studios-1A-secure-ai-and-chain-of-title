import { useInView } from '../hooks/useInView';

export function StatsSection() {
  const [ref, inView] = useInView(0.15);

  const coverageScore = 85;
  const storyScore = 82;
  const commercialScore = 88;

  return (
    <section className="section reveal" ref={ref as React.RefObject<HTMLElement>} style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}>

      {/* ── Security Layer ── */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 16 }}>Security Layer</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 14, color: 'var(--text-muted)', marginBottom: 32 }}>
          <span>Studios</span>
          <span><span style={{ color: 'var(--border)', marginRight: 24 }}>·</span>Creative OS</span>
        </div>
        <h2 style={{ marginBottom: 16 }}>Secure & Inspire</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 17, lineHeight: 1.7, maxWidth: 680, margin: '0 auto', fontWeight: 300 }}>
          A secure creative environment where ideas are developed, refined, and protected — ensuring your work remains <span className="phrase-highlight">private, owned, and verifiable</span> at every stage.
        </p>
      </div>

      <div className="intel-grid-2" style={{ marginBottom: 80 }}>
        {/* HSI Studios */}
        <div style={{ background: '#293758', borderRadius: 20, padding: '36px 32px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', marginBottom: 6 }}>HSI Studios™</div>
          <div style={{ fontSize: 14, color: '#aabbcc', marginBottom: 20 }}>Create</div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: 28, flex: 1 }}>
            Our split-screen AI workspace puts intelligence beside your work — helping you refine story, materials, and positioning while staying in creative flow.
          </p>
          <button className="lp-btn lp-btn-secondary" style={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.12)', fontSize: 13, padding: '10px 20px', width: 'fit-content', marginBottom: 28 }}>Apply for Access</button>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 11, color: '#fff', fontFamily: 'monospace', marginBottom: 8, letterSpacing: '0.03em' }}>INT. COFFEE SHOP - DAY</div>
            <div style={{ fontSize: 12, color: '#aabbcc', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>A cozy corner booth. Rain streaks the window.</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 3, borderRadius: 2, background: '#fff', alignSelf: 'stretch', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Sarah</div>
                <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>I never thought I'd see you again.</div>
              </div>
            </div>
          </div>
        </div>

        {/* HSI Vault */}
        <div style={{ background: '#293758', borderRadius: 20, padding: '36px 32px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A855F7', marginBottom: 6 }}>HSI Creative OS™</div>
          <div style={{ fontSize: 14, color: '#aabbcc', marginBottom: 20 }}>Protect</div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: 28, flex: 1 }}>
            Every file is cryptographically hashed and timestamped, creating immutable proof of ownership — because your creative work deserves true protection.
          </p>
          <button className="lp-btn lp-btn-secondary" style={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.12)', fontSize: 13, padding: '10px 20px', width: 'fit-content', marginBottom: 28 }}>Apply to Secure Your Work</button>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))',
                border: '1px solid rgba(168,85,247,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#A855F7',
              }}>&#9670;</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc' }}>SHA-256 Encrypted</div>
                <div style={{ fontSize: 11, color: '#8899bb', fontFamily: 'monospace' }}>a7f8e9d2c3b4a5f6...</div>
              </div>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: 6, padding: '5px 12px', fontSize: 11, color: '#A855F7', fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A855F7', display: 'inline-block' }} />
              VERIFIED · MARCH 10, 2026
            </div>
          </div>
        </div>
      </div>

      {/* ── Intelligence Layer ── */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 16 }}>Intelligence Layer</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 14, color: 'var(--text-muted)', marginBottom: 32 }}>
          <span>Coverage</span>
          <span><span style={{ color: 'var(--border)', marginRight: 24 }}>·</span>Relativity</span>
          <span><span style={{ color: 'var(--border)', marginRight: 24 }}>·</span>Greenlight</span>
        </div>
        <h2 style={{ marginBottom: 16 }}>The Decision Engine</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 17, lineHeight: 1.7, maxWidth: 680, margin: '0 auto', fontWeight: 300 }}>
          The decision engine of Hollywood Studios Intelligence™ (HSI) — where AI, industry intelligence, and creative instinct determine what gets made, powered by patent-pending technology.
        </p>
      </div>

      <div className="intel-grid-3">
        {/* HSI Coverage */}
        <div style={{ background: '#293758', borderRadius: 20, padding: '36px 32px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', marginBottom: 6 }}>Coverage</div>
          <div style={{ fontSize: 14, color: '#aabbcc', marginBottom: 20 }}>Analyze</div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: 28, flex: 1 }}>
            Turn any project into actionable intelligence — analyzing story, emotion, structure, and commercial potential with precision and speed.
          </p>
          <button className="lp-btn lp-btn-secondary" style={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.12)', fontSize: 13, padding: '10px 20px', width: 'fit-content', marginBottom: 28 }}>Generate Coverage Insights</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#2a2a30" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#fff" strokeWidth="6"
                  strokeDasharray={`${(coverageScore / 100) * 213.6} 213.6`}
                  strokeLinecap="round" transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dasharray 1s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#e0e0e0' }}>{coverageScore}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#b0bccc', marginBottom: 4 }}><span>Story</span><span>{storyScore}%</span></div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: '#fff', width: `${storyScore}%`, transition: 'width 1s ease' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#b0bccc', marginBottom: 4 }}><span>Commercial</span><span>{commercialScore}%</span></div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: '#fff', width: `${commercialScore}%`, transition: 'width 1s ease' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HSI Relativity */}
        <div style={{ background: '#293758', borderRadius: 20, padding: '36px 32px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3B82F6', marginBottom: 6 }}>Relativity</div>
          <div style={{ fontSize: 14, color: '#aabbcc', marginBottom: 20 }}>Compare</div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: 28, flex: 1 }}>
            Map your project against real-world demand, comps, and audience behavior — so you know exactly where it fits and why it matters.
          </p>
          <button className="lp-btn lp-btn-secondary" style={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.12)', fontSize: 13, padding: '10px 20px', width: 'fit-content', marginBottom: 28 }}>Discover Market Position</button>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.1)', position: 'relative', height: 120 }}>
            <div style={{ fontSize: 10, color: '#7788aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Market Position Map</div>
            <svg width="100%" height="70" viewBox="0 0 200 70">
              {[
                { cx: 30, cy: 50, r: 6, fill: '#3B82F6', opacity: 0.3 },
                { cx: 65, cy: 35, r: 5, fill: '#3B82F6', opacity: 0.3 },
                { cx: 95, cy: 45, r: 7, fill: '#3B82F6', opacity: 0.3 },
                { cx: 130, cy: 20, r: 12, fill: '#3B82F6', opacity: 0.8 },
                { cx: 155, cy: 40, r: 5, fill: '#3B82F6', opacity: 0.2 },
                { cx: 175, cy: 55, r: 4, fill: '#3B82F6', opacity: 0.2 },
              ].map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.opacity} />)}
              <polygon points="130,8 142,20 130,32 118,20" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
            </svg>
          </div>
        </div>

        {/* HSI Greenlight */}
        <div style={{ background: '#293758', borderRadius: 20, padding: '36px 32px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 6 }}>Greenlight</div>
          <div style={{ fontSize: 14, color: '#aabbcc', marginBottom: 20 }}>Predict</div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: 28, flex: 1 }}>
            Surface the projects most likely to succeed — backed by data, signals, and predictive insight. Decide what gets made with intelligence instead of guesswork.
          </p>
          <button className="lp-btn lp-btn-secondary" style={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.12)', fontSize: 13, padding: '10px 20px', width: 'fit-content', marginBottom: 28 }}>Access Greenlight Intelligence</button>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(22,163,74,0.2), rgba(22,163,74,0.05))',
              border: '2px solid rgba(22,163,74,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}>
              <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, letterSpacing: '0.05em' }}>GO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#e0e0e0' }}>94%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#b0bccc', marginBottom: 4 }}>Success Probability</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ height: 5, flex: 1, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: 100 }}>
                  <div style={{ height: '100%', borderRadius: 3, background: '#16a34a', width: '94%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: 'rgba(22,163,74,0.1)', padding: '2px 8px', borderRadius: 4 }}>Top 5%</span>
                <span style={{ fontSize: 11, color: '#aabbcc' }}>Market Fit</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
