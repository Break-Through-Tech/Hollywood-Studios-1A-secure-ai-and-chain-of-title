import { useState, useEffect } from 'react';
import { Avatar } from '../Avatar';
import { setupEncryption, unlockKEK, cacheKEK, setupMessagingKeys } from '../../crypto';

interface AccountData {
  profile: { display_name: string; email: string; handle: string; avatar_url: string | null } | null;
  application: { first_name: string; last_name: string } | null;
  settings: { auth_provider: string; password_hash: string | null } | null;
}

export function SettingsAccount({ email }: { email: string }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasEncryption, setHasEncryption] = useState(false);
  const [encSetupOpen, setEncSetupOpen] = useState(false);
  const [encPassword, setEncPassword] = useState('');
  const [encConfirm, setEncConfirm] = useState('');
  const [encSaving, setEncSaving] = useState(false);
  const [encError, setEncError] = useState('');
  const [encSuccess, setEncSuccess] = useState('');

  useEffect(() => {
    fetch('/api/settings/account/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setDisplayName(d.profile?.display_name || '');
      });
    fetch(`/api/vault/crypto-keys?email=${encodeURIComponent(email)}`)
      .then((r) => { if (r.ok) setHasEncryption(true); });
  }, [email]);

  async function saveDisplayName() {
    if (!displayName.trim() || displayName === data?.profile?.display_name) return;
    setSaving(true);
    const res = await fetch('/api/settings/account/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName: displayName.trim() }),
    });
    const d = await res.json();
    if (d.profile) setData((prev) => prev ? { ...prev, profile: d.profile } : prev);
    setSaving(false);
  }

  async function saveField() {
    if (!fieldValue.trim()) return;
    setSaving(true);
    setError('');
    const body: Record<string, string> = { email };
    if (editingField === 'email') body.newEmail = fieldValue.trim();
    if (editingField === 'username') body.handle = fieldValue.trim();
    if (editingField === 'password') {
      const res = await fetch('/api/settings/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: fieldValue }),
      });
      const d = await res.json();
      if (d.success) {
        setEditingField(null);
        setData((prev) => prev ? { ...prev, settings: { ...prev.settings!, password_hash: 'set' } } : prev);
      }
      setSaving(false);
      return;
    }
    const res = await fetch('/api/settings/account/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.error) {
      setError(d.error);
      setSaving(false);
      return;
    }
    if (d.profile) {
      setData((prev) => prev ? { ...prev, profile: d.profile } : prev);
      if (editingField === 'email') localStorage.setItem('hsi-user-email', fieldValue.trim());
    }
    setEditingField(null);
    setSaving(false);
  }

  async function handleEncryptionSetup() {
    if (!encPassword || encPassword.length < 8) {
      setEncError('Password must be at least 8 characters');
      return;
    }
    if (encPassword !== encConfirm) {
      setEncError('Passwords do not match');
      return;
    }
    setEncSaving(true);
    setEncError('');
    try {
      const bundle = await setupEncryption(encPassword);
      const kek = await unlockKEK(encPassword, bundle.encryptedKek, bundle.kekIv, bundle.kekSalt);
      const messagingBundle = await setupMessagingKeys(kek);

      const res = await fetch('/api/vault/crypto-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          encryptedKek: bundle.encryptedKek,
          kekIv: bundle.kekIv,
          kekSalt: bundle.kekSalt,
          kekIterations: bundle.kekIterations,
          publicKeyJwk: bundle.publicKeyJwk,
          encryptedPrivateKey: bundle.encryptedPrivateKey,
          privateKeyIv: bundle.privateKeyIv,
          messagingPublicKeyJwk: messagingBundle.publicKeyJwk,
          encryptedMessagingPrivateKey: messagingBundle.encryptedPrivateKey,
          messagingPrivateKeyIv: messagingBundle.privateKeyIv,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      cacheKEK(kek);
      setHasEncryption(true);
      setEncSetupOpen(false);
      setEncSuccess('Encryption enabled successfully');
      setEncPassword('');
      setEncConfirm('');
    } catch (err: any) {
      setEncError(err.message || 'Failed to set up encryption');
    } finally {
      setEncSaving(false);
    }
  }

  if (!data) return <div className="set-loading">Loading...</div>;

  const profile = data.profile;
  const hasPassword = !!data.settings?.password_hash;
  const isGoogle = data.settings?.auth_provider === 'google';

  return (
    <div className="set-account">
      <h2 className="set-heading">Your Account</h2>

      <div className="set-account-header">
        <Avatar name={profile?.display_name || email} src={profile?.avatar_url} size={72} className="set-avatar" />
        <div className="set-account-name-area">
          <label className="set-label">Display Name</label>
          <input
            type="text"
            className="set-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={saveDisplayName}
          />
          <a className="set-edit-pic-link" href={`/profile/${profile?.handle}`}>
            Edit profile pic &rarr;
          </a>
        </div>
      </div>

      {profile?.handle && (
        <a
          className="set-view-profile-btn"
          href={`/profile/${profile.handle}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          View your profile as a visitor
        </a>
      )}

      <div className="set-divider" />
      <h3 className="set-subheading">Account Settings</h3>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">Email</span>
          <span className="set-row-value">{profile?.email || email}</span>
        </div>
        <button className="set-row-btn" onClick={() => { setEditingField('email'); setFieldValue(profile?.email || email); setError(''); }}>Change</button>
      </div>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">Password</span>
          <span className="set-row-value">
            {isGoogle && !hasPassword ? 'Your account currently uses Google oAuth.' : hasPassword ? '********' : 'No password set.'}
          </span>
        </div>
        <button className="set-row-btn" onClick={() => { setEditingField('password'); setFieldValue(''); setError(''); }}>
          {hasPassword ? 'Change' : 'Add Password'}
        </button>
      </div>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">Username</span>
          <span className="set-row-value">@{profile?.handle || '...'}</span>
        </div>
        <button className="set-row-btn" onClick={() => { setEditingField('username'); setFieldValue(profile?.handle || ''); setError(''); }}>Change</button>
      </div>

      {editingField && (
        <div className="set-modal-backdrop" onClick={() => setEditingField(null)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="set-modal-title">
              {editingField === 'email' ? 'Change Email' : editingField === 'password' ? (hasPassword ? 'Change Password' : 'Add Password') : 'Change Username'}
            </h3>
            <input
              type={editingField === 'password' ? 'password' : 'text'}
              className="set-input"
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
              placeholder={editingField === 'password' ? 'Enter new password' : editingField === 'email' ? 'Enter new email' : 'Enter new username'}
              autoFocus
            />
            {error && <p className="set-error">{error}</p>}
            <div className="set-modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveField} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="set-divider" />
      <h3 className="set-subheading">Encryption &amp; Security</h3>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">End-to-End Encryption</span>
          <span className="set-row-value">
            {hasEncryption ? 'Enabled — your Creative OS items and messages can be encrypted' : 'Not set up — enable to encrypt Creative OS items and messages'}
          </span>
        </div>
        {!hasEncryption && (
          <button className="set-row-btn" onClick={() => { setEncSetupOpen(true); setEncError(''); setEncSuccess(''); }}>
            Enable
          </button>
        )}
        {hasEncryption && (
          <span className="set-enc-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Active
          </span>
        )}
      </div>

      {encSuccess && <p className="set-success">{encSuccess}</p>}

      {encSetupOpen && (
        <div className="set-modal-backdrop" onClick={() => setEncSetupOpen(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="set-modal-title">Set Up Encryption</h3>
            <p className="set-enc-desc">
              Create an encryption password to protect your Creative OS items and messages. This password is used to derive your encryption keys — it is never stored on our servers.
            </p>
            <input
              type="password"
              className="set-input"
              value={encPassword}
              onChange={(e) => setEncPassword(e.target.value)}
              placeholder="Encryption password (min 8 characters)"
              autoFocus
            />
            <input
              type="password"
              className="set-input"
              value={encConfirm}
              onChange={(e) => setEncConfirm(e.target.value)}
              placeholder="Confirm password"
              style={{ marginTop: 8 }}
            />
            {encError && <p className="set-error">{encError}</p>}
            <p className="set-enc-warning">
              If you lose this password, encrypted items cannot be recovered. There is no reset.
            </p>
            <div className="set-modal-actions">
              <button className="btn btn-secondary" onClick={() => setEncSetupOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEncryptionSetup} disabled={encSaving}>
                {encSaving ? 'Setting up...' : 'Enable Encryption'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
