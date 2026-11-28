import { useState, useRef } from 'react';
import { EditModal } from '../profile/EditModal';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }
const ENTITY_TYPES = [
  { value: 'movie', label: 'Movie' },
  { value: 'tvshow', label: 'TV Show' },
  { value: 'music', label: 'Music' },
];

interface CreatedEntity { id: number; type: string; title: string; slug: string }

export function EntityCreateModal({ defaultType, onClose, onCreated }: {
  defaultType?: string; onClose: () => void; onCreated: (entity: CreatedEntity) => void;
}) {
  const [type, setType] = useState(defaultType || 'movie');
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
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    const metadata: Record<string, unknown> = {};
    if (type === 'movie' || type === 'tvshow') metadata.trailer_url = trailerUrl || undefined;
    if (type === 'tvshow') { metadata.seasons = seasons ? parseInt(seasons) : undefined; metadata.network = network || undefined; }
    if (type === 'music') { metadata.artist = artist || undefined; metadata.link = musicLink || undefined; }

    const res = await fetch('/api/entity/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        type,
        title: title.trim(),
        year: year ? parseInt(year) : null,
        genre: genre ? genre.split(',').map(g => g.trim()).filter(Boolean) : [],
        description: description.trim() || null,
        metadata,
        imageData,
        fileName: fileName || null,
      }),
    });
    if (res.ok) {
      const { entity } = await res.json();
      onCreated(entity);
    }
    setSaving(false);
  }

  return (
    <EditModal title="Create Page" onClose={onClose}>
      <div className="vault-modal-field">
        <label className="prof-field-label">Type</label>
        <select className="app-input" value={type} onChange={e => setType(e.target.value)}>
          {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Title</label>
        <input className="app-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Project title" />
      </div>
      <div className="prof-edit-row">
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">Year</label>
          <input className="app-input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="vault-modal-field" style={{ flex: 2 }}>
          <label className="prof-field-label">Genre (comma separated)</label>
          <input className="app-input" value={genre} onChange={e => setGenre(e.target.value)} placeholder="Drama, Thriller" />
        </div>
      </div>

      {(type === 'movie' || type === 'tvshow') && (
        <div className="vault-modal-field">
          <label className="prof-field-label">Trailer URL</label>
          <input className="app-input" value={trailerUrl} onChange={e => setTrailerUrl(e.target.value)} placeholder="YouTube or Vimeo URL" />
        </div>
      )}
      {type === 'tvshow' && (
        <div className="prof-edit-row">
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Seasons</label>
            <input className="app-input" type="number" value={seasons} onChange={e => setSeasons(e.target.value)} />
          </div>
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Network</label>
            <input className="app-input" value={network} onChange={e => setNetwork(e.target.value)} placeholder="e.g. HBO" />
          </div>
        </div>
      )}
      {type === 'music' && (
        <div className="prof-edit-row">
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Artist</label>
            <input className="app-input" value={artist} onChange={e => setArtist(e.target.value)} />
          </div>
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Link (Spotify, etc.)</label>
            <input className="app-input" value={musicLink} onChange={e => setMusicLink(e.target.value)} />
          </div>
        </div>
      )}

      <div className="vault-modal-field">
        <label className="prof-field-label">Synopsis</label>
        <textarea className="app-textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div className="vault-modal-field">
        <label className="prof-field-label">{type === 'music' ? 'Cover Art' : 'Poster'}</label>
        <div className="ent-image-upload" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          {imageData ? <img src={imageData} alt="Preview" className="ent-image-preview" /> : <span>Click to upload image</span>}
        </div>
      </div>

      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !title.trim()}>
          {saving ? 'Creating...' : 'Create'}
        </button>
      </div>
    </EditModal>
  );
}
