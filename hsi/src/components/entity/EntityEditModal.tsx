import { useState, useRef } from 'react';
import { EditModal } from '../profile/EditModal';
import type { Entity } from './types';
import { blobUrl } from '../../blobUrl';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

export function EntityEditModal({ entity, onClose, onSaved }: { entity: Entity; onClose: () => void; onSaved: () => void }) {
  const meta = entity.metadata || {};
  const [title, setTitle] = useState(entity.title);
  const [year, setYear] = useState(entity.year?.toString() || '');
  const [genre, setGenre] = useState((entity.genre || []).join(', '));
  const [description, setDescription] = useState(entity.description || '');
  const [trailerUrl, setTrailerUrl] = useState((meta.trailer_url as string) || '');
  const [seasons, setSeasons] = useState((meta.seasons as number)?.toString() || '');
  const [network, setNetwork] = useState((meta.network as string) || '');
  const [artist, setArtist] = useState((meta.artist as string) || '');
  const [musicLink, setMusicLink] = useState((meta.link as string) || '');
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

  async function handleSave() {
    setSaving(true);
    const metadata: Record<string, unknown> = {};
    if (entity.type === 'movie' || entity.type === 'tvshow') metadata.trailer_url = trailerUrl || undefined;
    if (entity.type === 'tvshow') { metadata.seasons = seasons ? parseInt(seasons) : undefined; metadata.network = network || undefined; }
    if (entity.type === 'music') { metadata.artist = artist || undefined; metadata.link = musicLink || undefined; }

    await fetch('/api/entity/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        id: entity.id,
        title: title.trim(),
        year: year ? parseInt(year) : null,
        genre: genre ? genre.split(',').map(g => g.trim()).filter(Boolean) : [],
        description: description.trim() || null,
        metadata,
        imageData,
        fileName: fileName || null,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title={`Edit ${entity.title}`} onClose={onClose}>
      <div className="vault-modal-field">
        <label className="prof-field-label">Title</label>
        <input className="app-input" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="prof-edit-row">
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">Year</label>
          <input className="app-input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="vault-modal-field" style={{ flex: 2 }}>
          <label className="prof-field-label">Genre (comma separated)</label>
          <input className="app-input" value={genre} onChange={e => setGenre(e.target.value)} />
        </div>
      </div>

      {(entity.type === 'movie' || entity.type === 'tvshow') && (
        <div className="vault-modal-field">
          <label className="prof-field-label">Trailer URL</label>
          <input className="app-input" value={trailerUrl} onChange={e => setTrailerUrl(e.target.value)} />
        </div>
      )}
      {entity.type === 'tvshow' && (
        <div className="prof-edit-row">
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Seasons</label>
            <input className="app-input" type="number" value={seasons} onChange={e => setSeasons(e.target.value)} />
          </div>
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Network</label>
            <input className="app-input" value={network} onChange={e => setNetwork(e.target.value)} />
          </div>
        </div>
      )}
      {entity.type === 'music' && (
        <div className="prof-edit-row">
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Artist</label>
            <input className="app-input" value={artist} onChange={e => setArtist(e.target.value)} />
          </div>
          <div className="vault-modal-field" style={{ flex: 1 }}>
            <label className="prof-field-label">Link</label>
            <input className="app-input" value={musicLink} onChange={e => setMusicLink(e.target.value)} />
          </div>
        </div>
      )}

      <div className="vault-modal-field">
        <label className="prof-field-label">Synopsis</label>
        <textarea className="app-textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div className="vault-modal-field">
        <label className="prof-field-label">Image</label>
        <div className="ent-image-upload" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          {imageData ? <img src={imageData} alt="Preview" className="ent-image-preview" /> :
           entity.image_url ? <img src={blobUrl(entity.image_url)} alt={entity.title} className="ent-image-preview" /> :
           <span>Click to upload image</span>}
        </div>
      </div>

      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
