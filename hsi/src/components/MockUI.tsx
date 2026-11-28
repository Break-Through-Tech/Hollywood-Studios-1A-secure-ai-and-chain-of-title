import type { CSSProperties, ReactNode } from 'react';

export function MockBubbleUser({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <div style={{ background: 'var(--navy)', borderRadius: '14px 14px 4px 14px', padding: '12px 16px', maxWidth: '70%', fontSize: 14, color: '#fff', lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

export function MockBubbleHSI({ text, loading }: { text: string; loading?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '12px 16px', maxWidth: '75%', fontSize: 14, color: loading ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

export function MockTimestamp({ text }: { text: string }) {
  return <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 12px' }}>{text}</div>;
}

export function MockCard({ bg, border, children, style }: { bg?: string; border?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: bg || 'var(--bg-card)', border: border || '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', ...style }}>{children}</div>
  );
}

export function MockTag({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', background: color || '#C9A84C', color: '#fff' }}>{label}</span>
  );
}

export function MockBar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}><span>{label}</span><span>{value}/{max}</span></div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color || '#C9A84C', width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
