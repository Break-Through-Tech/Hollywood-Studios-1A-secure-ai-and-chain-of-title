import { useState, useEffect, useCallback } from 'react';
import { usePersona, personas, type Persona } from '../personas';

const STORAGE_KEY = 'hsi-persona-selected';

export function PersonaPopup() {
  const { selected, setSelected, pickerOpen, closePicker } = usePersona();
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<Persona | null>(null);
  const [closing, setClosing] = useState(false);

  const isReselecting = pickerOpen && selected !== null;

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const onScroll = () => {
      if (window.scrollY > 100) {
        setVisible(true);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isOpen = visible || pickerOpen;

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const dismiss = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      setPreview(null);
      closePicker();
    }, 400);
  }, [closePicker]);

  const handleSelect = useCallback((p: Persona) => {
    setPreview(p);
  }, []);

  const handleContinue = useCallback(() => {
    if (!preview) return;
    setSelected(preview);
    dismiss();
  }, [preview, setSelected, dismiss]);

  if (!isOpen || closing === false && !isOpen) return null;
  if (!visible && !pickerOpen) return null;

  return (
    <div
      className={`persona-overlay ${closing ? 'persona-overlay--closing' : ''}`}
      onClick={(e) => { if (isReselecting && e.target === e.currentTarget) dismiss(); }}
    >
      <div className={`persona-popup ${closing ? 'persona-popup--closing' : ''}`}>
        {!preview ? (
          <>
            <h3 className="persona-popup__title">What brings you here?</h3>
            <p className="persona-popup__subtitle">Customize your experience</p>
            <div className="persona-popup__grid">
              {personas.map((p) => (
                <button
                  key={p.key}
                  className="persona-popup__option"
                  onClick={() => handleSelect(p)}
                >
                  <img src={p.icon} alt={p.label} className="persona-popup__icon" />
                  <span className="persona-popup__label">{p.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="persona-popup__result" key={preview.key}>
            <img src={preview.icon} alt={preview.label} className="persona-popup__result-icon" />
            <h3 className="persona-popup__title">Perfect for {preview.label}</h3>
            <p className="persona-popup__justification">{preview.justification}</p>
            <div className="persona-popup__actions">
              <button className="persona-popup__back" onClick={() => setPreview(null)}>
                Back
              </button>
              <button className="lp-btn lp-btn-primary" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
