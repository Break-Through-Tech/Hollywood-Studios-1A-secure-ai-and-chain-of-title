import { useInView } from '../hooks/useInView';

export function UpdatesSection() {
  const [ref, inView] = useInView(0.1);

  return (
    <section className="section reveal" ref={ref as React.RefObject<HTMLElement>}
      style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}>
      <h2 style={{ marginBottom: 8 }}>Updates</h2>
      <p className="section-sub" style={{ marginBottom: 40 }}>Keep up to date with the HSI product</p>

      <div className="updates-grid">
        {/* Featured card */}
        <div className="update-card featured">
          <div className="featured-visual">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="40" stroke="var(--gold)" strokeWidth="1" opacity="0.3" />
              <circle cx="60" cy="60" r="25" stroke="var(--gold)" strokeWidth="0.8" opacity="0.2" />
              <circle cx="60" cy="60" r="8" fill="var(--gold)" opacity="0.6" />
              <line x1="60" y1="20" x2="60" y2="100" stroke="var(--gold)" strokeWidth="0.5" opacity="0.15" />
              <line x1="20" y1="60" x2="100" y2="60" stroke="var(--gold)" strokeWidth="0.5" opacity="0.15" />
              <line x1="30" y1="30" x2="90" y2="90" stroke="var(--gold)" strokeWidth="0.5" opacity="0.1" />
              <line x1="90" y1="30" x2="30" y2="90" stroke="var(--gold)" strokeWidth="0.5" opacity="0.1" />
            </svg>
          </div>
          <div className="card-tag">HSI Blog</div>
          <div className="card-title">Building intelligence with taste.</div>
          <a href="#" className="card-link">Read post →</a>
        </div>

        {/* Right column top */}
        <div className="update-card" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div style={{ flex: 1, paddingRight: 20 }}>
            <div className="card-tag">HSI Labs</div>
            <div className="card-title">Introducing HSI Pro</div>
            <div className="card-desc">
              Our most advanced AI built for studio professionals. It understands your slate at the deepest levels.
            </div>
            <a href="#" className="card-link">Learn more →</a>
          </div>
          <div className="card-accent" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.12))' }}>
            <span className="card-accent-icon" style={{ color: '#6366F1' }}>⚡</span>
          </div>
        </div>

        {/* Right column bottom */}
        <div className="update-card" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div style={{ flex: 1, paddingRight: 20 }}>
            <div className="card-tag">Update</div>
            <div className="card-title">Explore HSI Studio</div>
            <div className="card-desc">
              Test drive the HSI studio with our new interactive project workspace.
            </div>
            <a href="#" className="card-link">Open studio →</a>
          </div>
          <div className="card-accent" style={{ background: 'linear-gradient(135deg, rgba(176,141,47,0.2), rgba(176,141,47,0.08))' }}>
            <span className="card-accent-icon" style={{ color: 'var(--gold)' }}>H</span>
          </div>
        </div>
      </div>
    </section>
  );
}
