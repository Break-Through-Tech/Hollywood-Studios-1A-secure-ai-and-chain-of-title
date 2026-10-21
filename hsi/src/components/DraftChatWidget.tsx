import { useEffect, useRef, useState } from 'react';

const UNLOCK_CHARS = 1000;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  { label: 'Analyze so far', prompt: 'Give me a quick analysis of my draft as it stands: what is working, what is not, and the single most important thing to fix. Reference specific passages.' },
  { label: 'Inspire me', prompt: 'Give me 3 unexpected but grounded ideas for where this story could go — a twist, a new character dynamic, or a thematic layer that builds on what I have written.' },
  { label: 'Suggest next beats', prompt: 'Based on where my draft leaves off, suggest what could happen next. Give me 3 distinct directions.' },
  { label: 'Find weak spots', prompt: 'What are the weakest parts of my draft right now? Point to specific passages and tell me why.' },
];

export function DraftChatWidget({ slug, email, draftText, contextText }: {
  slug: string;
  email: string;
  draftText: string;
  contextText: string;
}) {
  const unlocked = draftText.length >= UNLOCK_CHARS;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState(false);
  const wasUnlocked = useRef(unlocked);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unlocked && !wasUnlocked.current) {
      wasUnlocked.current = true;
      setAnnounce(true);
      const t = setTimeout(() => setAnnounce(false), 5000);
      return () => clearTimeout(t);
    }
  }, [unlocked]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, open]);

  async function send(prompt: string) {
    const content = prompt.trim();
    if (!content || thinking) return;
    setError('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setThinking(true);
    try {
      const res = await fetch('/api/vault/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, draft: draftText, context: contextText, messages: nextMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The assistant is unavailable');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '...' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable');
      setMessages(prev => prev.slice(0, -1));
      setInput(content);
    } finally {
      setThinking(false);
    }
  }

  if (!unlocked) {
    const chars = draftText.length;
    const pct = Math.min(100, Math.round((chars / UNLOCK_CHARS) * 100));
    return (
      <div className="vault-chatbot">
        {open && (
          <div className="vault-chatbot-window">
            <div className="vault-chatbot-header">
              <div>
                <span className="vault-panel-kicker">AI Intelligence</span>
                <h2>Draft Assistant</h2>
              </div>
              <button className="vault-chatbot-close" onClick={() => setOpen(false)} title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vault-chatbot-locked-body">
              <p className="vault-assistant-locked-copy">
                Keep layering your story. The assistant unlocks at {UNLOCK_CHARS.toLocaleString()} characters of content and can then suggest analysis, edits, and ideas grounded in your writing.
              </p>
              <div className="vault-assistant-progress">
                <div className="vault-assistant-progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="vault-assistant-progress-label">{chars.toLocaleString()} / {UNLOCK_CHARS.toLocaleString()} characters</span>
            </div>
          </div>
        )}
        <button
          className="vault-chatbot-fab vault-chatbot-fab--locked"
          onClick={() => setOpen(o => !o)}
          title="Draft Assistant — unlocks at 1,000 characters"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="vault-chatbot">
      {open && (
        <div className="vault-chatbot-window">
          <div className="vault-chatbot-header">
            <div>
              <span className="vault-panel-kicker">AI Intelligence</span>
              <h2>Draft Assistant</h2>
            </div>
            <button className="vault-chatbot-close" onClick={() => setOpen(false)} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div className="vault-chatbot-chat" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="vault-assistant-empty">
                Your assistant has read the draft. Ask for analysis, edits, or fresh ideas — or start with a quick action below.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`vault-assistant-msg vault-assistant-msg--${m.role}`}>
                {m.content}
              </div>
            ))}
            {thinking && <div className="vault-assistant-msg vault-assistant-msg--assistant vault-assistant-msg--thinking">Reading your draft...</div>}
          </div>

          {messages.length === 0 && !thinking && (
            <div className="vault-assistant-quick vault-chatbot-quick">
              {QUICK_PROMPTS.map(q => (
                <button key={q.label} className="vault-assistant-quick-btn" onClick={() => send(q.prompt)}>
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {error && <p className="vault-modal-error">{error}</p>}

          <div className="vault-assistant-input-row vault-chatbot-input-row">
            <textarea
              className="vault-assistant-input"
              placeholder="Ask about your draft..."
              value={input}
              rows={1}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="vault-assistant-send" onClick={() => send(input)} disabled={thinking || !input.trim()} title="Send">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!open && announce && (
        <button className="vault-chatbot-announce" onClick={() => { setAnnounce(false); setOpen(true); }}>
          Draft Assistant unlocked — ask for analysis or inspiration
        </button>
      )}

      <button
        className={`vault-chatbot-fab ${announce && !open ? 'vault-chatbot-fab--pulse' : ''}`}
        onClick={() => { setAnnounce(false); setOpen(o => !o); }}
        title={open ? 'Close assistant' : 'Open Draft Assistant'}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
            <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
          </svg>
        )}
      </button>
    </div>
  );
}
