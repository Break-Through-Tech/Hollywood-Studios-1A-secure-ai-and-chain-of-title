import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const INDUSTRY_ROLES: { category: string; roles: string[] }[] = [
  { category: 'Film & Television', roles: ['Writer', 'Director', 'Producer', 'Executive Producer', 'Showrunner', 'Actor', 'Cinematographer', 'Editor', 'Studio / Production Company'] },
  { category: 'Music', roles: ['Music Artist', 'Songwriter', 'Composer', 'Producer', 'Label / Executive'] },
  { category: 'Authors & Publishing', roles: ['Author', 'Screenwriter', 'Journalist', 'Publisher'] },
  { category: 'Fashion & Creative Arts', roles: ['Fashion Designer', 'Model', 'Photographer', 'Artist', 'Designer', 'Creative Director'] },
  { category: 'Digital & Streaming', roles: ['Streamer', 'Podcaster', 'Influencer', 'Digital Creator'] },
  { category: 'Industry Business', roles: ['Financier / Investor', 'Talent Agent / Manager', 'Distributor / Platform', 'Entertainment Attorney', 'Marketing / Branding'] },
  { category: 'AI / Technology', roles: ['Startup Founder', 'Other'] },
];

const GENRES = ['Drama', 'Comedy', 'Thriller', 'Genre / Horror / Sci-Fi', 'Unscripted / Documentary'];
const FORMATS = ['Feature Film', 'Series', 'Documentary', 'Short-Form / Web', 'Podcast / Audio'];

const CURRENT_FOCUS = [
  'Feature Films', 'Television / Series', 'Podcasts / Audio', 'Documentary',
  'Short-Form / Digital', 'Streaming Content', 'Live Events', 'Building a Company / Brand',
];

const INTERESTS_GROUPS: { heading: string; items: string[] }[] = [
  { heading: 'Relationships & Collaboration', items: ['Connecting with collaborators', 'Access to producers and creators', 'Talent and representation relationships', 'Investor and financing opportunities', 'Strategic partnerships'] },
  { heading: 'Creative & Intelligence Tools', items: ['Developing and refining projects', 'AI-powered creative analysis', 'Audience and market insights', 'Packaging and pitch preparation', 'Project and slate management'] },
  { heading: 'Secure Infrastructure & IP Protection', items: ['Secure AI collaboration', 'Secure IP protection and timestamping', 'Verified professional network', 'Trusted sharing and communication'] },
  { heading: 'Growth & Opportunities', items: ['Financing opportunities', 'Distribution relationships', 'Brand partnerships', 'Licensing opportunities', 'Co-production opportunities'] },
];

const CONNECT_WITH = [
  'Directors / Producers', 'Actors / Talent', 'Music Artists', 'Authors',
  'Fashion Creators', 'Streamers / Digital Talent', 'Investors / Financiers',
  'Studios / Networks', 'Distributors / Platforms', 'Agents / Managers',
  'Brand Partners', 'AI / Technology Leaders',
];

const USE_CASES = [
  'Develop and refine projects', 'Generate coverage and analysis',
  'Secure and timestamp materials', 'Prepare materials for pitching',
  'Manage a slate of projects',
];

function wordCount(text: string) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function toggleItem(arr: string[], item: string, max?: number) {
  if (arr.includes(item)) return arr.filter((i) => i !== item);
  if (max && arr.length >= max) return arr;
  return [...arr, item];
}

export function ApplicationPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('email') || '';
  });
  const [phone, setPhone] = useState('');

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [headline, setHeadline] = useState('');
  const [background, setBackground] = useState('');

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);

  const [whyJoin, setWhyJoin] = useState('');
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [useCaseDetail, setUseCaseDetail] = useState('');

  const [referred, setReferred] = useState(false);
  const [hasIP, setHasIP] = useState(false);
  const [understandsCurated, setUnderstandsCurated] = useState(false);
  const [agreesStandards, setAgreesStandards] = useState(false);
  const [wantsUpdates, setWantsUpdates] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit() {
    if (!firstName || !lastName || !email) {
      setSubmitError('Please fill in your first name, last name, and email.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, phone,
          roles: selectedRoles,
          headline, background,
          genres: selectedGenres,
          formats: selectedFormats,
          focusAreas: selectedFocus,
          interests: selectedInterests,
          connections: selectedConnections,
          whyJoin,
          useCases: selectedUseCases,
          useCaseDetail,
          referred, hasIP, understandsCurated, agreesStandards, wantsUpdates,
          additionalInfo,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setSubmitError(data.status === 'pending'
          ? 'An application with this email is already under review.'
          : 'An account with this email already exists.');
        return;
      }

      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      navigate('/login?submitted=true');
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-page">
      <div className="app-page-inner">
        <Link to="/" className="app-logo-wrap">
          <img src="/logo.png" alt="HSI" className="app-logo" />
        </Link>

        <header className="app-header">
          <h1 className="app-title">Hollywood Studios</h1>
          <h2 className="app-subtitle">Industry Access Application</h2>
          <p className="app-desc">
            The private network for creators, executives, rights holders, innovators, and industry leaders shaping what gets made next.
          </p>
          <p className="app-desc-detail">
            Hollywood Studios™ is a curated entertainment network connecting verified creators, collaborators, executives, financiers, and decision-makers across film, television, music, publishing, fashion, art, and digital media. Access is granted selectively based on professional experience, creative alignment, industry contribution, and community fit.
          </p>
        </header>

        {/* Basic Information */}
        <section className="app-section">
          <h3 className="app-section-title">Basic information</h3>
          <div className="app-field-grid">
            <div className="app-field">
              <input type="text" className="app-input" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="app-field">
              <input type="text" className="app-input" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="app-field">
              <input type="email" className="app-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="app-field">
              <input type="tel" className="app-input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Industry Roles */}
        <section className="app-section">
          <h3 className="app-section-title">How do you work in the industry?</h3>
          <p className="app-section-hint">Select up to 3</p>
          <div className="app-roles">
            {INDUSTRY_ROLES.map((group) => (
              <div key={group.category} className="app-role-group">
                <button
                  type="button"
                  className={`app-role-category ${expandedCategory === group.category ? 'expanded' : ''} ${group.roles.some((r) => selectedRoles.includes(r)) ? 'has-selected' : ''}`}
                  onClick={() => setExpandedCategory(expandedCategory === group.category ? null : group.category)}
                >
                  <span>{group.category}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="app-role-chevron">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {expandedCategory === group.category && (
                  <div className="app-role-options">
                    {group.roles.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`app-chip ${selectedRoles.includes(role) ? 'selected' : ''}`}
                        onClick={() => setSelectedRoles(toggleItem(selectedRoles, role, 3))}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {selectedRoles.length > 0 && (
            <div className="app-selected-tags">
              {selectedRoles.map((role) => (
                <span key={role} className="app-tag">
                  {role}
                  <button type="button" onClick={() => setSelectedRoles(selectedRoles.filter((r) => r !== role))}>×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Professional Background */}
        <section className="app-section">
          <h3 className="app-section-title">Professional background</h3>
          <div className="app-field" style={{ marginBottom: 16 }}>
            <textarea
              className="app-textarea"
              placeholder="Professional headline — a brief summary of who you are"
              value={headline}
              onChange={(e) => wordCount(e.target.value) <= 50 && setHeadline(e.target.value)}
              rows={2}
            />
            <span className="app-word-count">{wordCount(headline)} / 50 words</span>
          </div>
          <div className="app-field">
            <textarea
              className="app-textarea"
              placeholder="Tell us about your professional background, key projects, and experience in the industry"
              value={background}
              onChange={(e) => wordCount(e.target.value) <= 250 && setBackground(e.target.value)}
              rows={5}
            />
            <span className="app-word-count">{wordCount(background)} / 250 words</span>
          </div>
        </section>

        {/* Creative Focus */}
        <section className="app-section">
          <h3 className="app-section-title">Creative focus</h3>
          <p className="app-section-hint">Select the genres and formats that best describe your work.</p>

          <div className="app-subsection">
            <h4 className="app-subsection-title">Primary genres</h4>
            <div className="app-chip-grid">
              {GENRES.map((g) => (
                <button key={g} type="button" className={`app-chip ${selectedGenres.includes(g) ? 'selected' : ''}`} onClick={() => setSelectedGenres(toggleItem(selectedGenres, g))}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="app-subsection">
            <h4 className="app-subsection-title">Currently developing</h4>
            <div className="app-chip-grid">
              {FORMATS.map((f) => (
                <button key={f} type="button" className={`app-chip ${selectedFormats.includes(f) ? 'selected' : ''}`} onClick={() => setSelectedFormats(toggleItem(selectedFormats, f))}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Current Focus */}
        <section className="app-section">
          <h3 className="app-section-title">What are you currently focused on?</h3>
          <p className="app-section-hint">Select all that apply</p>
          <div className="app-chip-grid">
            {CURRENT_FOCUS.map((f) => (
              <button key={f} type="button" className={`app-chip ${selectedFocus.includes(f) ? 'selected' : ''}`} onClick={() => setSelectedFocus(toggleItem(selectedFocus, f))}>
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Interests */}
        <section className="app-section">
          <h3 className="app-section-title">What interests you most about Hollywood Studios?</h3>
          <p className="app-section-hint">Select the areas most relevant to you</p>
          <div className="app-interest-groups">
            {INTERESTS_GROUPS.map((group) => (
              <div key={group.heading} className="app-interest-group">
                <h4 className="app-subsection-title">{group.heading}</h4>
                <div className="app-chip-grid">
                  {group.items.map((item) => (
                    <button key={item} type="button" className={`app-chip ${selectedInterests.includes(item) ? 'selected' : ''}`} onClick={() => setSelectedInterests(toggleItem(selectedInterests, item))}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Connect With */}
        <section className="app-section">
          <h3 className="app-section-title">Who are you most interested in connecting with?</h3>
          <div className="app-chip-grid">
            {CONNECT_WITH.map((c) => (
              <button key={c} type="button" className={`app-chip ${selectedConnections.includes(c) ? 'selected' : ''}`} onClick={() => setSelectedConnections(toggleItem(selectedConnections, c))}>
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* Why Join */}
        <section className="app-section">
          <h3 className="app-section-title">Why would you like to join Hollywood Studios?</h3>
          <p className="app-section-hint">Tell us what interests you most about gaining access to the Creative Industry Platform and how you see yourself contributing to the community.</p>
          <div className="app-field">
            <textarea
              className="app-textarea"
              placeholder=""
              value={whyJoin}
              onChange={(e) => wordCount(e.target.value) <= 200 && setWhyJoin(e.target.value)}
              rows={5}
            />
            <span className="app-word-count">{wordCount(whyJoin)} / 200 words</span>
          </div>
        </section>

        {/* Use Cases */}
        <section className="app-section">
          <h3 className="app-section-title">What are you most interested in using?</h3>
          <div className="app-chip-grid" style={{ marginBottom: 16 }}>
            {USE_CASES.map((u) => (
              <button key={u} type="button" className={`app-chip ${selectedUseCases.includes(u) ? 'selected' : ''}`} onClick={() => setSelectedUseCases(toggleItem(selectedUseCases, u))}>
                {u}
              </button>
            ))}
          </div>
          <div className="app-field">
            <textarea
              className="app-textarea"
              placeholder=""
              value={useCaseDetail}
              onChange={(e) => wordCount(e.target.value) <= 150 && setUseCaseDetail(e.target.value)}
              rows={4}
            />
            <span className="app-word-count">{wordCount(useCaseDetail)} / 150 words</span>
          </div>
        </section>

        {/* Community */}
        <section className="app-section">
          <h3 className="app-section-title">Community & membership</h3>
          <div className="app-checkboxes">
            <label className="app-checkbox">
              <input type="checkbox" checked={referred} onChange={() => setReferred(!referred)} />
              <span className="app-checkbox-mark" />
              <span>I was referred by an existing member</span>
            </label>
            <label className="app-checkbox">
              <input type="checkbox" checked={hasIP} onChange={() => setHasIP(!hasIP)} />
              <span className="app-checkbox-mark" />
              <span>I am actively working on original intellectual property or professional creative projects.</span>
            </label>
            <label className="app-checkbox">
              <input type="checkbox" checked={understandsCurated} onChange={() => setUnderstandsCurated(!understandsCurated)} />
              <span className="app-checkbox-mark" />
              <span>I understand Hollywood Studios is a curated industry network and that applications are reviewed prior to acceptance.</span>
            </label>
            <label className="app-checkbox">
              <input type="checkbox" checked={agreesStandards} onChange={() => setAgreesStandards(!agreesStandards)} />
              <span className="app-checkbox-mark" />
              <span>I agree to uphold Hollywood Studios' community standards and confidentiality expectations.</span>
            </label>
            <label className="app-checkbox">
              <input type="checkbox" checked={wantsUpdates} onChange={() => setWantsUpdates(!wantsUpdates)} />
              <span className="app-checkbox-mark" />
              <span>I would like to receive updates, invitations, opportunities, and announcements from Hollywood Studios.</span>
            </label>
          </div>
        </section>

        {/* Additional Info */}
        <section className="app-section">
          <h3 className="app-section-title">Additional information <span className="app-optional">(optional)</span></h3>
          <div className="app-field">
            <textarea
              className="app-textarea"
              placeholder=""
              value={additionalInfo}
              onChange={(e) => wordCount(e.target.value) <= 150 && setAdditionalInfo(e.target.value)}
              rows={4}
            />
            <span className="app-word-count">{wordCount(additionalInfo)} / 150 words</span>
          </div>
        </section>

        {/* Footer */}
        <footer className="app-footer">
          <p className="app-footer-tagline">Relationships drive creation. Infrastructure drives scale.</p>
          <p className="app-footer-notice">Access is limited and subject to approval.</p>
          {submitError && <p className="app-submit-error">{submitError}</p>}
          <button type="button" className="app-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
        </footer>
      </div>
    </div>
  );
}
