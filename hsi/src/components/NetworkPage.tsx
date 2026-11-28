import { useState, useEffect, useRef, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import { Link, useNavigate } from 'react-router-dom';
import { blobUrl } from '../blobUrl';
import { Avatar } from './Avatar';

const VAULT_LINK_RE = /\/vault\/(workspace|script)\/([a-zA-Z0-9_-]+)/;

interface VaultPreview {
  title: string;
  item_kind: string;
  project_type: string;
  file_type: string | null;
  owner_display_name: string | null;
  owner_handle: string | null;
}

function parseVaultLink(content: string): { kind: string; slug: string; textBefore: string } | null {
  const match = content.match(VAULT_LINK_RE);
  if (!match) return null;
  const fullUrl = content.indexOf('http') !== -1
    ? content.match(/https?:\/\/[^\s]+\/vault\/(workspace|script)\/([a-zA-Z0-9_-]+)/)?.[0] || ''
    : match[0];
  const idx = content.indexOf(fullUrl || match[0]);
  const textBefore = content.slice(0, idx).replace(/\n+$/, '').trim();
  return { kind: match[1], slug: match[2], textBefore };
}

function VaultLinkCard({ slug, kind, isMine }: { slug: string; kind: string; isMine: boolean }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<VaultPreview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');

  useEffect(() => {
    const email = localStorage.getItem('hsi-user-email') || '';
    fetch('/api/vault/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, email }),
    }).then(r => {
      if (r.status === 403) { setStatus('denied'); return null; }
      if (!r.ok) { setStatus('error'); return null; }
      return r.json();
    }).then(data => {
      if (data) { setPreview(data); setStatus('ok'); }
    }).catch(() => setStatus('error'));
  }, [slug]);

  const projectTypeLabel: Record<string, string> = {
    script: 'Script', treatment: 'Treatment', pitch_deck: 'Pitch Deck',
    contract: 'Contract', other: 'File',
  };

  if (status === 'loading') {
    return <div className={`vault-link-card ${isMine ? 'vault-link-card--mine' : ''}`}><span className="vault-link-card-loading">Loading preview...</span></div>;
  }

  if (status === 'denied') {
    return (
      <div className={`vault-link-card vault-link-card--denied ${isMine ? 'vault-link-card--mine' : ''}`}>
        <svg className="vault-link-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span className="vault-link-card-denied-text">You don't have access to this project</span>
      </div>
    );
  }

  if (status === 'error' || !preview) return null;

  return (
    <div
      className={`vault-link-card ${isMine ? 'vault-link-card--mine' : ''}`}
      onClick={() => navigate(`/vault/${kind}/${slug}`)}
    >
      <div className="vault-link-card-icon-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {kind === 'workspace' ? (
            <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>
          ) : (
            <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
          )}
        </svg>
      </div>
      <div className="vault-link-card-body">
        <span className="vault-link-card-title">{preview.title}</span>
        <span className="vault-link-card-meta">
          {projectTypeLabel[preview.project_type] || preview.project_type}
          {preview.file_type && ` · ${preview.file_type.toUpperCase()}`}
        </span>
      </div>
      <svg className="vault-link-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  );
}

const OWNER_EMAIL = localStorage.getItem('hsi-user-email') || '';
const MAX_MEDIA = 4;
const MAX_TEXT = 2000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];

interface MediaItem {
  url: string;
  type: string;
  mime_type: string;
  file_name: string;
  size: number;
}

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

interface Post {
  id: number;
  profile_id: number;
  content: string | null;
  media: MediaItem[];
  link_preview: LinkPreview | null;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  like_count: string;
  liked_by_viewer: boolean;
  is_owner: boolean;
}

interface Conversation {
  id: number;
  other_email: string;
  other_display_name: string | null;
  other_handle: string | null;
  other_avatar_url: string | null;
  last_message_content: string | null;
  last_message_sender: string | null;
  last_message_at: string;
  is_friend: boolean;
}

interface Message {
  id: number;
  conversation_id: number;
  sender_email: string;
  content: string;
  created_at: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  is_mine: boolean;
}

interface FriendOption {
  email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Post Composer ──

function PostComposer({ onPostCreated }: { onPostCreated: () => void }) {
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError('');
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) { setError(`Unsupported file type: ${file.type}`); return; }
      if (file.size > MAX_FILE_SIZE) { setError(`File too large: ${file.name} (max 10MB)`); return; }
    }
    if (mediaFiles.length + files.length > MAX_MEDIA) { setError(`Maximum ${MAX_MEDIA} files per post`); return; }
    setMediaFiles(prev => [...prev, ...files]);
    files.forEach(file => { setMediaPreviews(prev => [...prev, URL.createObjectURL(file)]); });
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed && mediaFiles.length === 0) return;
    if (trimmed.length > MAX_TEXT) { setError(`Text must be ${MAX_TEXT} characters or fewer`); return; }
    setPosting(true);
    setError('');
    try {
      const mediaItems: MediaItem[] = [];
      for (const file of mediaFiles) {
        const blob = await upload(`posts/${Date.now()}-${file.name}`, file, { access: 'private', handleUploadUrl: '/api/network/upload-token' });
        mediaItems.push({ url: blob.url, type: file.type.startsWith('video/') ? 'video' : 'image', mime_type: file.type, file_name: file.name, size: file.size });
      }
      const res = await fetch('/api/network/posts/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: localStorage.getItem('hsi-user-email') || OWNER_EMAIL, content: trimmed || null, media: mediaItems }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to create post'); }
      setText('');
      mediaPreviews.forEach(u => URL.revokeObjectURL(u));
      setMediaFiles([]);
      setMediaPreviews([]);
      onPostCreated();
    } catch (err) { setError((err as Error).message); }
    finally { setPosting(false); }
  };

  return (
    <div className="net-card net-composer">
      <textarea className="net-composer-input" placeholder="What's on your mind?" value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={MAX_TEXT} disabled={posting} />
      {mediaPreviews.length > 0 && (
        <div className="net-composer-previews">
          {mediaPreviews.map((url, i) => (
            <div key={i} className="net-composer-preview-item">
              {mediaFiles[i]?.type.startsWith('video/') ? <video src={url} className="net-composer-preview-media" /> : <img src={url} alt="" className="net-composer-preview-media" />}
              <button className="net-composer-preview-remove" onClick={() => removeMedia(i)}>×</button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="net-composer-error">{error}</p>}
      <div className="net-composer-actions">
        <div className="net-composer-tools">
          <input ref={fileRef} type="file" accept={ALLOWED_TYPES.join(',')} multiple onChange={handleFileSelect} style={{ display: 'none' }} />
          <button className="net-composer-tool-btn" onClick={() => fileRef.current?.click()} disabled={mediaFiles.length >= MAX_MEDIA || posting} title="Add image or video">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </button>
          <button className="net-composer-tool-btn" onClick={() => { if (fileRef.current) { fileRef.current.accept = 'video/mp4,video/quicktime,video/webm'; fileRef.current.click(); fileRef.current.accept = ALLOWED_TYPES.join(','); }}} disabled={mediaFiles.length >= MAX_MEDIA || posting} title="Add video">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          </button>
          {text.length > 0 && <span className="net-composer-charcount">{text.length}/{MAX_TEXT}</span>}
        </div>
        <button className="btn btn-primary btn-sm net-composer-submit" onClick={handleSubmit} disabled={!(text.trim().length > 0 || mediaFiles.length > 0) || posting}>
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ── Post Card ──

// A preview image that 404s (expired CDN signature, hotlink block) would otherwise
// leave an empty grey band above the text, so drop the image and keep the card.
function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(preview.image) && !imageFailed;

  return (
    <a href={preview.url} target="_blank" rel="noopener noreferrer" className="net-link-preview">
      {showImage && (
        <div className="net-link-preview-img-wrap">
          <img src={preview.image!} alt="" className="net-link-preview-img" loading="lazy" onError={() => setImageFailed(true)} />
        </div>
      )}
      <div className="net-link-preview-body">
        {preview.site_name && <span className="net-link-preview-site">{preview.site_name}</span>}
        {preview.title && <span className="net-link-preview-title">{preview.title}</span>}
        {preview.description && <span className="net-link-preview-desc">{preview.description}</span>}
      </div>
    </a>
  );
}

function PostCard({ post, onLike, onDelete, isOwner, index = 0 }: { post: Post; onLike: () => void; onDelete: () => void; isOwner: boolean; index?: number }) {
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const media = Array.isArray(post.media) ? post.media : [];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/network/posts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: localStorage.getItem('hsi-user-email') || OWNER_EMAIL, postId: post.id }) });
      if (res.ok) onDelete();
    } finally { setDeleting(false); setShowConfirm(false); }
  };

  return (
    <div className="net-post net-post-enter" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <div className="net-post-header">
        <Link to={`/profile/${post.handle}`} className="net-post-who">
          <Avatar name={post.display_name || post.handle} size={40} src={post.avatar_url} />
          <div>
            <span className="net-post-name">{post.display_name}</span>
            <span className="net-post-handle">@{post.handle}</span>
          </div>
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="net-post-time">{timeAgo(post.created_at)}</span>
          {isOwner && (
            showConfirm ? (
              <div className="net-post-confirm-delete">
                <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>Delete</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)}>Cancel</button>
              </div>
            ) : (
              <button className="net-post-menu-btn" onClick={() => setShowConfirm(true)} title="Delete post">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
              </button>
            )
          )}
        </div>
      </div>
      {post.content && <p className="net-post-content">{post.content}</p>}
      {media.length > 0 && (
        <div className={`net-post-media net-post-media-${Math.min(media.length, 4)}`}>
          {media.map((m, i) => m.type === 'video' ? <video key={i} src={blobUrl(m.url) || m.url} controls className="net-post-media-item" preload="metadata" /> : <img key={i} src={blobUrl(m.url) || m.url} alt="" className="net-post-media-item" loading="lazy" />)}
        </div>
      )}
      {post.link_preview && <LinkPreviewCard preview={post.link_preview} />}
      <div className="net-post-actions">
        <button className={`net-post-action-btn ${post.liked_by_viewer ? 'liked' : ''}`} onClick={onLike}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={post.liked_by_viewer ? 'var(--bad)' : 'none'} stroke={post.liked_by_viewer ? 'var(--bad)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <span>{parseInt(post.like_count) || ''}</span>
        </button>
      </div>
    </div>
  );
}

// ── Conversation Modal ──

function ConversationModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef<string>(new Date().toISOString());
  const atBottomRef = useRef(true);

  const fetchMessages = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ email, conversationId: String(conversation.id) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`/api/network/messages/list?${params}`);
    if (!res.ok) return null;
    return res.json();
  }, [email, conversation.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchMessages();
      if (data) {
        setMessages(data.messages.reverse());
        setNextCursor(data.nextCursor);
        if (data.messages.length > 0) sinceRef.current = data.messages[0].created_at;
      }
      setLoading(false);
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
    })();
  }, [fetchMessages]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const params = new URLSearchParams({ email, since: sinceRef.current });
      const res = await fetch(`/api/network/messages/poll?${params}`);
      if (!res.ok) return;
      const { updates, serverTime } = await res.json();
      if (updates.length > 0) {
        const convUpdates = updates.filter((m: Message) => m.conversation_id === conversation.id);
        if (convUpdates.length > 0) {
          setMessages(prev => {
            const ids = new Set(prev.map((m: Message) => m.id));
            const newMsgs = convUpdates.filter((m: Message) => !ids.has(m.id));
            return [...prev, ...newMsgs];
          });
          if (atBottomRef.current) setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
        }
        sinceRef.current = serverTime;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [email, conversation.id]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const loadEarlier = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchMessages(nextCursor);
    if (data) {
      setMessages(prev => [...data.messages.reverse(), ...prev]);
      setNextCursor(data.nextCursor);
    }
    setLoadingMore(false);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/network/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, toEmail: conversation.other_email, content: trimmed }),
      });
      if (!res.ok) return;
      const { message } = await res.json();
      setMessages(prev => [...prev, { ...message, is_mine: true, sender_display_name: null, sender_avatar_url: null }]);
      setText('');
      sinceRef.current = message.created_at;
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      <div className="msg-overlay" onClick={onClose} />
      <div className="msg-modal">
        <div className="msg-modal-header">
          <Avatar name={conversation.other_display_name || conversation.other_email} size={36} src={conversation.other_avatar_url} />
          <div>
            <span className="msg-modal-name">{conversation.other_display_name || conversation.other_email}</span>
            {conversation.other_handle && <span className="msg-modal-handle">@{conversation.other_handle}</span>}
          </div>
          <button className="msg-modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {!conversation.is_friend && (
          <div className="msg-no-friend-banner">You are no longer friends. Message history is preserved but you cannot send new messages.</div>
        )}

        <div className="msg-messages-list" ref={listRef} onScroll={handleScroll}>
          {nextCursor && (
            <button className="msg-load-earlier" onClick={loadEarlier} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load earlier messages'}
            </button>
          )}
          {loading ? (
            <p className="msg-empty">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="msg-empty">No messages yet. Say hello!</p>
          ) : (
            messages.map(m => {
              const parsed = m.content ? parseVaultLink(m.content) : null;
              return (
                <div key={m.id} className={`msg-bubble ${m.is_mine ? 'msg-bubble--mine' : 'msg-bubble--theirs'}`}>
                  {parsed ? (
                    <>
                      {parsed.textBefore && <p className="msg-bubble-text">{parsed.textBefore}</p>}
                      <VaultLinkCard slug={parsed.slug} kind={parsed.kind} isMine={m.is_mine} />
                    </>
                  ) : (
                    <p className="msg-bubble-text">{m.content}</p>
                  )}
                  <span className="msg-bubble-time">{timeAgo(m.created_at)}</span>
                </div>
              );
            })
          )}
        </div>

        {conversation.is_friend && (
          <div className="msg-compose">
            <input
              className="msg-compose-input"
              placeholder="Type a message..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={5000}
            />
            <button className="msg-compose-send" onClick={handleSend} disabled={!text.trim() || sending}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Friend Picker (for new conversation) ──

function FriendPicker({ onSelect, onClose }: { onSelect: (friend: FriendOption) => void; onClose: () => void }) {
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;
    fetch(`/api/network/messages/friends?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => setFriends(data.friends || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="msg-friend-picker">
      <div className="msg-friend-picker-header">
        <span>New Message</span>
        <button className="msg-friend-picker-close" onClick={onClose}>×</button>
      </div>
      {loading ? (
        <p className="msg-friend-picker-empty">Loading...</p>
      ) : friends.length === 0 ? (
        <p className="msg-friend-picker-empty">No friends yet</p>
      ) : (
        friends.map(f => (
          <button key={f.email} className="msg-friend-picker-item" onClick={() => onSelect(f)}>
            <Avatar name={f.display_name || f.email} size={32} src={f.avatar_url} />
            <div className="msg-friend-picker-info">
              <span className="msg-friend-picker-name">{f.display_name || f.email}</span>
              {f.handle && <span className="msg-friend-picker-handle">@{f.handle}</span>}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

// ── Network Page ──

interface TopCreator {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
}

export function NetworkPage() {
  const [activeTab, setActiveTab] = useState<'activity' | 'messages'>('activity');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [openConv, setOpenConv] = useState<Conversation | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [myProfile, setMyProfile] = useState<{ handle: string; display_name: string; avatar_url: string | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectionCount, setConnectionCount] = useState(0);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [postActivity, setPostActivity] = useState<number[]>(Array.from({ length: 12 }, () => 0));

  const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;

  // ── Posts ──
  const fetchPosts = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ email });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`/api/network/posts/list?${params}`);
    if (!res.ok) return;
    return res.json();
  }, [email]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts();
      if (data) { setPosts(data.posts); setNextCursor(data.nextCursor); }
    } finally { setLoading(false); }
  }, [fetchPosts]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPosts(nextCursor);
      if (data) { setPosts(prev => [...prev, ...data.posts]); setNextCursor(data.nextCursor); }
    } finally { setLoadingMore(false); }
  };

  const handleLike = async (postId: number) => {
    const res = await fetch('/api/network/posts/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, postId }) });
    if (!res.ok) return;
    const { liked, likeCount } = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked_by_viewer: liked, like_count: String(likeCount) } : p));
  };

  const handleDelete = (postId: number) => { setPosts(prev => prev.filter(p => p.id !== postId)); };

  // ── Conversations ──
  const fetchConversations = useCallback(async () => {
    const res = await fetch(`/api/network/messages/conversations?email=${encodeURIComponent(email)}`);
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations || []);
  }, [email]);

  useEffect(() => {
    fetchPosts().then(data => {
      if (data) {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        if (data.topCreators) setTopCreators(data.topCreators);
        if (data.postActivity) setPostActivity(data.postActivity);
      }
    }).finally(() => setLoading(false));
    fetch(`/api/network/messages/conversations?email=${encodeURIComponent(email)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setConversations(data.conversations || []); })
      .catch(() => {});
    fetch('/api/settings/account/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.profile) setMyProfile(d.profile);
        if (d?.connectionCount != null) setConnectionCount(d.connectionCount);
      })
      .catch(() => {});
  }, [fetchPosts, email]);

  // Poll conversations every 15s
  useEffect(() => {
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const handleNewConversation = async (friend: FriendOption) => {
    setShowFriendPicker(false);
    const res = await fetch('/api/network/messages/get-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, toEmail: friend.email }),
    });
    if (!res.ok) return;
    const { conversation } = await res.json();
    setOpenConv(conversation);
    fetchConversations();
  };

  const handleConvClose = () => {
    setOpenConv(null);
    fetchConversations();
  };

  return (
    <>
      <header className="net-topbar">
        <h1>Home</h1>
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${activeTab === 'activity' ? 'on' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
          <button role="tab" className={`tab ${activeTab === 'messages' ? 'on' : ''}`} onClick={() => setActiveTab('messages')}>Messages</button>
        </div>
        <div className="net-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
          <input type="text" placeholder="Search members" className="net-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="net-stat">
          <span className="net-stat-num">{connectionCount}</span>
          <span className="net-stat-label">connections</span>
        </div>
      </header>

      <div className="net-content">
        <div className="net-col-center">
          {activeTab === 'activity' ? (() => {
            const q = searchQuery.toLowerCase().trim();
            const filteredPosts = q
              ? posts.filter(p =>
                  (p.display_name || '').toLowerCase().includes(q) ||
                  (p.handle || '').toLowerCase().includes(q) ||
                  (p.content || '').toLowerCase().includes(q)
                )
              : posts;
            return <>
              <PostComposer onPostCreated={loadPosts} />
              <div className="net-card net-feed">
                {loading ? (
                  <p className="net-feed-note">Loading…</p>
                ) : filteredPosts.length === 0 ? (
                  <p className="net-feed-note">{q ? 'No matching posts' : 'No posts yet — be the first!'}</p>
                ) : (
                  filteredPosts.map((post, i) => (
                    <PostCard key={post.id} post={post} onLike={() => handleLike(post.id)} onDelete={() => handleDelete(post.id)} isOwner={post.is_owner} index={i} />
                  ))
                )}
              </div>
              {!q && nextCursor && !loading && (
                <button className="btn btn-secondary btn-sm net-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
              )}
            </>;
          })() : (
            <div className="net-card net-feed">
              {conversations.length === 0 ? (
                <p className="net-feed-note">No conversations yet</p>
              ) : (
                conversations.map(conv => (
                  <div key={conv.id} className="net-message-row" onClick={() => setOpenConv(conv)}>
                    <Avatar name={conv.other_display_name || conv.other_email} size={44} src={conv.other_avatar_url} />
                    <div className="net-message-row-text">
                      <div className="net-message-row-top">
                        <b>{conv.other_display_name || conv.other_email}</b>
                        <small>{timeAgo(conv.last_message_at)}</small>
                      </div>
                      <p className="net-message-row-preview">{conv.last_message_content || 'No messages yet'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <aside className="net-col-right">
          <div className="net-card net-side-card net-profile-card">
            <Avatar name={myProfile?.display_name || email} size={40} src={myProfile?.avatar_url} />
            <div className="net-profile-info">
              <div className="net-profile-name">{myProfile?.display_name || 'My Profile'}</div>
              <div className="net-profile-handle">@{myProfile?.handle || '…'}</div>
            </div>
            {myProfile?.handle && <Link to={`/profile/${myProfile.handle}`} className="net-profile-link">Profile →</Link>}
          </div>

          <div className="net-card net-side-card" style={{ position: 'relative' }}>
            <div className="net-side-title">
              Messages
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowFriendPicker(!showFriendPicker)} title="New conversation" aria-label="New conversation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            {showFriendPicker && (
              <FriendPicker onSelect={handleNewConversation} onClose={() => setShowFriendPicker(false)} />
            )}
            {conversations.length === 0 ? (
              <p className="net-side-empty">No conversations yet</p>
            ) : (
              <div className="net-side-list">
                {conversations.slice(0, 5).map(conv => (
                  <div key={conv.id} className="net-side-row" onClick={() => setOpenConv(conv)}>
                    <Avatar name={conv.other_display_name || conv.other_email} size={32} src={conv.other_avatar_url} />
                    <div className="net-side-row-text">
                      <b>{conv.other_display_name || conv.other_email}</b>
                      <small>{conv.last_message_content || 'No messages yet'}</small>
                    </div>
                    <span className="net-side-row-time">{timeAgo(conv.last_message_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="net-card net-side-card">
            <div className="net-side-title">Top creators</div>
            {topCreators.length === 0 ? (
              <p className="net-side-empty">No creators yet</p>
            ) : (
              <div className="net-side-list">
                {topCreators.map(c => (
                  <Link key={c.handle} to={`/profile/${c.handle}`} className="net-side-row">
                    <Avatar name={c.display_name || c.handle} size={32} src={c.avatar_url} />
                    <div className="net-side-row-text">
                      <b>{c.display_name}</b>
                      <small>{c.post_count} post{c.post_count !== 1 ? 's' : ''}</small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="net-card net-side-card">
            <div className="net-side-title">Activity <span className="cnt">48h</span></div>
            <div className="net-views-bar-chart" aria-label="Posts per 4-hour window, last 48 hours">
              {(() => {
                const maxVal = Math.max(...postActivity, 1);
                return postActivity.map((count, i) => (
                  <div key={i} className="net-views-bar" style={{ height: `${Math.max(4, (count / maxVal) * 100)}%` }} title={`${count} post${count !== 1 ? 's' : ''}`} />
                ));
              })()}
            </div>
          </div>
        </aside>
      </div>

      {openConv && <ConversationModal conversation={openConv} onClose={handleConvClose} />}
    </>
  );
}
