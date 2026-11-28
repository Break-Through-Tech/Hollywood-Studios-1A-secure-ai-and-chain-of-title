import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  attachment_name: string | null;
}

interface PendingAttachment {
  file: File;
  preview: string | null;
  fileName: string;
}

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['png', 'jpg', 'jpeg'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  attachment_blob_url: string | null;
}

interface FriendOption {
  email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

export function MessagesPage() {
  const email = localStorage.getItem('hsi-user-email') || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef<string>(new Date().toISOString());
  const atBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/network/messages/conversations?email=${encodeURIComponent(email)}`);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* */ }
  }, [email]);

  useEffect(() => {
    fetchConversations().finally(() => setLoadingConvs(false));
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (convId: number, cursor?: string) => {
    const params = new URLSearchParams({ email, conversationId: String(convId) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`/api/network/messages/list?${params}`);
    if (!res.ok) return null;
    return res.json();
  }, [email]);

  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv);
    setMessages([]);
    setNextCursor(null);
    setLoadingMsgs(true);
    setText('');

    const data = await fetchMessages(conv.id);
    if (data) {
      setMessages(data.messages.reverse());
      setNextCursor(data.nextCursor);
      if (data.messages.length > 0) sinceRef.current = data.messages[0].created_at;
    }
    setLoadingMsgs(false);
    atBottomRef.current = true;
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      inputRef.current?.focus();
    }, 50);
  }, [fetchMessages]);

  // Poll for new messages
  useEffect(() => {
    if (!activeConv) return;
    const convId = activeConv.id;
    const interval = setInterval(async () => {
      const params = new URLSearchParams({ email, since: sinceRef.current });
      try {
        const res = await fetch(`/api/network/messages/poll?${params}`);
        if (!res.ok) return;
        const { updates, serverTime } = await res.json();
        if (updates.length > 0) {
          const convUpdates = updates.filter((m: Message) => m.conversation_id === convId);
          if (convUpdates.length > 0) {
            setMessages(prev => {
              const ids = new Set(prev.map(m => m.id));
              const newMsgs = convUpdates.filter((m: Message) => !ids.has(m.id));
              return [...prev, ...newMsgs];
            });
            if (atBottomRef.current) {
              setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
            }
          }
          sinceRef.current = serverTime;
          fetchConversations();
        }
      } catch { /* */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [email, activeConv, fetchConversations]);

  const loadEarlier = async () => {
    if (!nextCursor || loadingMore || !activeConv) return;
    setLoadingMore(true);
    const data = await fetchMessages(activeConv.id, nextCursor);
    if (data) {
      setMessages(prev => [...data.messages.reverse(), ...prev]);
      setNextCursor(data.nextCursor);
    }
    setLoadingMore(false);
  };

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert('File type not allowed. Accepted: PDF, DOCX, PNG, JPG, JPEG');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert('File too large (max 5MB)');
      return;
    }

    const preview = IMAGE_TYPES.includes(ext) ? URL.createObjectURL(file) : null;
    setPendingAttachment({ file, preview, fileName: file.name });
  };

  const clearAttachment = () => {
    if (pendingAttachment?.preview) URL.revokeObjectURL(pendingAttachment.preview);
    setPendingAttachment(null);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !pendingAttachment) || sending || !activeConv) return;
    setSending(true);
    try {
      let attachmentBlobUrl: string | null = null;
      let attachmentName: string | null = null;
      let attachmentType: string | null = null;
      let attachmentSize: number | null = null;

      if (pendingAttachment) {
        setUploading(true);
        const base64 = await fileToBase64(pendingAttachment.file);
        const uploadRes = await fetch('/api/network/messages/upload-attachment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            toEmail: activeConv.other_email,
            fileName: pendingAttachment.fileName,
            fileData: base64,
          }),
        });
        setUploading(false);
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          alert(err.error || 'Failed to upload file');
          setSending(false);
          return;
        }
        const uploaded = await uploadRes.json();
        attachmentBlobUrl = uploaded.blobUrl;
        attachmentName = uploaded.fileName;
        attachmentType = uploaded.fileType;
        attachmentSize = uploaded.fileSize;
      }

      const res = await fetch('/api/network/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          toEmail: activeConv.other_email,
          content: trimmed,
          attachmentName,
          attachmentType,
          attachmentSize,
          attachmentBlobUrl,
        }),
      });
      if (!res.ok) return;
      const { message } = await res.json();
      setMessages(prev => [...prev, { ...message, is_mine: true, sender_display_name: null, sender_avatar_url: null }]);
      setText('');
      clearAttachment();
      sinceRef.current = message.created_at;
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
      fetchConversations();
    } finally { setSending(false); setUploading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const downloadAttachment = async (messageId: number, fileName: string) => {
    try {
      const res = await fetch('/api/network/messages/download-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, email }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* */ }
  };

  // New chat
  const openNewChat = async () => {
    setShowNewChat(true);
    setFriendSearch('');
    if (friends.length === 0) {
      setLoadingFriends(true);
      try {
        const res = await fetch(`/api/network/messages/friends?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          setFriends(data.friends || []);
        }
      } catch { /* */ }
      setLoadingFriends(false);
    }
  };

  const startConversation = async (friend: FriendOption) => {
    setShowNewChat(false);
    try {
      const res = await fetch('/api/network/messages/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, toEmail: friend.email }),
      });
      if (!res.ok) return;
      const { conversation } = await res.json();
      await fetchConversations();
      openConversation(conversation);
    } catch { /* */ }
  };

  const filteredConvs = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.other_display_name || '').toLowerCase().includes(q)
      || (c.other_handle || '').toLowerCase().includes(q)
      || (c.other_email || '').toLowerCase().includes(q);
  });

  const filteredFriends = friends.filter(f => {
    if (!friendSearch.trim()) return true;
    const q = friendSearch.toLowerCase();
    return (f.display_name || '').toLowerCase().includes(q)
      || (f.handle || '').toLowerCase().includes(q)
      || f.email.toLowerCase().includes(q);
  });

  // Group messages by date for separators
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach(m => {
    const d = new Date(m.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === label) {
      last.messages.push(m);
    } else {
      groupedMessages.push({ date: label, messages: [m] });
    }
  });

  return (
    <div className={`dm-page ${activeConv ? 'dm-page--chat-open' : ''}`}>
      {/* Sidebar: conversation list */}
      <div className="dm-sidebar">
        <div className="dm-sidebar-header">
          <h2 className="dm-sidebar-title">Messages</h2>
          <button className="dm-new-btn" onClick={openNewChat} title="New message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        <div className="dm-search-wrap">
          <svg className="dm-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="dm-search"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="dm-conv-list">
          {loadingConvs ? (
            <div className="dm-conv-list-empty">
              <div className="dm-skeleton" /><div className="dm-skeleton" /><div className="dm-skeleton" />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="dm-conv-list-empty">
              <p className="dm-empty-text">{search ? 'No conversations match your search' : 'No conversations yet'}</p>
              {!search && (
                <button className="btn btn-ghost btn-sm" onClick={openNewChat}>Start a conversation</button>
              )}
            </div>
          ) : (
            filteredConvs.map(conv => (
              <button
                key={conv.id}
                className={`dm-conv-item ${activeConv?.id === conv.id ? 'dm-conv-item--active' : ''}`}
                onClick={() => openConversation(conv)}
              >
                <Avatar name={conv.other_display_name || conv.other_email} size={44} src={conv.other_avatar_url} />
                <div className="dm-conv-info">
                  <div className="dm-conv-top">
                    <span className="dm-conv-name">{conv.other_display_name || conv.other_email}</span>
                    <span className="dm-conv-time">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <p className="dm-conv-preview">
                    {conv.last_message_sender === email ? 'You: ' : ''}
                    {conv.last_message_content || (conv.attachment_name ? `Sent a file` : 'No messages yet')}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main: chat thread */}
      <div className="dm-main">
        {!activeConv ? (
          <div className="dm-empty-state">
            <div className="dm-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="dm-empty-title">Your Messages</h3>
            <p className="dm-empty-desc">Send private messages to your friends</p>
            <button className="btn btn-primary" onClick={openNewChat}>Send a message</button>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="dm-chat-header">
              <button className="dm-back-btn" onClick={() => setActiveConv(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <Avatar name={activeConv.other_display_name || activeConv.other_email} size={36} src={activeConv.other_avatar_url} />
              <div className="dm-chat-header-info">
                <span className="dm-chat-header-name">{activeConv.other_display_name || activeConv.other_email}</span>
                {activeConv.other_handle && <span className="dm-chat-header-handle">@{activeConv.other_handle}</span>}
              </div>
            </div>

            {!activeConv.is_friend && (
              <div className="dm-no-friend-banner">You are no longer friends. Message history is preserved but you cannot send new messages.</div>
            )}

            {/* Messages */}
            <div className="dm-messages" ref={listRef} onScroll={handleScroll}>
              {nextCursor && (
                <button className="dm-load-earlier" onClick={loadEarlier} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load earlier messages'}
                </button>
              )}
              {loadingMsgs ? (
                <div className="dm-messages-empty">
                  <p>Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="dm-messages-empty">
                  <p>No messages yet. Say hello!</p>
                </div>
              ) : (
                groupedMessages.map(group => (
                  <div key={group.date}>
                    <div className="dm-date-sep">
                      <span>{group.date}</span>
                    </div>
                    {group.messages.map(m => (
                      <div key={m.id} className={`dm-bubble ${m.is_mine ? 'dm-bubble--mine' : 'dm-bubble--theirs'}`}>
                        {!m.is_mine && (
                          <Avatar name={activeConv.other_display_name || activeConv.other_email} size={28} src={activeConv.other_avatar_url} />
                        )}
                        <div className={`dm-bubble-body ${m.is_mine ? 'dm-bubble-body--mine' : 'dm-bubble-body--theirs'}`}>
                          {m.attachment_blob_url && m.attachment_name && (
                            <button
                              className={`dm-attachment-card ${m.is_mine ? 'dm-attachment-card--mine' : ''}`}
                              onClick={() => downloadAttachment(m.id, m.attachment_name!)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <span className="dm-attachment-name">{m.attachment_name}</span>
                              {m.attachment_size && <span className="dm-attachment-size">{formatFileSize(m.attachment_size)}</span>}
                            </button>
                          )}
                          {m.content && (() => {
                            const parsed = parseVaultLink(m.content);
                            if (parsed) {
                              return <>
                                {parsed.textBefore && <p className="dm-bubble-text">{parsed.textBefore}</p>}
                                <VaultLinkCard slug={parsed.slug} kind={parsed.kind} isMine={m.is_mine} />
                              </>;
                            }
                            return <p className="dm-bubble-text">{m.content}</p>;
                          })()}
                          <span className="dm-bubble-time">{formatMessageTime(m.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Compose */}
            {activeConv.is_friend && (
              <div className="dm-compose-area">
                {pendingAttachment && (
                  <div className="dm-pending-attachment">
                    {pendingAttachment.preview ? (
                      <img src={pendingAttachment.preview} alt="" className="dm-pending-thumb" />
                    ) : (
                      <div className="dm-pending-file-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                    )}
                    <span className="dm-pending-name">{pendingAttachment.fileName}</span>
                    <span className="dm-pending-size">{formatFileSize(pendingAttachment.file.size)}</span>
                    <button className="dm-pending-remove" onClick={clearAttachment}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="dm-compose-toolbar">
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                  />
                  <button
                    className="dm-toolbar-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    File
                  </button>
                  <button
                    className="dm-toolbar-btn"
                    onClick={() => { fileInputRef.current?.setAttribute('accept', '.png,.jpg,.jpeg'); fileInputRef.current?.click(); setTimeout(() => fileInputRef.current?.setAttribute('accept', '.pdf,.docx,.png,.jpg,.jpeg'), 100); }}
                    disabled={sending}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                    Photo
                  </button>
                  <button
                    className="dm-toolbar-btn"
                    onClick={() => { fileInputRef.current?.setAttribute('accept', '.pdf,.docx'); fileInputRef.current?.click(); setTimeout(() => fileInputRef.current?.setAttribute('accept', '.pdf,.docx,.png,.jpg,.jpeg'), 100); }}
                    disabled={sending}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    Document
                  </button>
                  <span className="dm-toolbar-hint">Max 5MB</span>
                </div>
                <div className="dm-compose">
                  <input
                    ref={inputRef}
                    className="dm-compose-input"
                    placeholder={uploading ? 'Uploading file...' : 'Type a message...'}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    maxLength={5000}
                  />
                  <button className="dm-compose-send" onClick={handleSend} disabled={(!text.trim() && !pendingAttachment) || sending}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New chat overlay */}
      {showNewChat && (
        <>
          <div className="dm-overlay" onClick={() => setShowNewChat(false)} />
          <div className="dm-new-chat-modal">
            <div className="dm-new-chat-header">
              <h3>New Message</h3>
              <button className="dm-new-chat-close" onClick={() => setShowNewChat(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="dm-new-chat-search-wrap">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                className="dm-new-chat-search"
                placeholder="Search friends..."
                value={friendSearch}
                onChange={e => setFriendSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="dm-new-chat-list">
              {loadingFriends ? (
                <p className="dm-new-chat-empty">Loading...</p>
              ) : filteredFriends.length === 0 ? (
                <p className="dm-new-chat-empty">{friendSearch ? 'No friends match your search' : 'No friends yet. Connect with people first!'}</p>
              ) : (
                filteredFriends.map(f => (
                  <button key={f.email} className="dm-new-chat-item" onClick={() => startConversation(f)}>
                    <Avatar name={f.display_name || f.email} size={40} src={f.avatar_url} />
                    <div className="dm-new-chat-info">
                      <span className="dm-new-chat-name">{f.display_name || f.email}</span>
                      {f.handle && <span className="dm-new-chat-handle">@{f.handle}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
