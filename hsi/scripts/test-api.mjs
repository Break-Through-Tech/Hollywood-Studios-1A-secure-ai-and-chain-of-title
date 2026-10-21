/**
 * End-to-end checks for the API routers: session gating, then the member flows —
 * profile, posts, messages, connections, entity pages, settings, Creative OS
 * (workspaces, folders, sharing, trackable links, versions), search, featured.
 *
 * Runs the real routers in-process against DATABASE_URL, the way Vercel would
 * invoke them. Every row it writes belongs to accounts under a run-scoped
 * @t<timestamp>.hsi-selftest.invalid domain, and the run deletes exactly those
 * rows before exiting. Routes that call out to an LLM, OpenTimestamps, Stripe,
 * Resend or Blob storage are not exercised.
 *
 * Usage: node scripts/test-api.mjs
 */
import { readFileSync } from 'fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* file is optional */ }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

register(pathToFileURL('./scripts/ts-resolver.mjs'));

const sql = neon(process.env.DATABASE_URL);
const DOMAIN = `t${Date.now()}.hsi-selftest.invalid`;
const at = (local) => `${local}@${DOMAIN}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) => check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

const load = (p) => import(pathToFileURL(p).href);
const routers = {
  auth: (await load('./api/auth/_router.ts')).default,
  network: (await load('./api/network/_router.ts')).default,
  people: (await load('./api/people/_router.ts')).default,
  profile: (await load('./api/profile/_router.ts')).default,
  entity: (await load('./api/entity/_router.ts')).default,
  search: (await load('./api/search/_router.ts')).default,
  settings: (await load('./api/settings/_router.ts')).default,
  vault: (await load('./api/vault/_router.ts')).default,
};
const { createSession } = await load('./api/_session.ts');
const { ensureProfile } = await load('./api/auth/_ensure-profile.ts');

/** Invoke a router the way Vercel does: `call('vault/list', { body }, token)`. */
async function call(path, { method = 'POST', body, query = {} } = {}, token = null) {
  const [base, ...rest] = path.split('/');
  const req = {
    method, body: body ?? {}, query, cookies: {},
    url: `/api/${base}/${rest.join('/')}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.end = (b) => { if (b !== undefined) res.body = b; return res; };
  try { await routers[base](req, res); }
  catch (err) { res.statusCode = res.statusCode || 500; res.body = { error: `threw: ${err.message}` }; }
  return res;
}

try {
// ── accounts ─────────────────────────────────────────────────────────
section('accounts');
const ALICE = at('alice'), BOB = at('bob');
await ensureProfile(sql, ALICE); await ensureProfile(sql, BOB);
const aliceToken = await createSession(sql, ALICE);
const bobToken = await createSession(sql, BOB);
const [alice] = await sql`SELECT id, handle FROM profiles WHERE email = ${ALICE}`;
const [bob] = await sql`SELECT id, handle FROM profiles WHERE email = ${BOB}`;
check('two member accounts with sessions', !!alice && !!bob && aliceToken && bobToken);
let r;

// ── session gating ──────────────────────────────────────────────────
// Every route that acts as a member must refuse a caller who names a member
// but carries no valid session for them. `email`/`ownerEmail` is the claim.
section('session gating — a claim without a session is refused');
const GATED = [
  ['network/posts/create', { email: ALICE, content: 'not mine to post' }],
  ['network/posts/like', { email: ALICE, postId: 1 }],
  ['network/posts/delete', { email: ALICE, postId: 1 }],
  ['network/messages/send', { email: ALICE, toEmail: BOB, content: 'hi' }],
  ['network/messages/get-or-create', { email: ALICE, toEmail: BOB }],
  ['network/messages/conversations', null, 'GET', { email: ALICE }],
  ['network/messages/list', null, 'GET', { email: ALICE, conversationId: '1' }],
  ['people/list', { email: ALICE }],
  ['people/request', { email: ALICE, targetId: bob.id }],
  ['people/respond', { email: ALICE, fromProfileId: bob.id, action: 'accept' }],
  ['profile/upsert', { email: ALICE, handle: alice.handle, displayName: 'Hijacked' }],
  ['profile/connect', { email: ALICE, targetHandle: bob.handle }],
  ['profile/credits/save', { email: ALICE, credits: [] }],
  ['profile/experience/save', { email: ALICE, company: 'X', jobTitle: 'Y' }],
  ['profile/awards/save', { email: ALICE, awardName: 'X' }],
  ['entity/create', { email: ALICE, type: 'movie', title: 'Forged Page' }],
  ['entity/delete', { email: ALICE, id: 1 }],
  ['entity/company-save', { email: ALICE, name: 'Forged Co' }],
  ['entity/my-pages', { email: ALICE }],
  ['settings/account/get', { email: ALICE }],
  ['settings/pages/add', { email: ALICE, pageName: 'x', platform: 'x', pageUrl: 'https://x' }],
  ['vault/list', { email: ALICE }],
  ['vault/create-workspace', { ownerEmail: ALICE, title: 'Forged' }],
];
r = await call('vault/upload-token', { body: { type: 'blob.generate-client-token', payload: { pathname: 'vault/uploads/x.pdf', callbackUrl: 'https://x', clientPayload: null, multipart: false } } });
eq('vault/upload-token — no session → 401', r.statusCode, 401);
r = await call('network/upload-token', { body: { type: 'blob.generate-client-token', payload: { pathname: 'posts/x.png', callbackUrl: 'https://x', clientPayload: null, multipart: false } } });
eq('network/upload-token — no session → 401', r.statusCode, 401);
r = await call('auth/upload/image', { body: { imageData: 'data:image/png;base64,AAAA', fileName: 'avatars/x.png' } });
eq('auth/upload/image — no session → 401', r.statusCode, 401);
for (const [path, body, method = 'POST', query = {}] of GATED) {
  const noToken = await call(path, { method, body, query });
  const wrongToken = await call(path, { method, body, query }, bobToken);
  eq(`${path} — no token → 401`, noToken.statusCode, 401);
  eq(`${path} — someone else's token → 401`, wrongToken.statusCode, 401);
}

section('public reads stay public');
for (const [path, body, method = 'POST', query = {}] of [
  ['people/featured', null, 'GET'],
  ['profile/get', { handle: alice.handle }],
  ['entity/projects', {}],
  ['entity/search', { query: 'the' }],
  ['search/query', { query: 'jessica' }],
  ['search/trending', {}],
  ['network/posts/list', null, 'GET', { email: '' }],
]) {
  const r = await call(path, { method, body, query });
  eq(`${path} → 200 without a session`, r.statusCode, 200);
}

// ── profile ─────────────────────────────────────────────────────────
section('profile');
r = await call('profile/upsert', { body: { email: ALICE, handle: alice.handle, displayName: 'Alice Test', headline: 'Producer', location: 'LA', skills: ['Producing'], representation: [], mediaLinks: [], featuredCreditIds: [] } }, aliceToken);
eq('upsert → 200', r.statusCode, 200);
r = await call('profile/get', { body: { handle: alice.handle } });
eq('get reflects the upsert', r.body?.profile?.headline, 'Producer');
check('get returns credits/experience/awards/connections arrays', Array.isArray(r.body?.credits) && Array.isArray(r.body?.connections));
r = await call('profile/credits/save', { body: { email: ALICE, credits: [{ department: 'Producing', title: 'Selftest Feature', year: 2026, role: 'Producer', work_type: 'Film' }] } }, aliceToken);
eq('credits/save → 200', r.statusCode, 200);
r = await call('profile/experience/save', { body: { email: ALICE, company: 'Selftest Studio', jobTitle: 'Producer', startDate: '2020-01-01' } }, aliceToken);
check('experience/save → 2xx', r.statusCode >= 200 && r.statusCode < 300, JSON.stringify(r.body));
r = await call('profile/awards/save', { body: { email: ALICE, awardName: 'Selftest Award', category: 'Best', year: 2025, result: 'won' } }, aliceToken);
check('awards/save → 2xx', r.statusCode >= 200 && r.statusCode < 300, JSON.stringify(r.body));
r = await call('profile/get', { body: { handle: alice.handle } });
eq('get shows the credit', r.body?.credits?.length, 1);
eq('get shows the experience', r.body?.experience?.length, 1);
eq('get shows the award', r.body?.awards?.length, 1);

// ── posts ───────────────────────────────────────────────────────────
section('posts');
r = await call('network/posts/create', { body: { email: ALICE, content: 'Selftest post from Alice' } }, aliceToken);
eq('create → 201', r.statusCode, 201);
const postId = r.body?.post?.id;
check('post has an id', typeof postId === 'number');
r = await call('network/posts/list', { method: 'GET', query: { email: BOB } }, bobToken);
eq('list → 200', r.statusCode, 200);
check('list includes the post', (r.body?.posts || []).some(p => p.id === postId));
r = await call('network/posts/like', { body: { email: BOB, postId } }, bobToken);
eq('like → liked', r.body?.liked, true);
eq('like count 1', r.body?.likeCount, 1);
r = await call('network/posts/like', { body: { email: BOB, postId } }, bobToken);
eq('like again → unliked', r.body?.liked, false);
r = await call('network/posts/delete', { body: { email: BOB, postId } }, bobToken);
check("someone else can't delete it", r.statusCode === 403 || r.statusCode === 404, `got ${r.statusCode}`);
r = await call('network/posts/delete', { body: { email: ALICE, postId } }, aliceToken);
eq('owner deletes → 200', r.statusCode, 200);

// ── connections ─────────────────────────────────────────────────────
section('connections');
r = await call('people/list', { body: { email: ALICE } }, aliceToken);
eq('people/list → 200', r.statusCode, 200);
check('list shows Bob', (r.body?.people || []).some(p => p.id === bob.id));
r = await call('people/request', { body: { email: ALICE, targetId: bob.id } }, aliceToken);
eq('request → 200', r.statusCode, 200);
r = await call('people/list', { body: { email: BOB } }, bobToken);
const fromAlice = (r.body?.people || []).find(p => p.id === alice.id);
eq('Bob sees an incoming request', fromAlice?.request_direction, 'received');
r = await call('people/respond', { body: { email: BOB, fromProfileId: alice.id, action: 'accept' } }, bobToken);
eq('accept → 200', r.statusCode, 200);
r = await call('people/list', { body: { email: ALICE } }, aliceToken);
eq('Alice now connected', (r.body?.people || []).find(p => p.id === bob.id)?.connection_status, 'accepted');
r = await call('settings/friends/list', { body: { email: ALICE } }, aliceToken);
eq('settings/friends/list → 200', r.statusCode, 200);
check('friends list has Bob', (r.body?.friends || []).some(f => f.email === BOB || f.handle === bob.handle), JSON.stringify(r.body).slice(0, 200));

// ── messages ────────────────────────────────────────────────────────
section('messages');
r = await call('network/messages/get-or-create', { body: { email: ALICE, toEmail: BOB } }, aliceToken);
eq('get-or-create → 200', r.statusCode, 200);
const convId = r.body?.conversation?.id;
check('conversation id', typeof convId === 'number', JSON.stringify(r.body).slice(0, 200));
r = await call('network/messages/send', { body: { email: ALICE, toEmail: BOB, content: 'Selftest hello' } }, aliceToken);
eq('send → 201', r.statusCode, 201);
r = await call('network/messages/list', { method: 'GET', query: { email: BOB, conversationId: String(convId) } }, bobToken);
eq('list → 200', r.statusCode, 200);
eq('Bob sees one message', r.body?.messages?.length, 1);
eq('and it is not marked mine', r.body?.messages?.[0]?.is_mine, false);
r = await call('network/messages/conversations', { method: 'GET', query: { email: BOB } }, bobToken);
check('conversations lists Alice', (r.body?.conversations || []).some(c => c.other_email === ALICE));
r = await call('network/messages/poll', { method: 'GET', query: { email: BOB, since: new Date(Date.now() - 60e3).toISOString() } }, bobToken);
eq('poll → 200', r.statusCode, 200);
r = await call('network/messages/friends', { method: 'GET', query: { email: ALICE } }, aliceToken);
check('friends picker lists Bob', (r.body?.friends || []).some(f => f.email === BOB));

// ── entity pages ────────────────────────────────────────────────────
section('entity pages');
r = await call('entity/create', { body: { email: ALICE, type: 'movie', title: 'Selftest Picture', year: 2026, genre: ['Drama'] } }, aliceToken);
eq('create → 201', r.statusCode, 201);
const entity = r.body?.entity;
check('entity has a slug', typeof entity?.slug === 'string');
r = await call('entity/get', { body: { slug: entity?.slug } });
eq('get → 200', r.statusCode, 200);
eq('get carries the creator', r.body?.entity?.creator_handle, alice.handle);
r = await call('entity/view', { body: { slug: entity?.slug } });
eq('view → 200', r.statusCode, 200);
r = await call('entity/update', { body: { email: BOB, id: entity?.id, title: 'Vandalized' } }, bobToken);
check("someone else can't update", r.statusCode === 403 || r.statusCode === 404, `got ${r.statusCode}`);
r = await call('entity/update', { body: { email: ALICE, id: entity?.id, title: 'Selftest Picture II' } }, aliceToken);
eq('owner update → 200', r.statusCode, 200);
r = await call('entity/my-pages', { body: { email: ALICE } }, aliceToken);
check('my-pages lists it', (Array.isArray(r.body) ? r.body : []).some(e => e.id === entity?.id));
r = await call('entity/search', { body: { query: 'Selftest Picture' } });
check('search finds it', (Array.isArray(r.body) ? r.body : []).some(e => e.id === entity?.id), JSON.stringify(r.body).slice(0, 120));
r = await call('entity/delete', { body: { email: ALICE, id: entity?.id } }, aliceToken);
eq('delete → 200', r.statusCode, 200);

// ── company pages ───────────────────────────────────────────────────
section('company pages');
r = await call('entity/create', { body: { email: ALICE, type: 'company', title: 'Side Door Co' } }, aliceToken);
eq('generic create refuses companies', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: '  ' } }, aliceToken);
eq('name is required', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: 'X', category: 'bakery' } }, aliceToken);
eq('unknown category → 400', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: 'X', foundedYear: 3000 } }, aliceToken);
eq('future founding year → 400', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: 'X', foundedMonth: 4 } }, aliceToken);
eq('month without a year → 400', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: 'X', website: 'javascript:alert(1)' } }, aliceToken);
eq('non-http website → 400', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, name: 'X', contactEmail: 'not-an-email' } }, aliceToken);
eq('bad contact email → 400', r.statusCode, 400);

const [someMovie] = await sql`SELECT id FROM entities WHERE type = 'movie' ORDER BY id LIMIT 1`;
const coName = `Selftest Pictures ${DOMAIN}`;
r = await call('entity/company-save', { body: {
  email: ALICE, name: coName, tagline: 'Stories worth the wait', about: 'We make films.',
  category: 'production', organizationType: 'private', companySize: '11-50',
  foundedYear: 2012, foundedMonth: 3, headquarters: 'Los Angeles, CA',
  website: 'selftest.example', contactEmail: 'Hello@Selftest.Example', phone: '+1 (310) 555-0100',
  specialties: ['Features', 'features', 'Documentary'],
  socialLinks: { instagram: 'instagram.com/selftest', myspace: 'https://myspace.com/x' },
  notableEntityIds: [someMovie.id, 999999999],
} }, aliceToken);
eq('create → 201', r.statusCode, 201);
const co = r.body?.entity;
eq('owned by the caller', co?.created_by, alice.id);
check('readable slug', /^selftest-pictures-/.test(co?.slug || ''), co?.slug);
eq('founded year on the entity', co?.year, 2012);

r = await call('entity/get', { body: { slug: co?.slug } });
eq('get → 200', r.statusCode, 200);
const d = r.body?.company;
eq('category saved', d?.category, 'production');
eq('founded month saved', d?.founded_month, 3);
eq('website gets a scheme', d?.website, 'https://selftest.example/');
eq('contact email lowercased', d?.contact_email, 'hello@selftest.example');
eq('specialties de-duplicated', JSON.stringify(d?.specialties), JSON.stringify(['Features', 'Documentary']));
eq('unknown social keys dropped', JSON.stringify(Object.keys(d?.social_links || {})), JSON.stringify(['instagram']));
eq('notable work keeps only real titles', JSON.stringify(r.body?.notableWork?.map(w => w.id)), JSON.stringify([someMovie.id]));
eq('owner carried', r.body?.owner?.handle, alice.handle);
eq('anonymous viewer cannot edit', r.body?.canEdit, false);
check('creator email is not exposed', !('creator_email' in (r.body?.entity || {})));
r = await call('entity/get', { body: { slug: co?.slug } }, bobToken);
eq('another member cannot edit', r.body?.canEdit, false);
r = await call('entity/get', { body: { slug: co?.slug } }, aliceToken);
eq('the owner can edit', r.body?.canEdit, true);

r = await call('entity/company-save', { body: { email: BOB, id: co?.id, name: 'Hijacked' } }, bobToken);
eq("someone else can't update", r.statusCode, 403);
r = await call('entity/update', { body: { email: ALICE, id: co?.id, title: 'Side Door' } }, aliceToken);
eq('generic update refuses companies', r.statusCode, 400);
r = await call('entity/company-save', { body: { email: ALICE, id: co?.id, name: `${coName} II`, category: 'studio', foundedYear: 2012 } }, aliceToken);
eq('owner update → 200', r.statusCode, 200);
r = await call('entity/get', { body: { slug: co?.slug } });
eq('slug is stable across renames', r.body?.entity?.title, `${coName} II`);
eq('update replaces the form fields', r.body?.company?.tagline, null);

r = await call('entity/company-save', { body: { email: BOB, name: coName } }, bobToken);
check('same name gets its own slug', r.statusCode === 201 && r.body?.entity?.slug !== co?.slug && r.body?.entity?.slug?.startsWith(co?.slug), r.body?.entity?.slug);
const bobCo = r.body?.entity;

r = await call('profile/experience/save', { body: { email: BOB, company: 'whatever', jobTitle: 'Head of Development', startDate: '2021-06-01', companyEntityId: co?.id } }, bobToken);
check('experience links to the page', r.statusCode === 200 && r.body?.experience?.company_entity_id === co?.id, JSON.stringify(r.body));
eq('linked experience takes the page name', r.body?.experience?.company, `${coName} II`);
r = await call('profile/experience/save', { body: { email: BOB, company: 'x', jobTitle: 'y', companyEntityId: someMovie.id } }, bobToken);
eq('linking to a non-company → 400', r.statusCode, 400);
r = await call('entity/get', { body: { slug: co?.slug } });
eq('the page lists its people', r.body?.people?.[0]?.handle, bob.handle);
eq('as current', r.body?.people?.[0]?.is_current, true);
r = await call('profile/get', { body: { handle: bob.handle } });
eq('profile experience carries the company slug', r.body?.experience?.find(x => x.company_entity_id === co?.id)?.company_slug, co?.slug);

let refused = false;
try { await sql`INSERT INTO entities (type, title, slug) VALUES ('company', 'Ownerless', ${`ownerless-${Date.now()}`})`; }
catch { refused = true; }
check('the database refuses an ownerless company', refused);

const CAROL = at('carol');
await ensureProfile(sql, CAROL);
const carolToken = await createSession(sql, CAROL);
r = await call('entity/company-save', { body: { email: CAROL, name: 'Selftest Carol Co' } }, carolToken);
const carolCoId = r.body?.entity?.id;
await sql`DELETE FROM user_sessions WHERE email = ${CAROL}`;
await sql`DELETE FROM profiles WHERE email = ${CAROL}`;
const [gone] = await sql`SELECT id FROM entities WHERE id = ${carolCoId ?? 0}`;
check("a company goes with its owner's profile", carolCoId && !gone);

r = await call('entity/delete', { body: { email: BOB, id: bobCo?.id } }, bobToken);
eq('owner deletes → 200', r.statusCode, 200);
const [detailsGone] = await sql`SELECT entity_id FROM company_details WHERE entity_id = ${bobCo?.id ?? 0}`;
check('details go with the page', !detailsGone);

// ── settings ────────────────────────────────────────────────────────
section('settings');
r = await call('settings/account/get', { body: { email: ALICE } }, aliceToken);
eq('account/get → 200', r.statusCode, 200);
eq('connectionCount counts Bob', r.body?.connectionCount, 1);
r = await call('settings/network/get', { body: { email: ALICE } }, aliceToken);
eq('network/get → 200', r.statusCode, 200);
r = await call('settings/network/update', { body: { email: ALICE, milestonesEnabled: false } }, aliceToken);
eq('network/update → 200', r.statusCode, 200);
r = await call('settings/pages/add', { body: { email: ALICE, pageName: 'Selftest page', platform: 'youtube', pageUrl: 'https://example.test/p' } }, aliceToken);
eq('pages/add → 201', r.statusCode, 201);
const pageId = r.body?.id;
r = await call('settings/pages/list', { body: { email: ALICE } }, aliceToken);
check('pages/list shows it', JSON.stringify(r.body).includes('Selftest page'));
r = await call('settings/pages/update', { body: { email: ALICE, id: pageId, aiWatching: true, privacy: 'private' } }, aliceToken);
eq('pages/update → 200', r.statusCode, 200);
r = await call('settings/pages/delete', { body: { email: ALICE, id: pageId } }, aliceToken);
eq('pages/delete → 200', r.statusCode, 200);
r = await call('settings/codes/list', { body: { email: ALICE } }, aliceToken);
eq('codes/list → 200', r.statusCode, 200);

// ── Creative OS ─────────────────────────────────────────────────────
section('Creative OS — workspace, folders, sharing');
r = await call('vault/create-workspace', { body: { ownerEmail: ALICE, title: 'Selftest Treatment', projectType: 'treatment', privacy: 'private', status: 'draft' } }, aliceToken);
eq('create-workspace → 201', r.statusCode, 201);
const slug = r.body?.slug;
check('workspace slug', typeof slug === 'string');
r = await call('vault/save', { body: { slug, ownerEmail: ALICE, title: 'Selftest Treatment', status: 'in_review', workspaceContent: 'INT. DINER — NIGHT\n\nA selftest.', workspaceContext: 'Tone notes' } }, aliceToken);
eq('save → 200', r.statusCode, 200);
r = await call('vault/get', { body: { slug, email: ALICE } }, aliceToken);
eq('get → 200', r.statusCode, 200);
eq('get returns the saved content', r.body?.workspace_content, 'INT. DINER — NIGHT\n\nA selftest.');
eq('owner role', r.body?.role, 'owner');
r = await call('vault/get', { body: { slug, email: BOB } }, bobToken);
check("unshared → Bob can't open it", r.statusCode === 403 || r.statusCode === 404, `got ${r.statusCode}`);
r = await call('vault/share', { body: { slug, ownerEmail: ALICE, sharedWith: BOB, permission: 'view' } }, aliceToken);
eq('share → 200', r.statusCode, 200);
r = await call('vault/get', { body: { slug, email: BOB } }, bobToken);
eq('shared → Bob opens it as viewer', r.body?.role, 'viewer');
eq('a viewer can read the content on screen', r.body?.workspace_content, 'INT. DINER — NIGHT\n\nA selftest.');
r = await call('vault/attachments/download', { body: { slug, email: BOB, id: 1 } }, bobToken);
check('a viewer still cannot download attachments', r.statusCode === 403 || r.statusCode === 404, `got ${r.statusCode}`);
r = await call('vault/list', { body: { email: BOB } }, bobToken);
check('Bob sees it under shared', (r.body?.shared || []).some(s => s.slug === slug));
r = await call('vault/preview', { body: { slug, email: BOB } }, bobToken);
eq('preview → 200', r.statusCode, 200);
r = await call('vault/unshare', { body: { slug, ownerEmail: ALICE, sharedWith: BOB } }, aliceToken);
eq('unshare → 200', r.statusCode, 200);
r = await call('vault/folders/create', { body: { ownerEmail: ALICE, name: 'Selftest Folder' } }, aliceToken);
eq('folders/create → 201', r.statusCode, 201);
const folderSlug = r.body?.slug;
r = await call('vault/move', { body: { ownerEmail: ALICE, slug, folderSlug } }, aliceToken);
eq('move → 200', r.statusCode, 200);
r = await call('vault/folders/rename', { body: { ownerEmail: ALICE, slug: folderSlug, name: 'Selftest Folder 2' } }, aliceToken);
eq('folders/rename → 200', r.statusCode, 200);
r = await call('vault/list', { body: { email: ALICE } }, aliceToken);
eq('list has the folder', (r.body?.folders || []).find(f => f.slug === folderSlug)?.name, 'Selftest Folder 2');
eq('folder counts the item', (r.body?.folders || []).find(f => f.slug === folderSlug)?.item_count, 1);
r = await call('vault/attachments/list', { body: { slug, email: ALICE } }, aliceToken);
eq('attachments/list → 200', r.statusCode, 200);
r = await call('vault/timestamp-status', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('timestamp-status → 200', r.statusCode, 200);
r = await call('vault/analysis/status', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('analysis/status → 200', r.statusCode, 200);

section('Creative OS — uploaded file (bytes already in Blob storage)');
r = await call('vault/upload', { body: { ownerEmail: ALICE, title: 'Selftest Upload', fileName: 'draft.pdf', fileType: 'pdf', fileSize: 1234, blobUrl: 'https://evil.example/not-blob.pdf' } }, aliceToken);
eq('a non-Blob URL is refused', r.statusCode, 400);
r = await call('vault/upload', { body: { ownerEmail: ALICE, title: 'Selftest Upload', fileName: 'draft.pdf', fileType: 'pdf', fileSize: 1234, blobUrl: 'https://abc123.private.blob.vercel-storage.com/vault/uploads/draft-x.pdf' } }, aliceToken);
eq('upload with blobUrl → 201', r.statusCode, 201);
const uploadSlug = r.body?.slug;
r = await call('vault/get', { body: { slug: uploadSlug, email: ALICE } }, aliceToken);
eq('uploaded item opens', r.statusCode, 200);
eq('item kind is upload', r.body?.item_kind, 'upload');
r = await call('vault/share', { body: { slug: uploadSlug, ownerEmail: ALICE, sharedWith: BOB, permission: 'view' } }, aliceToken);
eq('share upload with view permission → 200', r.statusCode, 200);
r = await call('vault/get', { body: { slug: uploadSlug, email: BOB } }, bobToken);
check('a viewer receives the file location to render it', typeof r.body?.blob_url === 'string', JSON.stringify(r.body).slice(0, 120));
r = await call('vault/get', { body: { slug: uploadSlug, email: 'stranger@example.test' } });
check('a stranger gets nothing', r.statusCode >= 400, `got ${r.statusCode}`);
r = await call('vault/delete', { body: { slug: uploadSlug, ownerEmail: ALICE } }, aliceToken);
eq('uploaded item deletes', r.statusCode, 200);

section('Creative OS — trackable links, viewer sessions, versions');
r = await call('vault/tracking/create-link', { body: { slug, ownerEmail: ALICE, label: 'Selftest link', requireEmail: true, ndaText: 'Keep it quiet.' } }, aliceToken);
eq('create-link → 200', r.statusCode, 200);
const link = r.body?.link;
check('link token', typeof link?.token === 'string');
r = await call('vault/tracking/list-links', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('list-links shows it', r.body?.links?.length, 1);
r = await call('vault/tracking/resolve', { body: { token: link?.token } });
eq('resolve (public) → 200', r.statusCode, 200);
eq('resolve carries the title', r.body?.title, 'Selftest Treatment');
eq('resolve requires email', r.body?.requireEmail, true);
r = await call('vault/tracking/unlock', { body: { token: link?.token, email: 'reader@example.test', name: 'Reader', signatureName: 'Reader One' } });
eq('unlock with NDA signature → 200', r.statusCode, 200);
check('unlock returns the content', typeof r.body?.content === 'string' && r.body.content.includes('DINER'), JSON.stringify(r.body).slice(0, 160));
const sessionKey = r.body?.sessionKey;
if (sessionKey) {
  r = await call('vault/tracking/beat', { body: { sessionKey, durationSeconds: 30, maxScrollPct: 50, pagesViewed: 1, totalPages: 1 } });
  eq('beat → 200', r.statusCode, 200);
  r = await call('vault/tracking/note', { body: { sessionKey, slug, content: 'Selftest viewer note' } });
  check('viewer note → 2xx', r.statusCode >= 200 && r.statusCode < 300, JSON.stringify(r.body));
}
r = await call('vault/tracking/summary', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('summary → 200', r.statusCode, 200);
check('summary has the viewer session', (r.body?.sessions || []).length >= 1);
r = await call('vault/tracking/signatures', { body: { slug, ownerEmail: ALICE } }, aliceToken);
check('signature recorded', (r.body?.signatures || []).some(s => s.signer_name === 'Reader One'), JSON.stringify(r.body).slice(0, 160));
r = await call('vault/tracking/versions', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('versions → 200', r.statusCode, 200);
r = await call('vault/tracking/update-link', { body: { slug, ownerEmail: ALICE, linkId: link?.id, id: link?.id, label: 'Renamed link' } }, aliceToken);
check('update-link → 200', r.statusCode === 200, JSON.stringify(r.body).slice(0, 120));
r = await call('vault/tracking/deactivate-all', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('deactivate-all → 200', r.statusCode, 200);
r = await call('vault/tracking/resolve', { body: { token: link?.token } });
check('deactivated link no longer resolves', r.statusCode >= 400, `got ${r.statusCode}`);

section('Creative OS — delete');
r = await call('vault/delete', { body: { slug, ownerEmail: BOB } }, bobToken);
check("someone else can't delete", r.statusCode >= 400, `got ${r.statusCode}`);
r = await call('vault/delete', { body: { slug, ownerEmail: ALICE } }, aliceToken);
eq('owner delete → 200', r.statusCode, 200);
r = await call('vault/folders/delete', { body: { ownerEmail: ALICE, slug: folderSlug } }, aliceToken);
eq('folders/delete → 200', r.statusCode, 200);

} catch (err) {
  fail++;
  console.log(`  FAIL the run threw — ${err.stack || err}`);
}

// ── cleanup ─────────────────────────────────────────────────────────
section('cleanup');
const suffix = `%@${DOMAIN}`;
const ids = (await sql`SELECT id FROM profiles WHERE email ILIKE ${suffix}`).map(p => p.id);
const scriptIds = (await sql`SELECT id FROM vault_scripts WHERE owner_email ILIKE ${suffix}`).map(s => s.id);
await sql`DELETE FROM post_likes WHERE profile_id = ANY(${ids}::int[]) OR post_id IN (SELECT id FROM posts WHERE profile_id = ANY(${ids}::int[]))`;
await sql`DELETE FROM posts WHERE profile_id = ANY(${ids}::int[])`;
await sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE participant_a ILIKE ${suffix} OR participant_b ILIKE ${suffix})`;
await sql`DELETE FROM conversations WHERE participant_a ILIKE ${suffix} OR participant_b ILIKE ${suffix}`;
await sql`DELETE FROM connections WHERE from_profile = ANY(${ids}::int[]) OR to_profile = ANY(${ids}::int[])`;
await sql`DELETE FROM credits WHERE profile_id = ANY(${ids}::int[])`;
await sql`DELETE FROM experience WHERE profile_id = ANY(${ids}::int[])`;
await sql`DELETE FROM awards WHERE profile_id = ANY(${ids}::int[])`;
await sql`DELETE FROM entity_views WHERE entity_id IN (SELECT id FROM entities WHERE created_by = ANY(${ids}::int[]))`;
await sql`DELETE FROM entities WHERE created_by = ANY(${ids}::int[])`;
for (const t of ['vault_link_signatures', 'vault_view_notes', 'vault_view_sessions', 'vault_share_links', 'vault_script_versions', 'vault_shares']) {
  await sql.query(`DELETE FROM ${t} WHERE script_id = ANY($1::int[])`, [scriptIds]);
}
await sql`DELETE FROM vault_scripts WHERE owner_email ILIKE ${suffix}`;
await sql`DELETE FROM vault_folders WHERE owner_email ILIKE ${suffix}`;
await sql`DELETE FROM user_pages WHERE owner_email ILIKE ${suffix}`;
await sql`DELETE FROM user_sessions WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM user_settings WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM profiles WHERE email ILIKE ${suffix}`;
const [{ c: leftover }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE email ILIKE ${'%hsi-selftest.invalid'}`;
eq('no self-test rows remain', leftover, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
