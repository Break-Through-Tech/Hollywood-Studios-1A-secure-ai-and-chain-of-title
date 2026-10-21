import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';

// Attach the session token to every API call and force re-login when it's rejected.
const SESSION_TOKEN_KEY = 'hsi-session-token';

// Accounts are keyed by the lowercased email; fold any address stored by an older
// build so a returning browser keeps pointing at the same profile row.
const storedEmail = localStorage.getItem('hsi-user-email');
if (storedEmail && storedEmail !== storedEmail.trim().toLowerCase()) {
  localStorage.setItem('hsi-user-email', storedEmail.trim().toLowerCase());
}
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith('/api/')) return originalFetch(input, init);

  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  let request = init;
  if (token) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    request = { ...init, headers };
  }

  const res = await originalFetch(input, request);
  if (res.status === 401) {
    try {
      const data = await res.clone().json();
      // only session rejections log the user out — viewer 401s (wrong passcode etc.) pass through
      if (data?.error === 'invalid_session') {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem('hsi-user-email');
        if (window.location.pathname !== '/login') window.location.href = '/login';
      }
    } catch { /* non-JSON 401 — leave it to the caller */ }
  }
  return res;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
