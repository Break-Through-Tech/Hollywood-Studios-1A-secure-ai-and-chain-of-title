import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CompanyData } from './types';
import type { EntitySummary } from '../entity/types';
import { TYPE_LABELS } from '../entity/types';
import { EntitySearch } from '../entity/EntitySearch';
import { CATEGORIES, ORGANIZATION_TYPES, COMPANY_SIZES, SOCIALS, MONTHS } from './fields';
import { resizeImage } from './resizeImage';
import { blobUrl } from '../../blobUrl';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

interface Form {
  name: string;
  tagline: string;
  about: string;
  category: string;
  organizationType: string;
  companySize: string;
  foundedYear: string;
  foundedMonth: string;
  headquarters: string;
  website: string;
  contactEmail: string;
  phone: string;
  specialties: string[];
  socialLinks: Record<string, string>;
}

const EMPTY: Form = {
  name: '', tagline: '', about: '', category: '', organizationType: '', companySize: '',
  foundedYear: '', foundedMonth: '', headquarters: '', website: '', contactEmail: '', phone: '',
  specialties: [], socialLinks: {},
};

function formFrom(data: CompanyData): Form {
  const c = data.company;
  return {
    name: data.entity.title,
    tagline: c?.tagline || '',
    about: data.entity.description || '',
    category: c?.category || '',
    organizationType: c?.organization_type || '',
    companySize: c?.company_size || '',
    foundedYear: data.entity.year ? String(data.entity.year) : '',
    foundedMonth: c?.founded_month ? String(c.founded_month) : '',
    headquarters: c?.headquarters || '',
    website: c?.website || '',
    contactEmail: c?.contact_email || '',
    phone: c?.phone || '',
    specialties: c?.specialties || [],
    socialLinks: c?.social_links || {},
  };
}

/**
 * The company page editor, at /company/new and /company/:slug/edit. Images are
 * tracked separately from the form: `undefined` is unchanged, `null` removed,
 * a data URL replaced.
 */
export function CompanyEditor() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = !slug;
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [form, setForm] = useState<Form>(EMPTY);
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [notable, setNotable] = useState<EntitySummary[]>([]);
  const [notableQuery, setNotableQuery] = useState('');
  const [specialtyDraft, setSpecialtyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const signedIn = !!getLoggedInEmail();

  useEffect(() => {
    if (isNew) return;
    let ignore = false;
    fetch('/api/entity/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).then(async res => {
      if (ignore) return;
      const json: CompanyData | null = res.ok ? await res.json() : null;
      if (!json || json.entity.type !== 'company' || !json.canEdit) {
        navigate(json ? `/company/${slug}` : '/people', { replace: true });
        return;
      }
      setLoaded(json);
      setForm(formFrom(json));
      setNotable(json.notableWork);
    }).catch(() => {}).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [isNew, slug, navigate]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));

  async function pickImage(file: File | undefined, kind: 'logo' | 'cover') {
    if (!file) return;
    setError('');
    try {
      const data = kind === 'logo' ? await resizeImage(file, 400, 400) : await resizeImage(file, 1600, 480);
      if (kind === 'logo') setLogo(data); else setCover(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addSpecialty() {
    const parts = specialtyDraft.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...form.specialties];
    for (const p of parts) if (!next.some(s => s.toLowerCase() === p.toLowerCase()) && next.length < 20) next.push(p);
    set('specialties', next);
    setSpecialtyDraft('');
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Give the company a name.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/entity/company-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: getLoggedInEmail(),
          id: loaded?.entity.id,
          ...form,
          foundedYear: form.foundedYear || null,
          foundedMonth: form.foundedMonth || null,
          notableEntityIds: notable.map(n => n.id),
          logoData: logo,
          coverData: cover,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(friendlyError(json.error));
        setSaving(false);
        return;
      }
      navigate(`/company/${json.entity.slug}`);
    } catch {
      setError('Something went wrong. Try again.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!loaded) return;
    setSaving(true);
    const res = await fetch('/api/entity/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: getLoggedInEmail(), id: loaded.entity.id }),
    });
    setSaving(false);
    if (res.ok) {
      navigate('/people');
    } else {
      setError('Could not delete this page.');
      setConfirmDelete(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="empty" style={{ flex: 1 }}>
        <h3>Sign in to create a company page</h3>
        <p>Every company page belongs to the member who manages it.</p>
        <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="prof-loading"><div className="prof-loading-pulse" /></div>;
  }

  const logoSrc = logo === undefined ? blobUrl(loaded?.entity.image_url) : logo;
  const coverSrc = cover === undefined ? blobUrl(loaded?.company?.cover_url) : cover;
  const thisYear = new Date().getFullYear();

  return (
    <div className="co-editor" style={{ overflow: 'auto', height: '100vh' }}>
      <div className="co-editor-inner">
        <div className="page-head">
          <h1>{isNew ? 'Create a company page' : 'Edit company page'}</h1>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => (isNew ? navigate(-1) : navigate(`/company/${slug}`))}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : isNew ? 'Create page' : 'Save changes'}
          </button>
        </div>
        {isNew && <p className="muted co-editor-intro">The page is linked to your profile — you'll be shown as the person who manages it, and only you can edit it.</p>}
        {error && <p className="co-editor-error" role="alert">{error}</p>}

        <section className="card co-editor-card">
          <h2 className="co-editor-heading">Identity</h2>
          <div className="co-editor-images">
            <div>
              <span className="prof-field-label">Logo</span>
              <button type="button" className="co-editor-logo" onClick={() => logoRef.current?.click()} aria-label="Upload logo">
                {logoSrc ? <img src={logoSrc} alt="" /> : <span>Upload</span>}
              </button>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { pickImage(e.target.files?.[0], 'logo'); e.target.value = ''; }} />
              {logoSrc && <button type="button" className="co-editor-remove" onClick={() => setLogo(null)}>Remove</button>}
            </div>
            <div className="co-editor-cover-field">
              <span className="prof-field-label">Cover image</span>
              <button type="button" className="co-editor-cover" onClick={() => coverRef.current?.click()} aria-label="Upload cover image">
                {coverSrc ? <img src={coverSrc} alt="" /> : <span>Upload a wide image — 1600 × 400 works best</span>}
              </button>
              <input ref={coverRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { pickImage(e.target.files?.[0], 'cover'); e.target.value = ''; }} />
              {coverSrc && <button type="button" className="co-editor-remove" onClick={() => setCover(null)}>Remove</button>}
            </div>
          </div>
          <Field label="Company name" required>
            <input className="input" value={form.name} maxLength={120} onChange={e => set('name', e.target.value)} placeholder="e.g. Lantern Road Pictures" autoFocus={isNew} />
          </Field>
          <Field label="Tagline" hint={`${form.tagline.length}/160`}>
            <input className="input" value={form.tagline} maxLength={160} onChange={e => set('tagline', e.target.value)} placeholder="One line on what you do" />
          </Field>
        </section>

        <section className="card co-editor-card">
          <h2 className="co-editor-heading">Details</h2>
          <div className="co-editor-grid">
            <Field label="Industry">
              <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Select…</option>
                {CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Organization type">
              <select className="select" value={form.organizationType} onChange={e => set('organizationType', e.target.value)}>
                <option value="">Select…</option>
                {ORGANIZATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Company size">
              <select className="select" value={form.companySize} onChange={e => set('companySize', e.target.value)}>
                <option value="">Select…</option>
                {COMPANY_SIZES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Headquarters">
              <input className="input" value={form.headquarters} maxLength={120} onChange={e => set('headquarters', e.target.value)} placeholder="City, region" />
            </Field>
            <Field label="Founded — month">
              <select className="select" value={form.foundedMonth} onChange={e => set('foundedMonth', e.target.value)} disabled={!form.foundedYear}>
                <option value="">—</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Founded — year">
              <input className="input" type="number" inputMode="numeric" min={1800} max={thisYear} value={form.foundedYear}
                onChange={e => { set('foundedYear', e.target.value); if (!e.target.value) set('foundedMonth', ''); }} placeholder={String(thisYear)} />
            </Field>
          </div>
        </section>

        <section className="card co-editor-card">
          <h2 className="co-editor-heading">About</h2>
          <Field label="Overview" hint={`${form.about.length}/5000`}>
            <textarea className="textarea" rows={6} maxLength={5000} value={form.about} onChange={e => set('about', e.target.value)} placeholder="What the company does, what it's made, who it works with." />
          </Field>
          <Field label="Specialties">
            <div className="co-editor-inline">
              <input className="input" value={specialtyDraft} onChange={e => setSpecialtyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpecialty(); } }}
                placeholder="e.g. Feature films, Documentary — press Enter" disabled={form.specialties.length >= 20} />
              <button type="button" className="btn btn-secondary" onClick={addSpecialty} disabled={!specialtyDraft.trim()}>Add</button>
            </div>
            {form.specialties.length > 0 && (
              <div className="prof-skills-list co-editor-chips">
                {form.specialties.map(s => (
                  <button key={s} type="button" className="chip chip-btn" onClick={() => set('specialties', form.specialties.filter(x => x !== s))} aria-label={`Remove ${s}`}>
                    {s} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        </section>

        <section className="card co-editor-card">
          <h2 className="co-editor-heading">Notable work</h2>
          <p className="muted co-editor-help">Titles on HSI that the company made, produced or represented. Up to 12.</p>
          {notable.length < 12 && (
            <EntitySearch
              value={notableQuery}
              entityId={null}
              placeholder="Search movies, shows and music…"
              filter={e => e.type !== 'company' && !notable.some(n => n.id === e.id)}
              clearOnSelect
              onTextChange={setNotableQuery}
              onSelect={e => { if (e) setNotable(list => [...list, e]); }}
            />
          )}
          {notable.length > 0 && (
            <ul className="co-editor-list">
              {notable.map(n => (
                <li key={n.id}>
                  <span className="co-editor-list-title">{n.title}</span>
                  <span className="faint">{TYPE_LABELS[n.type]}{n.year ? ` · ${n.year}` : ''}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotable(list => list.filter(x => x.id !== n.id))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card co-editor-card">
          <h2 className="co-editor-heading">Contact &amp; links</h2>
          <div className="co-editor-grid">
            <Field label="Website">
              <input className="input" type="url" inputMode="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="yourcompany.com" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="hello@yourcompany.com" />
            </Field>
            <Field label="Phone">
              <input className="input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 310 555 0100" />
            </Field>
            {SOCIALS.map(s => (
              <Field key={s.key} label={s.label}>
                <input className="input" inputMode="url" value={form.socialLinks[s.key] || ''} placeholder={s.placeholder}
                  onChange={e => set('socialLinks', { ...form.socialLinks, [s.key]: e.target.value })} />
              </Field>
            ))}
          </div>
        </section>

        {!isNew && (
          <section className="card co-editor-card co-editor-danger">
            <div>
              <h2 className="co-editor-heading">Delete this page</h2>
              <p className="muted co-editor-help">Removes the page for everyone. Experience entries that link to it keep the company name but lose the link.</p>
            </div>
            {confirmDelete ? (
              <div className="co-editor-inline">
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving}>Yes, delete</button>
              </div>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete page</button>
            )}
          </section>
        )}

        <div className="co-editor-foot">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : isNew ? 'Create page' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="co-field">
      <span className="co-field-top">
        <span className="prof-field-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
        {hint && <span className="co-field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const ERRORS: Record<string, string> = {
  'name is required': 'Give the company a name.',
  'invalid website': "That website address doesn't look right.",
  'invalid contactEmail': "That email address doesn't look right.",
  'invalid phone': 'Phone numbers can use digits, spaces, +, ( ), - and dots.',
  'invalid foundedYear': `The founding year should be between 1800 and ${new Date().getFullYear()}.`,
  'image is too large': 'That image is too large. Try a smaller one.',
};

function friendlyError(code: string | undefined) {
  if (!code) return 'Could not save the page.';
  if (ERRORS[code]) return ERRORS[code];
  const link = code.match(/^invalid (\w+) link$/);
  if (link) return `The ${SOCIALS.find(s => s.key === link[1])?.label ?? link[1]} link doesn't look right.`;
  return code.charAt(0).toUpperCase() + code.slice(1) + '.';
}
