import { useState, useEffect, useRef } from 'react';
import type { EntitySummary } from './types';
import { TYPE_LABELS } from './types';

interface EntitySearchProps {
  value: string;
  entityId: number | null;
  onSelect: (entity: EntitySummary | null) => void;
  onTextChange: (text: string) => void;
  onCreateNew?: () => void;
  /** Search only this entity type (server-side). */
  type?: string;
  /** Drop results the caller can't use, e.g. titles already picked. */
  filter?: (entity: EntitySummary) => boolean;
  placeholder?: string;
  createLabel?: string;
  /** Empty the box after a pick, for pickers that collect several. */
  clearOnSelect?: boolean;
}

export function EntitySearch({ value, entityId, onSelect, onTextChange, onCreateNew, type, filter, placeholder, createLabel, clearOnSelect }: EntitySearchProps) {
  const [results, setResults] = useState<EntitySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInput(text: string) {
    onTextChange(text);
    if (entityId) onSelect(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch('/api/entity/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text.trim(), type }),
        });
        if (res.ok) {
          const data: EntitySummary[] = await res.json();
          setResults(filter ? data.filter(filter) : data);
          setOpen(true);
        }
      } catch { /* */ }
      setSearching(false);
    }, 300);
  }

  function handleSelect(ent: EntitySummary) {
    onSelect(ent);
    onTextChange(clearOnSelect ? '' : ent.title);
    if (clearOnSelect) setResults([]);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="ent-search-wrap">
      <div className="ent-search-input-row">
        <input
          className="app-input"
          placeholder={placeholder ?? 'Search for a project...'}
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {entityId && <span className="ent-search-linked">Linked</span>}
        {searching && <span className="ent-search-spinner" />}
      </div>
      {open && (
        <div className="ent-search-dropdown">
          {results.map(r => (
            <button key={r.id} className="ent-search-result" onClick={() => handleSelect(r)}>
              <span className="ent-search-result-title">{r.title}</span>
              <span className="ent-search-result-meta">
                <span className="ent-type-badge ent-type-badge--sm">{TYPE_LABELS[r.type] || r.type}</span>
                {r.year && <span>{r.year}</span>}
              </span>
            </button>
          ))}
          {results.length === 0 && <div className="ent-search-empty">No matches</div>}
          {onCreateNew && (
            <button className="ent-search-create" onClick={() => { setOpen(false); onCreateNew(); }}>
              {createLabel ?? '+ Create new page'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
