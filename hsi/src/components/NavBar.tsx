import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePersona } from '../personas';

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const { selected, openPicker } = usePersona();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav className="nav" style={{ borderBottomColor: scrolled ? 'rgba(0,0,0,0.08)' : 'transparent' }}>
      <div className="nav-left">
        <div className="nav-logo">
          <img src="/logo.png" alt="Hollywood Studios" className="nav-logo-img" />
        </div>
        <div className="nav-links">
          <a href="#overview" className="active">Overview</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </div>
      </div>
      <div className="nav-right">
        {selected && (
          <button className="nav-persona-badge" onClick={openPicker}>
            <img src={selected.icon} alt={selected.label} className="nav-persona-badge__icon" />
            {selected.label}
          </button>
        )}
        <Link to="/login" className="nav-login">Login</Link>
      </div>
    </nav>
  );
}
