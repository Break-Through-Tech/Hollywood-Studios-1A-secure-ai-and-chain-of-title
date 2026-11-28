import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function OtpDigitBoxes({ value, onChange }: { value: string; onChange: (v: string) => void; onComplete: () => void }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        inputRefs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }
  }

  function handleInput(i: number, e: React.FormEvent<HTMLInputElement>) {
    const char = (e.nativeEvent as InputEvent).data;
    if (!char || !/^\d$/.test(char)) return;
    const next = value.slice(0, i) + char + value.slice(i + 1);
    onChange(next.slice(0, 6));
    if (i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  }

  return (
    <div className="otp-boxes" onPaste={handlePaste}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          className={`otp-box${value[i] ? ' otp-box--filled' : ''}`}
          value={value[i] || ''}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onInput={(e) => handleInput(i, e)}
          onChange={() => {}}
        />
      ))}
    </div>
  );
}

// Mirrors APPLICATION_GATE_ENABLED on the API: with the gate off, any email can
// request a code and sign in, so we never bounce anyone to the application form.
const APPLICATION_GATE_ENABLED = import.meta.env.VITE_APPLICATION_GATE_ENABLED === 'true';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submitted = searchParams.get('submitted') === 'true';

  async function handleSendOtp() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();

      if (APPLICATION_GATE_ENABLED) {
        if (data.exists === false) {
          navigate(`/apply?email=${encodeURIComponent(trimmed)}`);
          return;
        }

        if (data.status === 'pending') {
          setError('Your application is still under review.');
          return;
        }

        if (data.status && data.status !== 'approved') {
          setError('Your application was not approved.');
          return;
        }
      }

      if (data.success) {
        setStep('otp');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      if (APPLICATION_GATE_ENABLED) navigate(`/apply?email=${encodeURIComponent(trimmed)}`);
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const trimmed = email.trim().toLowerCase();
    const code = otp.trim();
    if (!trimmed || !code) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, code }),
      });

      const data = await res.json();

      if (data.valid) {
        localStorage.setItem('hsi-user-email', trimmed);
        if (data.sessionToken) localStorage.setItem('hsi-session-token', data.sessionToken);
        navigate('/network');
      } else {
        setError('Invalid or expired code. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 'email') handleSendOtp();
    else handleVerifyOtp();
  }

  function handleBack() {
    setStep('email');
    setOtp('');
    setError('');
  }

  async function handleResend() {
    setOtp('');
    setError('');
    await handleSendOtp();
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-logo-wrap">
          <img src="/logo.png" alt="HSI" className="login-logo" />
        </Link>

        <h1 className="login-heading">{step === 'email' ? 'Access HSI' : 'Verify your email'}</h1>

        {step === 'email' ? (
          <p className="login-tagline">Hollywood Studios Intelligence.</p>
        ) : (
          <p className="login-otp-hint">Enter the 6-digit code sent to <strong>{email.trim()}</strong></p>
        )}

        {submitted && step === 'email' && (
          <p className="login-success">Application submitted! We'll review it and get back to you.</p>
        )}

        {step === 'email' && (
          <>
            <button className="login-google-btn" type="button">
              <span>Continue with Google</span>
              <GoogleIcon />
            </button>
            <div className="login-divider"><span>or</span></div>
          </>
        )}

        <form className="login-email-form" onSubmit={handleSubmit}>
          {step === 'email' ? (
            <input
              type="email"
              className="login-email-input"
              placeholder="Enter email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
            />
          ) : (
            <OtpDigitBoxes value={otp} onChange={(v) => { setOtp(v); setError(''); }} onComplete={() => {}} />
          )}
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-continue-btn" disabled={loading}>
            {loading ? (step === 'email' ? 'Sending…' : 'Verifying…') : (step === 'email' ? 'Continue' : 'Verify')}
          </button>
        </form>

        {step === 'otp' && (
          <div className="login-otp-actions">
            <button type="button" className="login-otp-link" onClick={handleResend} disabled={loading}>Resend code</button>
            <span className="login-otp-sep">·</span>
            <button type="button" className="login-otp-link" onClick={handleBack}>Different email</button>
          </div>
        )}

        {step === 'email' && (
          <p className="login-member-link">
            Already a member? <a href="#">Login</a>
          </p>
        )}
      </div>

      <div className="login-footer">
        <p className="login-code-link">
          Have a code? <a href="#">Enter it here</a>
        </p>
        <div className="login-legal">
          <a href="#">Terms of Service</a>
          <span className="login-legal-sep">|</span>
          <a href="#">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
