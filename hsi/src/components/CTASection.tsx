import { useInView } from '../hooks/useInView';

export function CTASection() {
  const [ref, inView] = useInView(0.2);

  return (
    <section className="section reveal" ref={ref as React.RefObject<HTMLElement>} id="pricing"
      style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}>
      <div style={{
        background: 'var(--navy)',
        borderRadius: 28,
        padding: 'clamp(48px, 8vw, 100px) clamp(24px, 6vw, 80px)',
        textAlign: 'center',
        maxWidth: 1100,
        margin: '0 auto',
      }}>
        <h2 style={{
          color: '#fff',
          fontSize: 'clamp(32px, 4vw, 52px)',
          fontWeight: 700,
          marginBottom: 20,
          fontStyle: 'italic',
        }}>
          Join / Early Access
        </h2>
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: 16,
          lineHeight: 1.7,
          maxWidth: 640,
          margin: '0 auto 36px',
          fontWeight: 300,
        }}>
          Creators and industry professionals: join the platform and participate in the early stages. Help shape the future of how creative projects are developed, protected, and brought to life.
        </p>
        <button className="lp-btn lp-btn-gold">
          Apply for Access
        </button>
      </div>
    </section>
  );
}
