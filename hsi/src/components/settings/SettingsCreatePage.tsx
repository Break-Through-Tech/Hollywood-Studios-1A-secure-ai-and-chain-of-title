import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const ENTITY_TYPES = [
  { value: 'company', label: 'Company' },
  { value: 'movie', label: 'Movie' },
  { value: 'tvshow', label: 'TV Show' },
  { value: 'music', label: 'Song' },
];

const TYPE_ROUTES: Record<string, string> = {
  movie: '/movie/',
  tvshow: '/tvshow/',
  company: '/company/',
  music: '/music/',
};

export function SettingsCreatePage({ email, onClose }: { email: string; onClose: () => void }) {
  const [type, setType] = useState('company');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [seasons, setSeasons] = useState('');
  const [network, setNetwork] = useState('');
  const [artist, setArtist] = useState('');
  const [musicLink, setMusicLink] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError('');

    const metadata: Record<string, unknown> = {};
    if (type === 'movie' || type === 'tvshow') metadata.trailer_url = trailerUrl || undefined;
    if (type === 'tvshow') {
      metadata.seasons = seasons ? parseInt(seasons) : undefined;
      metadata.network = network || undefined;
    }
    if (type === 'music') {
      metadata.artist = artist || undefined;
      metadata.link = musicLink || undefined;
    }

    try {
      const res = await fetch('/api/entity/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          type,
          title: title.trim(),
          year: year ? parseInt(year) : null,
          genre: genre ? genre.split(',').map((g) => g.trim()).filter(Boolean) : [],
          description: description.trim() || null,
          metadata,
          imageData,
          fileName: fileName || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Failed to create page');
        setSaving(false);
        return;
      }

      const { entity } = await res.json();
      onClose();
      navigate(`${TYPE_ROUTES[entity.type]}${entity.slug}`);
    } catch {
      setError('Something went wrong');
      setSaving(false);
    }
  }

  const imageLabel = type === 'music' ? 'Cover Art' : 'Poster';

  return (
    <div className="set-create">
      <h2 className="set-heading">Create Page</h2>
      <p className="set-subtitle">Create a new page for a company, movie, TV show, or song.</p>

      <div className="set-create-form">
        <div className="set-create-field">
          <label className="set-label">Type</label>
          <div className="set-type-picker">
            {ENTITY_TYPES.map((t) => (
              <button
                key={t.value}
                className={`set-type-btn ${type === t.value ? 'active' : ''}`}
                onClick={() => setType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'company' ? (
          <div className="set-create-company">
            <p>
              Company pages have their own editor — logo and cover image, industry, size, founding date,
              headquarters, specialties, notable work and contact links. The page is linked to your profile,
              and members who add it to their experience show up on it.
            </p>
            <button className="btn btn-primary set-btn-create" onClick={() => { onClose(); navigate('/company/new'); }}>
              Set up a company page
            </button>
          </div>
        ) : (
          <>
          <div className="set-create-field">
            <label className="set-label">Title</label>
            <input
              className="set-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'music' ? 'Song title' : 'Project title'}
            />
          </div>

          <div className="set-create-row">
            <div className="set-create-field set-create-field--half">
              <label className="set-label">Year</label>
              <input className="set-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
            <div className="set-create-field set-create-field--half">
              <label className="set-label">Genre (comma separated)</label>
              <input className="set-input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Drama, Thriller" />
            </div>
          </div>

          {(type === 'movie' || type === 'tvshow') && (
            <div className="set-create-field">
              <label className="set-label">Trailer URL</label>
              <input className="set-input" value={trailerUrl} onChange={(e) => setTrailerUrl(e.target.value)} placeholder="YouTube or Vimeo URL" />
            </div>
          )}

          {type === 'tvshow' && (
            <div className="set-create-row">
              <div className="set-create-field set-create-field--half">
                <label className="set-label">Seasons</label>
                <input className="set-input" type="number" value={seasons} onChange={(e) => setSeasons(e.target.value)} />
              </div>
              <div className="set-create-field set-create-field--half">
                <label className="set-label">Network</label>
                <input className="set-input" value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="e.g. HBO" />
              </div>
            </div>
          )}

          {type === 'music' && (
            <div className="set-create-row">
              <div className="set-create-field set-create-field--half">
                <label className="set-label">Artist</label>
                <input className="set-input" value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>
              <div className="set-create-field set-create-field--half">
                <label className="set-label">Link (Spotify, etc.)</label>
                <input className="set-input" value={musicLink} onChange={(e) => setMusicLink(e.target.value)} />
              </div>
            </div>
          )}

          <div className="set-create-field">
            <label className="set-label">Synopsis</label>
            <textarea className="set-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="set-create-field">
            <label className="set-label">{imageLabel}</label>
            <div className="set-image-upload" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              {imageData ? (
                <img src={imageData} alt="Preview" className="set-image-preview" />
              ) : (
                <div className="set-image-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span>Click to upload image</span>
                </div>
              )}
            </div>
          </div>

          {error && <p className="set-error">{error}</p>}

          <div className="set-create-actions">
            <button className="btn btn-primary set-btn-create" onClick={handleCreate} disabled={saving || !title.trim()}>
              {saving ? 'Creating...' : 'Create Page'}
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
