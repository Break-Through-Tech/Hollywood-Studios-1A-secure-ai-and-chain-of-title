import { useState } from 'react';
import { blobUrl } from '../blobUrl';

/** Two initials from a display name; one from a handle or email. */
function initials(name: string): string {
  const clean = name.replace(/^@/, '').split('@')[0].trim();
  const parts = clean.split(/[\s.-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return clean.slice(0, 1).toUpperCase() || '?';
}

/**
 * A person. Renders the photo when there is one and it loads; otherwise
 * initials in navy on a tint. Never alt text — a broken image should read
 * as a person, not as a bug.
 */
export function Avatar({ name, src, size = 36, className = '' }: {
  name: string; src?: string | null; size?: number; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = src ? (blobUrl(src) || src) : null;
  const dim = { width: size, height: size };
  if (url && !failed) {
    return <img src={url} alt="" className={`avatar ${className}`} style={dim} onError={() => setFailed(true)} loading="lazy" />;
  }
  return (
    <span className={`avatar avatar-ini ${className}`} style={{ ...dim, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
