const ME = 'qa@example.test';
const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const SCRIPT = `INT. DINER — NIGHT

The last booth. NANCY OSBORN (22) wipes a counter that is already clean. Rain against the glass.

A bell. The door. Nobody comes in.

                              NANCY
                    We're closed.

Beat. The bell again — from the kitchen.

                              NANCY (CONT'D)
                         (quieter)
                    We're closed.

She does not turn around.

                                                    CUT TO:

EXT. PARKING LOT — CONTINUOUS

One car. Hers. The dome light is on and she did not leave it on.`;

const items = [
  { slug: 'qa-script-1', owner_email: ME, title: 'The Last Straw', file_name: 'last-straw-v3.fountain', file_type: 'fountain', file_size: 48211, file_data: SCRIPT, item_kind: 'upload', project_type: 'script', privacy: 'private', status: 'in_review', collaborators: [], workspace_content: '', workspace_context: '', created_at: ago(30), shares: [], has_timestamp: true, is_encrypted: false, timestamps: [{ content_hash: 'a7f8e9d2c3b4a5f6e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8', ots_proof: null, status: 'confirmed', created_at: ago(29), confirmed_at: ago(20) }] },
  { slug: 'qa-workspace-1', owner_email: ME, title: 'Hunt Club — treatment', file_name: null, file_type: null, file_size: 0, file_data: null, item_kind: 'workspace', project_type: 'treatment', privacy: 'shared', status: 'draft', collaborators: ['tj@example.test'], workspace_content: 'A contained horror set over one night in a Georgia hunting lodge.\n\nLogline: Six college friends win a weekend at a private hunting club and discover the invitation was the trap.\n\nAct One — arrival, the lodge, the rules read aloud.', workspace_context: 'Tone: Barbarian meets Ready or Not. Budget under $5M.', created_at: ago(200), shares: [{ shared_with: 'tj@example.test', permission: 'edit' }], has_timestamp: false, is_encrypted: false, timestamps: [] },
  { slug: 'qa-deck-1', owner_email: ME, title: 'Singing in My Sleep — pitch deck', file_name: 'deck.pdf', file_type: 'pdf', file_size: 2400000, file_data: null, item_kind: 'upload', project_type: 'pitch_deck', privacy: 'public', status: 'final', collaborators: [], workspace_content: '', workspace_context: '', created_at: ago(900), shares: [], has_timestamp: true, is_encrypted: true, timestamps: [] },
];
const shared = [{ slug: 'qa-shared-1', title: 'Dutton Ranch — S1 bible', file_name: 'bible.docx', file_type: 'docx', file_size: 120000, created_at: ago(60), owner_email: 'steven@example.test', project_type: 'other', privacy: 'shared', status: 'draft', item_kind: 'upload', my_permission: 'view' }];
const folders = [{ slug: 'qa-folder-1', name: 'Pilots 2026', created_at: ago(500), item_count: 4 }];

const dims = [['premise_concept','Premise & Concept',82],['structure_plot','Structure & Plot',71],['character_development','Character Development',74],['dialogue','Dialogue',88],['theme_meaning','Theme & Meaning',66],['emotional_impact','Emotional Impact',79],['pacing_rhythm','Pacing & Rhythm',70],['originality','Originality',84]];
const coverage = { tool: 'coverage', status: 'completed', overall_score: 77, detected_genre: 'Horror / Thriller', error_message: null, started_at: ago(5), completed_at: ago(4.8),
  dimensions: dims.map(([k,l,s]) => ({ dimension: k, label: l, score: s, weight: 0.12, summary: `${l}: a contained horror with a clean hook and a protagonist who does not yet want anything in Act 1.`, detailed_analysis: 'The diner sequence on page 14 is the script\'s best page; the reveal on page 61 arrives ten pages late. Comps: Barbarian, Talk to Me.', completed_at: ago(4.8) })) };

const conversations = [
  { id: 1, other_email: 'jessica@example.test', other_display_name: 'Jessica Belkin', other_handle: 'jessica-belkin', other_avatar_url: null, last_message_content: 'Table read is Thursday — can you send the sides?', last_message_sender: 'jessica@example.test', last_message_at: ago(2), is_friend: true, attachment_name: null },
  { id: 2, other_email: 'tj@example.test', other_display_name: "TJ O'Donnell", other_handle: 'thomas-o-donnell', other_avatar_url: null, last_message_content: 'Coverage is up in the Creative OS.', last_message_sender: ME, last_message_at: ago(30), is_friend: true, attachment_name: null },
];
const messages = [
  { id: 11, conversation_id: 1, sender_email: 'jessica@example.test', content: 'Hey — did the network sign off on the beach unit?', created_at: ago(5), sender_display_name: 'Jessica Belkin', sender_avatar_url: null, is_mine: false, attachment_name: null, attachment_type: null, attachment_size: null, attachment_blob_url: null },
  { id: 12, conversation_id: 1, sender_email: ME, content: 'They did. Charlie Vale runs the tower now — the reboot leans into it.', created_at: ago(4), sender_display_name: 'You', sender_avatar_url: null, is_mine: true, attachment_name: null, attachment_type: null, attachment_size: null, attachment_blob_url: null },
  { id: 13, conversation_id: 1, sender_email: 'jessica@example.test', content: 'Table read is Thursday — can you send the sides?', created_at: ago(2), sender_display_name: 'Jessica Belkin', sender_avatar_url: null, is_mine: false, attachment_name: 'sides-ep101.pdf', attachment_type: 'pdf', attachment_size: 240000, attachment_blob_url: null },
];

const links = [{ id: 1, token: 'tok_abc', label: 'CAA — first look', require_email: true, is_active: true, created_at: ago(72), expires_at: ago(-240), max_visits: 10, visit_count: 3, allowed_emails: null, allow_download: false, notify_on_view: true, nda_text: 'Standard NDA', watermark_enabled: true, verify_email: true, has_passcode: false }];
const sessions = [
  { id: 1, session_key: 's1', link_id: 1, viewer_email: 'agent@caa.test', viewer_name: 'Agent One', duration_seconds: 840, max_scroll_pct: 92, pages_viewed: 88, total_pages: 98, page_times: { '1': 40, '14': 120, '61': 90 }, started_at: ago(20), last_active_at: ago(19.7), ip_country: 'US', ip_city: 'Los Angeles', ip_region: 'CA', version_number: 3, download_count: 0, link_label: 'CAA — first look' },
  { id: 2, session_key: 's2', link_id: 1, viewer_email: 'reader@caa.test', viewer_name: null, duration_seconds: 210, max_scroll_pct: 31, pages_viewed: 30, total_pages: 98, page_times: null, started_at: ago(6), last_active_at: ago(5.9), ip_country: 'US', ip_city: 'New York', ip_region: 'NY', version_number: 3, download_count: 0, link_label: 'CAA — first look' },
];
const notes = [{ id: 1, session_id: 1, author_email: 'agent@caa.test', kind: 'viewer', target_email: null, content: 'Strong first act. Would read a next draft.', created_at: ago(19.5) }];
const versions = [{ id: 3, version_number: 3, content_hash: 'a7f8e9d2c3b4a5f6', note: 'Tightened the diner scene', created_at: ago(30) }, { id: 2, version_number: 2, content_hash: '9c1d2e3f4a5b6c7d', note: null, created_at: ago(300) }];

const profile = { id: 9001, email: ME, handle: 'qa-tester', display_name: 'QA Tester', headline: 'Producer · QA', avatar_url: null, bio: null, location: 'Los Angeles, CA', skills: ['Producing'], featured_credit_ids: [], is_directory: false };

export const fixtures = {
  'POST /api/settings/account/get': { profile, application: { first_name: 'QA', last_name: 'Tester' }, settings: { email: ME, notify_email: true }, connectionCount: 12 },
  'POST /api/vault/list': { owned: items, shared, folders },
  'POST /api/vault/get': (body) => ({ ...(items.find(i => i.slug === body.slug) || items[0]), role: 'owner' }),
  'POST /api/vault/attachments/list': { attachments: [{ id: 1, file_name: 'lookbook.pdf', file_type: 'pdf', file_size: 1800000, created_at: ago(10) }] },
  'POST /api/vault/analysis/status': { coverage, relativity: null, greenlight: null },
  'POST /api/vault/timestamp-status': { timestamps: items[0].timestamps },
  'POST /api/vault/tracking/list-links': { links },
  'POST /api/vault/tracking/summary': { sessions, notes },
  'POST /api/vault/tracking/signatures': { signatures: [{ id: 1, link_id: 1, signer_name: 'Agent One', signer_email: 'agent@caa.test', ip_address: null, agreement_hash: 'deadbeef', signed_at: ago(20), link_label: 'CAA — first look' }] },
  'POST /api/vault/tracking/versions': { versions },
  'GET /api/vault/crypto-keys': { has_keys: false },
  'GET /api/network/messages/conversations': { conversations },
  'GET /api/network/messages/list': { messages },
  'GET /api/network/messages/poll': { messages: [] },
  'GET /api/network/messages/friends': { friends: [{ email: 'jessica@example.test', display_name: 'Jessica Belkin', handle: 'jessica-belkin', avatar_url: null }] },
  'POST /api/settings/pages/list': { pages: [{ id: 1, url: 'https://imdb.com/name/nm000', label: 'IMDb', created_at: ago(100) }] },
  'POST /api/stripe/status': { plan: 'free', status: 'none' },
  'POST /api/people/list': { people: [
    { id: 1, handle: 'jessica-belkin', display_name: 'Jessica Belkin', headline: 'Actress — Baywatch, Elle', avatar_url: null, location: 'Los Angeles, CA', skills: ['Acting','Television','Film','Voice','Stunts'], connection_status: 'pending', request_direction: 'received', relevance: 3, is_directory: false, credit_count: 52, department: 'Acting' },
    { id: 2, handle: 'thomas-o-donnell', display_name: "TJ O'Donnell", headline: 'Development executive', avatar_url: null, location: 'New York', skills: ['Development'], connection_status: 'accepted', request_direction: null, relevance: 2, is_directory: false, credit_count: 0, department: null },
    { id: 3, handle: 'rob-webb', display_name: 'Rob Webb', headline: 'Writer-director', avatar_url: null, location: 'Atlanta', skills: ['Writing','Directing'], connection_status: 'pending', request_direction: 'sent', relevance: 1, is_directory: false, credit_count: 0, department: null },
    { id: 4, handle: 'steven-saxton', display_name: 'Sir Steven Saxton', headline: 'Founder, Hollywood Studios', avatar_url: null, location: 'Los Angeles', skills: ['Producing','Executive'], connection_status: null, request_direction: null, relevance: 0, is_directory: false, credit_count: 0, department: null },
    { id: 5, handle: 'jessica-treska', display_name: 'Jessica Treska', headline: 'Actress — Sharp Objects', avatar_url: null, location: 'California', skills: ['Acting'], connection_status: null, request_direction: null, relevance: 0, is_directory: true, credit_count: 20, department: 'Acting' },
  ] },
};
export const SESSION = { email: ME, token: 'qa-fake-session-token-000000000000' };
