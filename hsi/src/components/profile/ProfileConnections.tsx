import { Link } from 'react-router-dom';
import type { ConnectionProfile } from './types';
import { Avatar } from '../Avatar';

export function ProfileConnections({ connections }: { connections: ConnectionProfile[] }) {
  return (
    <div className="net-card prof-sidebar-card">
      <div className="prof-sidebar-header">
        <h4>Connections</h4>
        <span className="prof-sidebar-count">{connections.length}</span>
      </div>
      {connections.length === 0 ? (
        <p className="prof-empty">No connections yet</p>
      ) : (
        <div className="prof-sidebar-list">
          {connections.map(c => (
            <Link key={c.handle} to={`/profile/${c.handle}`} className="prof-sidebar-row prof-sidebar-row--link">
              <Avatar name={c.display_name} src={c.avatar_url} size={32} />
              <div className="prof-sidebar-row-info">
                <span className="prof-sidebar-row-name">{c.display_name}</span>
                {c.headline && <span className="prof-sidebar-row-meta">{c.headline}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
