/**
 * End-to-end evals for the DocSend feature set.
 * Drives the real API handlers in-process against the live Neon DB,
 * using a throwaway project owned by a test account, then cleans up.
 *
 * Run: npx tsx scripts/eval-docsend.mts
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(resolvePath(root, file), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (val && !process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* file absent */ }
}
loadEnv('.env.local');
loadEnv('.env');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local/.env — cannot run evals.');
  process.exit(1);
}
// Never send real notification emails from the eval run.
delete process.env.RESEND_API_KEY;

const createWorkspace = (await import('../api/vault/_create-workspace.js')).default;
const save = (await import('../api/vault/_save.js')).default;
const del = (await import('../api/vault/_delete.js')).default;
const createLink = (await import('../api/vault/tracking/_create-link.js')).default;
const updateLink = (await import('../api/vault/tracking/_update-link.js')).default;
const listLinks = (await import('../api/vault/tracking/_list-links.js')).default;
const resolve = (await import('../api/vault/tracking/_resolve.js')).default;
const unlock = (await import('../api/vault/tracking/_unlock.js')).default;
const deactivateAll = (await import('../api/vault/tracking/_deactivate-all.js')).default;
const signatures = (await import('../api/vault/tracking/_signatures.js')).default;
const versions = (await import('../api/vault/tracking/_versions.js')).default;
const beat = (await import('../api/vault/tracking/_beat.js')).default;
const summary = (await import('../api/vault/tracking/_summary.js')).default;
const note = (await import('../api/vault/tracking/_note.js')).default;
const start = (await import('../api/vault/tracking/_start.js')).default;
const verifyViewer = (await import('../api/vault/tracking/_verify-viewer.js')).default;
const downloadEvent = (await import('../api/vault/tracking/_download-event.js')).default;
const vaultRouter = (await import('../api/vault/[...path].js')).default;
const { createSession } = await import('../api/_session.js');
const { hashViewerCode } = await import('../api/vault/tracking/_gates.js');
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL!);

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) { res.statusCode = c; return res; },
    json(b: any) { res.body = b; return res; },
    send(b: any) { res.body = b; return res; },
    setHeader() { return res; },
    end() { return res; },
  };
  return res;
}

async function call(handler: unknown, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = makeRes();
  await (handler as Handler)(
    { method: 'POST', body, headers: { 'user-agent': 'hsi-eval-harness', 'x-forwarded-for': '203.0.113.7', ...headers }, query: {}, cookies: {} },
    res,
  );
  return { status: res.statusCode, body: res.body };
}

// drives the real catch-all router (including its session-auth layer)
async function callRouter(action: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = makeRes();
  await (vaultRouter as Handler)(
    {
      method: 'POST', body,
      headers: { 'user-agent': 'hsi-eval-harness', 'x-forwarded-for': '203.0.113.7', ...headers },
      query: { path: action.split('/') }, cookies: {},
    },
    res,
  );
  return { status: res.statusCode, body: res.body };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const OWNER = 'eval-owner@hsi-evals.test';
const CONTENT_V1 = 'FADE IN:\n\nEXT. EVAL RANCH - DAY\n\nA test screenplay used by the DocSend eval harness.\n\n' + 'The quick brown fox jumps over the lazy dog. '.repeat(40);
const CONTENT_V2 = CONTENT_V1 + '\n\nINT. REVISED SCENE - NIGHT\n\nVersion two adds a whole new scene.';
const NDA_TEXT = 'By viewing this material you agree to keep it strictly confidential and not to share, copy, or distribute it. Eval harness agreement text.';

let slug = '';

async function main() {
  console.log('\n== Setup ==');
  const ownerToken = await createSession(sql, OWNER);
  const AUTH = { authorization: `Bearer ${ownerToken}` };
  const ws = await call(createWorkspace, { ownerEmail: OWNER, title: 'DocSend Eval Project', projectType: 'feature' });
  check('create workspace', ws.status === 201 && !!ws.body?.slug, JSON.stringify(ws.body));
  slug = ws.body.slug;
  const s1 = await call(save, { slug, ownerEmail: OWNER, workspaceContent: CONTENT_V1 });
  check('save initial content', s1.status === 200, JSON.stringify(s1.body));

  console.log('\n== Phase 1: links, resolve/unlock split, access gates ==');
  const cl = await call(createLink, { slug, ownerEmail: OWNER, label: 'Eval link A' });
  check('create link', cl.status === 201 || cl.status === 200, JSON.stringify(cl.body));
  const link = cl.body.link;
  const token = link.token;
  check('new link defaults (email gate, watermark, notify on, no passcode)',
    link.require_email === true && link.watermark_enabled === true && link.notify_on_view === true && link.has_passcode === false,
    JSON.stringify(link));

  const r1 = await call(resolve, { token });
  check('resolve returns metadata', r1.status === 200 && r1.body.title === 'DocSend Eval Project' && r1.body.requireEmail === true);
  check('SECURITY: resolve leaks no content', !('content' in (r1.body || {})) && !JSON.stringify(r1.body).includes('EVAL RANCH'));
  check('SECURITY: resolve leaks no passcode hash / allowlist',
    !('passcode_hash' in (r1.body || {})) && !('allowed_emails' in (r1.body || {})) && typeof r1.body.hasPasscode === 'boolean');

  const u0 = await call(unlock, { token });
  check('unlock without email rejected (email gate)', u0.status === 400);
  const u1 = await call(unlock, { token, email: 'viewer1@example.com', name: 'Viewer One' },
    { 'x-vercel-ip-country': 'US', 'x-vercel-ip-city': 'Los%20Angeles', 'x-vercel-ip-country-region': 'CA' });
  check('unlock with email returns content', u1.status === 200 && u1.body.content === CONTENT_V1);
  check('unlock returns sessionKey', typeof u1.body.sessionKey === 'string' && u1.body.sessionKey.length > 10);
  check('watermark text includes viewer email', typeof u1.body.watermarkText === 'string' && u1.body.watermarkText.includes('viewer1@example.com'));
  check('download disabled by default', u1.body.allowDownload === false);
  const sessionKey1 = u1.body.sessionKey;

  const ll1 = await call(listLinks, { slug, ownerEmail: OWNER });
  const linkAfter = ll1.body?.links?.find((l: any) => l.id === link.id);
  check('visit_count incremented', linkAfter?.visit_count === 1, `visit_count=${linkAfter?.visit_count}`);

  // Passcode
  const upPass = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, passcode: 'secret-eval-123' });
  check('set passcode', upPass.status === 200 && upPass.body.link.has_passcode === true);
  const r2 = await call(resolve, { token });
  check('resolve advertises passcode gate', r2.body?.hasPasscode === true);
  const uNoPass = await call(unlock, { token, email: 'viewer1@example.com' });
  check('unlock without passcode rejected', uNoPass.status === 401);
  const uBadPass = await call(unlock, { token, email: 'viewer1@example.com', passcode: 'wrong' });
  check('unlock with wrong passcode rejected', uBadPass.status === 401);
  const uGoodPass = await call(unlock, { token, email: 'viewer1@example.com', passcode: 'secret-eval-123' });
  check('unlock with correct passcode', uGoodPass.status === 200 && uGoodPass.body.content === CONTENT_V1);
  const upPassClear = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, passcode: '' });
  check('clear passcode', upPassClear.status === 200 && upPassClear.body.link.has_passcode === false);

  // Allowlist
  const upAllow = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, allowedEmails: ['vip@studio.com', '@a24.com'] });
  check('set allowlist', upAllow.status === 200 && (upAllow.body.link.allowed_emails || []).length === 2);
  const uStranger = await call(unlock, { token, email: 'stranger@gmail.com' });
  check('non-allowlisted email rejected', uStranger.status === 403);
  const uVip = await call(unlock, { token, email: 'VIP@studio.com' });
  check('allowlisted exact email admitted (case-insensitive)', uVip.status === 200);
  const uDomain = await call(unlock, { token, email: 'jane@a24.com' });
  check('allowlisted domain admitted', uDomain.status === 200);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, allowedEmails: [] });

  // Expiry
  const past = new Date(Date.now() - 3_600_000).toISOString();
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, expiresAt: past });
  const rExp = await call(resolve, { token });
  check('expired link blocked at resolve', rExp.status === 410);
  const uExp = await call(unlock, { token, email: 'viewer1@example.com' });
  check('expired link blocked at unlock', uExp.status === 410);
  const upExpClear = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, expiresAt: '' });
  check('clear expiry restores access', upExpClear.status === 200 && (await call(resolve, { token })).status === 200);

  // Visit cap
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, maxVisits: 1 });
  const uCap = await call(unlock, { token, email: 'viewer1@example.com' });
  check('visit cap enforced', uCap.status === 410, `status=${uCap.status}`);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, maxVisits: null });
  check('clear visit cap restores access', (await call(unlock, { token, email: 'viewer1@example.com' })).status === 200);

  // Owner preview — only honored when a valid session proves the claimed email
  const uOwnerSpoof = await call(unlock, { token, email: OWNER });
  check('SECURITY: owner email without session is treated as a normal viewer (counted + tracked)',
    uOwnerSpoof.status === 200 && typeof uOwnerSpoof.body.sessionKey === 'string',
    `status=${uOwnerSpoof.status} sessionKey=${uOwnerSpoof.body?.sessionKey}`);
  const llBefore = await call(listLinks, { slug, ownerEmail: OWNER });
  const countBefore = llBefore.body.links.find((l: any) => l.id === link.id).visit_count;
  const uOwner = await call(unlock, { token, email: OWNER }, AUTH);
  const llAfter = await call(listLinks, { slug, ownerEmail: OWNER });
  const countAfter = llAfter.body.links.find((l: any) => l.id === link.id).visit_count;
  check('owner preview with session serves content without counting a visit',
    uOwner.status === 200 && uOwner.body.sessionKey === null && countAfter === countBefore,
    `before=${countBefore} after=${countAfter}`);

  // Deactivate / reactivate / deactivate-all
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, isActive: false });
  check('deactivated link blocked', (await call(resolve, { token })).status === 410);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, isActive: true });
  const cl2 = await call(createLink, { slug, ownerEmail: OWNER, label: 'Eval link B' });
  const dAll = await call(deactivateAll, { slug, ownerEmail: OWNER });
  check('deactivate-all kills every link', dAll.status === 200 && dAll.body.deactivated >= 2, JSON.stringify(dAll.body));
  const llDead = await call(listLinks, { slug, ownerEmail: OWNER });
  check('all links inactive after kill switch', llDead.body.links.every((l: any) => l.is_active === false));
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, isActive: true });

  // Bad token
  check('unknown token 404', (await call(unlock, { token: 'no-such-token', email: 'x@y.com' })).status === 404);

  console.log('\n== Phase 2: engagement telemetry + geo ==');
  const b1 = await call(beat, {
    sessionKey: sessionKey1, durationSeconds: 42, maxScrollPct: 80,
    pagesViewed: 3, totalPages: 5, pageTimes: { '0': 10, '1': 20, '2': 12 },
  });
  check('beat accepted', b1.status === 200);
  const sum1 = await call(summary, { slug, ownerEmail: OWNER });
  const sess1 = sum1.body?.sessions?.find((s: any) => s.session_key === sessionKey1);
  check('summary reflects duration/scroll/pages', sess1?.duration_seconds === 42 && sess1?.max_scroll_pct === 80 && sess1?.pages_viewed === 3);
  check('summary returns per-page times', sess1?.page_times?.['1'] === 20, JSON.stringify(sess1?.page_times));
  check('geo captured from Vercel headers', sess1?.ip_country === 'US' && sess1?.ip_city === 'Los Angeles' && sess1?.ip_region === 'CA',
    `${sess1?.ip_city}, ${sess1?.ip_region}, ${sess1?.ip_country}`);
  check('session stamped with version 1', sess1?.version_number === 1, `v=${sess1?.version_number}`);

  console.log('\n== Phase 3: notification wiring ==');
  const upNotify = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, notifyOnView: false });
  check('notify toggle persists off', upNotify.body?.link?.notify_on_view === false);
  const upNotify2 = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, notifyOnView: true });
  check('notify toggle persists on', upNotify2.body?.link?.notify_on_view === true);
  check('unlock succeeds with notifications on and no RESEND key (send skipped, no crash)',
    (await call(unlock, { token, email: 'viewer2@example.com' })).status === 200);

  console.log('\n== Phase 4: NDA / timestamped signatures ==');
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, ndaText: NDA_TEXT });
  const rNda = await call(resolve, { token });
  check('resolve returns NDA text', rNda.body?.ndaText === NDA_TEXT);
  const uNoSig = await call(unlock, { token, email: 'signer@example.com' });
  check('unlock without signature rejected', uNoSig.status === 400);
  const uSig = await call(unlock, { token, email: 'signer@example.com', name: 'Jane Signer', signatureName: 'Jane Q. Signer' });
  check('unlock with signature succeeds', uSig.status === 200);
  const sigs = await call(signatures, { slug, ownerEmail: OWNER });
  const sig = sigs.body?.signatures?.find((s: any) => s.signer_name === 'Jane Q. Signer');
  check('signature recorded with name + email', !!sig && sig.signer_email === 'signer@example.com');
  check('signature hash matches sha256 of agreement',
    sig?.agreement_hash === createHash('sha256').update(NDA_TEXT, 'utf8').digest('hex'));
  check('signature has timestamp + IP', !!sig?.signed_at && sig?.ip_address === '203.0.113.7', JSON.stringify({ at: sig?.signed_at, ip: sig?.ip_address }));
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, ndaText: '' });
  check('clearing NDA removes gate', (await call(unlock, { token, email: 'viewer3@example.com' })).status === 200);

  console.log('\n== Phase 5: watermarking + download control ==');
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, watermarkEnabled: false });
  const uNoWm = await call(unlock, { token, email: 'viewer1@example.com' });
  check('watermark off → no watermark text', uNoWm.status === 200 && uNoWm.body.watermarkText === null);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, watermarkEnabled: true, allowDownload: true });
  const uDl = await call(unlock, { token, email: 'viewer1@example.com' });
  check('watermark back on + download allowed', uDl.body?.watermarkText?.includes('viewer1@example.com') && uDl.body?.allowDownload === true);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, allowDownload: false });

  console.log('\n== Phase 6: versioning behind stable links ==');
  const v0 = await call(versions, { slug, ownerEmail: OWNER });
  check('fresh project is version 1 with no snapshots', v0.body?.currentVersion === 1 && (v0.body?.versions || []).length === 0,
    JSON.stringify(v0.body));
  const s2 = await call(save, { slug, ownerEmail: OWNER, workspaceContent: CONTENT_V2 });
  check('save revised content', s2.status === 200);
  const v1 = await call(versions, { slug, ownerEmail: OWNER });
  const verList = v1.body?.versions || [];
  check('edit bumps to version 2', v1.body?.currentVersion === 2, `current=${v1.body?.currentVersion}`);
  check('v1 snapshot backfilled + v2 recorded',
    verList.some((v: any) => v.version_number === 1 && v.note === 'Original version') &&
    verList.some((v: any) => v.version_number === 2),
    JSON.stringify(verList.map((v: any) => [v.version_number, v.note])));
  const uV2 = await call(unlock, { token, email: 'viewer4@example.com' });
  check('same token serves latest content', uV2.status === 200 && uV2.body.content === CONTENT_V2);
  const sum2 = await call(summary, { slug, ownerEmail: OWNER });
  const newSess = sum2.body?.sessions?.find((s: any) => s.viewer_email === 'viewer4@example.com');
  const oldSess = sum2.body?.sessions?.find((s: any) => s.session_key === sessionKey1);
  check('new session stamped v2, old session still v1', newSess?.version_number === 2 && oldSess?.version_number === 1,
    `new=${newSess?.version_number} old=${oldSess?.version_number}`);

  console.log('\n== Notes round-trip ==');
  const vNote = await call(note, { sessionKey: sessionKey1, content: 'Loved page two — eval viewer note' });
  check('viewer note saved', vNote.status === 200);
  const oNoteSpoof = await call(note, { slug, ownerEmail: OWNER, targetEmail: 'viewer1@example.com', content: 'spoofed owner note' });
  check('SECURITY: owner note without session rejected', oNoteSpoof.status === 401);
  const oNote = await call(note, { slug, ownerEmail: OWNER, targetEmail: 'viewer1@example.com', content: 'Follow up Friday — eval owner note' }, AUTH);
  check('owner note saved', oNote.status === 200);
  const sum3 = await call(summary, { slug, ownerEmail: OWNER });
  check('summary returns both notes',
    sum3.body?.notes?.some((n: any) => n.kind === 'viewer' && n.content.includes('eval viewer note')) &&
    sum3.body?.notes?.some((n: any) => n.kind === 'owner' && n.content.includes('eval owner note')));

  console.log('\n== Session auth (router enforcement) ==');
  const rNoAuth = await callRouter('tracking/list-links', { slug, ownerEmail: OWNER });
  check('SECURITY: owner route without session token rejected', rNoAuth.status === 401 && rNoAuth.body?.error === 'invalid_session',
    JSON.stringify(rNoAuth));
  const attackerToken = await createSession(sql, 'attacker@evil.test');
  const rWrongUser = await callRouter('tracking/list-links', { slug, ownerEmail: OWNER },
    { authorization: `Bearer ${attackerToken}` });
  check('SECURITY: valid session for a different user cannot claim owner email', rWrongUser.status === 401);
  const rAuthed = await callRouter('tracking/list-links', { slug, ownerEmail: OWNER }, AUTH);
  check('owner route with matching session succeeds', rAuthed.status === 200 && Array.isArray(rAuthed.body?.links));
  const rPublic = await callRouter('tracking/resolve', { token });
  check('viewer-facing route stays public through router', rPublic.status === 200 && !('content' in (rPublic.body || {})));
  const rBadToken = await callRouter('tracking/list-links', { slug, ownerEmail: OWNER },
    { authorization: 'Bearer not-a-real-token-aaaaaaaaaaaaaaaaaaaa' });
  check('garbage bearer token rejected', rBadToken.status === 401);

  console.log('\n== Hardening: passcode lockout ==');
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, passcode: 'lockout-test-9' });
  let lastLockStatus = 0;
  for (let i = 0; i < 5; i++) {
    lastLockStatus = (await call(unlock, { token, email: 'viewer1@example.com', passcode: 'wrong-guess' })).status;
  }
  check('5th wrong passcode locks the link (429)', lastLockStatus === 429, `status=${lastLockStatus}`);
  const uLockedRight = await call(unlock, { token, email: 'viewer1@example.com', passcode: 'lockout-test-9' });
  check('correct passcode still blocked while locked', uLockedRight.status === 429, `status=${uLockedRight.status}`);
  await sql`UPDATE vault_share_links SET locked_until = NULL, failed_attempts = 0 WHERE id = ${link.id}`;
  const uAfterLock = await call(unlock, { token, email: 'viewer1@example.com', passcode: 'lockout-test-9' });
  check('unlocks again after lockout expires', uAfterLock.status === 200);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, passcode: '' });

  console.log('\n== Hardening: atomic visit cap + gated start ==');
  const llCap = await call(listLinks, { slug, ownerEmail: OWNER });
  const capNow = llCap.body.links.find((l: any) => l.id === link.id).visit_count;
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, maxVisits: capNow + 1 });
  check('unlock consumes the last visit', (await call(unlock, { token, email: 'viewer1@example.com' })).status === 200);
  check('next unlock blocked at cap', (await call(unlock, { token, email: 'viewer1@example.com' })).status === 410);
  const llCap2 = await call(listLinks, { slug, ownerEmail: OWNER });
  const capAfter = llCap2.body.links.find((l: any) => l.id === link.id);
  check('visit_count never exceeds max_visits', capAfter.visit_count === capAfter.max_visits,
    `count=${capAfter.visit_count} max=${capAfter.max_visits}`);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, maxVisits: null });
  const sTok = await call(start, { token, viewerEmail: 'viewer1@example.com' });
  check('SECURITY: start no longer accepts link tokens (unlock is the only entry)', sTok.status === 400, `status=${sTok.status}`);

  console.log('\n== Hardening: download tracking ==');
  const uDlTrack = await call(unlock, { token, email: 'downloader@example.com' });
  const dlKey = uDlTrack.body?.sessionKey;
  const dEvt = await call(downloadEvent, { sessionKey: dlKey });
  check('download event recorded', dEvt.status === 200);
  check('unknown session key rejected', (await call(downloadEvent, { sessionKey: 'nope' })).status === 404);
  const sumDl = await call(summary, { slug, ownerEmail: OWNER });
  const dlSess = sumDl.body?.sessions?.find((s: any) => s.session_key === dlKey);
  check('summary reports download_count', dlSess?.download_count === 1, `count=${dlSess?.download_count}`);

  console.log('\n== Viewer email verification (OTP gate) ==');
  const upVerify = await call(updateLink, { linkId: link.id, ownerEmail: OWNER, verifyEmail: true });
  check('verify-email toggle persists', upVerify.status === 200 && upVerify.body?.link?.verify_email === true);
  check('resolve advertises verification gate', (await call(resolve, { token })).body?.verifyEmail === true);
  const uNoCode = await call(unlock, { token, email: 'otpviewer@example.com' });
  check('unlock without code rejected + flagged', uNoCode.status === 401 && uNoCode.body?.verificationRequired === true,
    JSON.stringify(uNoCode.body));
  const vv1 = await call(verifyViewer, { token, email: 'ratelimit@example.com' });
  check('code request accepted (send skipped without RESEND key)', vv1.status === 200 && vv1.body?.sent === true);
  await call(verifyViewer, { token, email: 'ratelimit@example.com' });
  await call(verifyViewer, { token, email: 'ratelimit@example.com' });
  const vv4 = await call(verifyViewer, { token, email: 'ratelimit@example.com' });
  check('4th code request in window rate-limited', vv4.status === 429, `status=${vv4.status}`);
  // plant a known code (emails are hashed at rest, so the harness inserts its own)
  const [otpLinkRow] = await sql`SELECT id FROM vault_share_links WHERE token = ${token}`;
  await sql`
    INSERT INTO vault_viewer_otps (link_id, email, code_hash, expires_at)
    VALUES (${otpLinkRow.id}, 'otpviewer@example.com', ${hashViewerCode('123456')}, NOW() + interval '10 minutes')
  `;
  const uWrongCode = await call(unlock, { token, email: 'otpviewer@example.com', code: '654321' });
  check('wrong code rejected', uWrongCode.status === 401 && uWrongCode.body?.verificationRequired === true);
  const uRightCode = await call(unlock, { token, email: 'otpviewer@example.com', code: '123456' });
  check('correct code unlocks content', uRightCode.status === 200 && typeof uRightCode.body?.content === 'string');
  const uVerified = await call(unlock, { token, email: 'otpviewer@example.com' });
  check('verified viewer re-enters without a new code (24h window)', uVerified.status === 200);
  const uOtherViewer = await call(unlock, { token, email: 'someoneelse@example.com' });
  check('other viewers still gated', uOtherViewer.status === 401 && uOtherViewer.body?.verificationRequired === true);
  await call(updateLink, { linkId: link.id, ownerEmail: OWNER, verifyEmail: false });
  check('disabling verification reopens link', (await call(unlock, { token, email: 'someoneelse@example.com' })).status === 200);

  console.log('\n== Ownership guards ==');
  check('list-links denies non-owner', (await call(listLinks, { slug, ownerEmail: 'attacker@evil.test' })).status === 403);
  check('summary denies non-owner', (await call(summary, { slug, ownerEmail: 'attacker@evil.test' })).status === 403);
  check('signatures denies non-owner', (await call(signatures, { slug, ownerEmail: 'attacker@evil.test' })).status === 403);
  check('update-link denies non-owner', (await call(updateLink, { linkId: link.id, ownerEmail: 'attacker@evil.test', isActive: false })).status === 403);
  void cl2;
}

async function cleanup() {
  try {
    await sql`DELETE FROM user_sessions WHERE email = ${OWNER} OR email = ${'attacker@evil.test'}`;
  } catch { /* best effort */ }
  if (!slug) return;
  const d = await call(del, { slug, ownerEmail: OWNER });
  console.log(`\nCleanup: test project ${slug} ${d.status === 200 ? 'deleted' : `DELETE FAILED (${d.status}) — remove manually`}`);
}

try {
  await main();
} catch (err) {
  failed += 1;
  failures.push(`Harness crashed: ${err instanceof Error ? err.stack : String(err)}`);
  console.error('\nHarness crashed:', err);
} finally {
  await cleanup();
}

console.log(`\n========================================`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('Not testable locally: actual Resend email delivery (needs RESEND_API_KEY on deploy);');
console.log('real geo headers (Vercel edge only — simulated here); browser UI rendering.');
process.exit(failed ? 1 : 0);
