import { useEffect, useRef, useState } from 'react';

const UNLOCK_CHARS = 1000;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  { label: 'Suggest next beats', prompt: 'Based on where my draft leaves off, suggest what could happen next. Give me 3 distinct directions.' },
  { label: 'Strengthen characters', prompt: 'Look at my characters as written so far. What would make them more distinct and compelling? Be specific.' },
  { label: 'Find weak spots', prompt: 'What are the weakest parts of my draft right now? Point to specific passages and tell me why.' },
  { label: 'Punch up dialogue', prompt: 'Pick the flattest exchange of dialogue in my draft and rewrite it with more subtext and voice.' },
];

export function DraftAssistantPanel({ slug, email, draftText, contextText }: {
  slug: string;
  email: string;
  draftText: string;
  contextText: string;
}) {
  const chars = draftText.length;
  const unlocked = chars >= UNLOCK_CHARS;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [justUnlocked, setJustUnlocked] = useState(false);
  const wasUnlocked = useRef(unlocked);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unlocked && !wasUnlocked.current) {
      setJustUnlocked(true);
      const t = setTimeout(() => setJustUnlocked(false), 4000);
      return () => clearTimeout(t);
    }
    wasUnlocked.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

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
    const pct = Math.min(100, Math.round((chars / UNLOCK_CHARS) * 100));
    return (
      <section className="vault-context-section vault-assistant vault-assistant--locked">
        <div className="vault-panel-top vault-panel-top--compact">
          <div>
            <span className="vault-panel-kicker">AI Intelligence</span>
            <h2>Draft Assistant</h2>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="vault-assistant-locked-copy">
          Keep layering your story. The assistant unlocks at {UNLOCK_CHARS.toLocaleString()} characters and can then suggest edits and ideas grounded in your writing.
        </p>
        <div className="vault-assistant-progress">
          <div className="vault-assistant-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <span className="vault-assistant-progress-label">{chars.toLocaleString()} / {UNLOCK_CHARS.toLocaleString()} characters</span>
      </section>
    );
  }

  return (
    <section className={`vault-context-section vault-assistant ${justUnlocked ? 'vault-assistant--flash' : ''}`}>
      <div className="vault-panel-top vault-panel-top--compact">
        <div>
          <span className="vault-panel-kicker">AI Intelligence</span>
          <h2>Draft Assistant</h2>
        </div>
        <span className="vault-assistant-unlocked-badge">
          {justUnlocked ? 'Unlocked!' : 'Active'}
        </span>
      </div>

      <div className="vault-assistant-chat" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="vault-assistant-empty">
            Your assistant has read the draft. Ask for suggestions, edits, or feedback — or start with a quick action below.
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
        <div className="vault-assistant-quick">
          {QUICK_PROMPTS.map(q => (
            <button key={q.label} className="vault-assistant-quick-btn" onClick={() => send(q.prompt)}>
              {q.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="vault-modal-error">{error}</p>}

      <div className="vault-assistant-input-row">
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
    </section>
  );
}
