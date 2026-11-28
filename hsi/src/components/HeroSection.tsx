import { ConstellationBg } from './ConstellationBg';

export function HeroSection() {
  return (
    <section className="hero" id="overview">
      <ConstellationBg count={50} color="rgba(255,255,255,0.06)" dotColor="rgba(255,255,255,0.1)" />

      <div className="hero-center" style={{ animation: 'fadeInUp 1s ease 0.2s both' }}>
        <div className="hero-logo-wrap">
          <img src="/hero-logo.png" alt="Hollywood Studios" className="hero-logo" />
        </div>
        <h1>
          From Idea to<br />
          <span className="gold-text"><em>Red Carpet</em></span>
        </h1>
        <p className="hero-sub">
          The trusted AI platform for the global creative industry — develop ideas, protect intellectual property, and move from idea to recognition to monetization.
        </p>
        <div className="hero-ctas">
          <button className="lp-btn lp-btn-primary">Get Started</button>
          <button className="lp-btn lp-btn-secondary lp-btn-secondary--hero">Learn More</button>
        </div>
      </div>
    </section>
  );
}
