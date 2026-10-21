import { Link } from 'react-router-dom';
import type { CastCrewEntry } from './types';
import { Avatar } from '../Avatar';

const DEPT_ORDER = ['Acting', 'Directing', 'Producing', 'Writing', 'Music', 'Camera', 'Editing', 'Other'];

export function EntityCastCrew({ castCrew }: { castCrew: CastCrewEntry[] }) {
  // Known departments first, then any others present — grouping by a fixed
  // list alone silently drops crew whose department isn't on it.
  const present = new Set(castCrew.map(c => c.department).filter(Boolean));
  const order = [
    ...DEPT_ORDER.filter(d => present.has(d)),
    ...[...present].filter(d => !DEPT_ORDER.includes(d)).sort(),
  ];
  const grouped = order
    .map(dept => ({ dept, members: castCrew.filter(c => c.department === dept) }))
    .filter(g => g.members.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="net-card prof-section">
        <div className="prof-section-header">
          <h3 className="prof-section-title">Cast & Crew</h3>
        </div>
        <p className="prof-empty">No credits linked yet</p>
      </div>
    );
  }

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Cast & Crew</h3>
      </div>
      {grouped.map(g => (
        <div key={g.dept} className="prof-credits-group">
          <h4 className="prof-credits-dept">{g.dept}</h4>
          {g.members.map((m, i) => (
            <Link key={`${m.handle}-${i}`} to={`/profile/${m.handle}`} className="ent-crew-row">
              <Avatar name={m.display_name} src={m.avatar_url} size={32} />
              <div className="ent-crew-info">
                <span className="ent-crew-name">{m.display_name}</span>
                {m.role && <span className="ent-crew-role">{m.role}</span>}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
