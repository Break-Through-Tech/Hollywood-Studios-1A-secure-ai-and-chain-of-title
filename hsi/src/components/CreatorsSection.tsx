import { useState, useEffect } from 'react';
import { useInView } from '../hooks/useInView';

const films = [
  {
    src: 'https://www.hollywoodstudios.ai/images/kidsarealright.jpg',
    title: 'The Kids Are All Right',
    caption: 'Golden Globe® Best Picture Winner · Oscar®-Nominated',
  },
  {
    src: 'https://www.hollywoodstudios.ai/images/2guns.jpg',
    title: '2 Guns',
    caption: 'Starring Denzel Washington & Mark Wahlberg',
  },
  {
    src: 'https://www.hollywoodstudios.ai/images/lone_survivor.jpg',
    title: 'Lone Survivor',
    caption: 'Oscar®-Nominated · Starring Mark Wahlberg',
  },
];

export function CreatorsSection() {
  const [ref, inView] = useInView(0.1);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((i) => (i + 1) % films.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const film = films[activeIdx];

  return (
    <section
      className="section reveal"
      ref={ref as React.RefObject<HTMLElement>}
      style={inView ? { opacity: 1, transform: 'translateY(0)' } : undefined}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Built by Entertainment, Technology, and AI Leaders</h2>
        <p className="section-sub" style={{ marginBottom: 48, maxWidth: 620, margin: '0 auto 48px' }}>
          Founded by Sir Steven Saxton, an entertainment executive with more than four decades across film, television, music, and technology — and acclaimed projects associated with more than $1.6 billion in global box office.
        </p>

        <div className="creators-image-wrap">
          {films.map((f, i) => (
            <img
              key={f.title}
              src={f.src}
              alt={f.title}
              className={`creators-image ${activeIdx === i ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="creators-caption" key={activeIdx}>
          <h3 className="creators-title">{film.title}</h3>
          <p className="creators-sub">{film.caption}</p>
        </div>

        <p className="section-sub" style={{ margin: '32px auto 24px', maxWidth: 620, fontSize: 14 }}>
          Along with acclaimed television including <em>The Sopranos</em>, <em>Breaking Bad</em>, <em>Dexter</em>, <em>Californication</em>, <em>The Newsroom</em>, and <em>Entourage</em>.
        </p>

        <div className="creators-dots">
          {films.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot ${activeIdx === i ? 'active' : ''}`}
              onClick={() => setActiveIdx(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
