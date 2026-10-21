/**
 * End-to-end checks for the open sign-up path: OTP verification, profile creation,
 * and email-case handling. Runs the real handlers against DATABASE_URL. Every row it
 * writes lives under a run-scoped @t<timestamp>.hsi-selftest.invalid domain, and the
 * run deletes exactly those rows before exiting — no existing data is read-modified.
 *
 * Usage: node scripts/test-auth.mjs
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
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

register(pathToFileURL('./scripts/ts-resolver.mjs'));

const sql = neon(process.env.DATABASE_URL);
const DOMAIN = `t${Date.now()}.hsi-selftest.invalid`;
const at = (local) => `${local}@${DOMAIN}`;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) =>
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const load = (p) => import(pathToFileURL(p).href);
const { ensureProfile, normalizeEmail } = await load('./api/auth/_ensure-profile.ts');
const { APPLICATION_GATE_ENABLED } = await load('./api/auth/_gate.ts');
const verifyOtp = (await load('./api/auth/_verify-otp.ts')).default;
const sendOtp = (await load('./api/auth/_send-otp.ts')).default;
const accountGet = (await load('./api/settings/account/_get.ts')).default;
const accountUpdate = (await load('./api/settings/account/_update.ts')).default;

section('normalizeEmail');
eq('trims and lowercases', normalizeEmail('  Jane.Doe@Example.COM '), 'jane.doe@example.com');
eq('undefined → empty', normalizeEmail(undefined), '');
eq('null → empty', normalizeEmail(null), '');
eq('number → empty', normalizeEmail(42), '');
eq('object → empty', normalizeEmail({ email: 'x@y.z' }), '');

section('gate');
eq('APPLICATION_GATE_ENABLED is off by default', APPLICATION_GATE_ENABLED, false);

section('ensureProfile — names derived from the email');
for (const [local, display, handleRe] of [
  ['jane.doe', 'Jane Doe', /^jane-doe(-\d+)?$/],
  ['nodots', 'Nodots', /^nodots(-\d+)?$/],
  ['first_last', 'First Last', /^first-last(-\d+)?$/],
  ['a-b-c', 'A B C', /^a-b-c(-\d+)?$/],
  ['jane.doe+tag', 'Jane Doe Tag', /^jane-doe-tag(-\d+)?$/],
]) {
  const email = at(local);
  const returned = await ensureProfile(sql, email.toUpperCase());
  const [row] = await sql`SELECT email, handle, display_name, is_directory FROM profiles WHERE email = ${email}`;
  check(`${local} → profile row created`, !!row);
  if (!row) continue;
  eq(`${local} → returns the normalized email`, returned, email);
  eq(`${local} → email stored lowercased`, row.email, email);
  eq(`${local} → display name`, row.display_name, display);
  check(`${local} → handle ${row.handle}`, handleRe.test(row.handle), `did not match ${handleRe}`);
  eq(`${local} → is a member, not a directory entry`, row.is_directory, false);
}

section('ensureProfile — degenerate local parts still produce a valid row');
for (const local of ['...', 'мария', '123']) {
  const email = at(local);
  await ensureProfile(sql, email);
  const [row] = await sql`SELECT handle, display_name FROM profiles WHERE email = ${email}`;
  check(`"${local}" → row created`, !!row);
  if (!row) continue;
  check(`"${local}" → handle is url-safe`, /^[a-z0-9][a-z0-9-]*$/.test(row.handle), row.handle);
  check(`"${local}" → display name non-empty`, !!row.display_name, JSON.stringify(row.display_name));
}

section('ensureProfile — one account per address, whatever the casing');
const dup = at('dup.user');
await ensureProfile(sql, dup);
await ensureProfile(sql, dup.toUpperCase());
await ensureProfile(sql, `  Dup.User@${DOMAIN.toUpperCase()}  `);
const [{ c: dupCount }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE LOWER(email) = ${dup}`;
eq('three sign-ins across casings → one profile', dupCount, 1);

section('ensureProfile — colliding names get distinct handles');
const twinA = at('twin.name');
const twinB = `twin.name@sub.${DOMAIN}`;
await ensureProfile(sql, twinA);
await ensureProfile(sql, twinB);
const twins = await sql`SELECT handle FROM profiles WHERE email IN (${twinA}, ${twinB})`;
eq('two people, two profiles', twins.length, 2);
check('handles are distinct', twins[0]?.handle !== twins[1]?.handle, JSON.stringify(twins));

section('ensureProfile — an application still supplies the name');
const appEmail = at('app.person');
await sql`INSERT INTO applications (first_name, last_name, email, status) VALUES ('Ada', 'Lovelace', ${appEmail.toUpperCase()}, 'approved')`;
await ensureProfile(sql, appEmail);
const [appRow] = await sql`SELECT display_name FROM profiles WHERE email = ${appEmail}`;
eq('mixed-case application row is found and used', appRow?.display_name, 'Ada Lovelace');

section('verify-otp — a stranger signs in');
const signIn = at('signin');
await sql`INSERT INTO otp_codes (email, code, expires_at) VALUES (${signIn}, '424242', NOW() + INTERVAL '5 minutes')`;
let res = mockRes();
await verifyOtp({ method: 'POST', body: { email: signIn.toUpperCase(), code: ' 424242 ' } }, res);
eq('uppercase email + padded code accepted', res.statusCode, 200);
check('session token issued', typeof res.body?.sessionToken === 'string' && res.body.sessionToken.length >= 40, JSON.stringify(res.body));
const [session] = await sql`SELECT email FROM user_sessions WHERE token = ${res.body?.sessionToken ?? ''}`;
eq('session is keyed by the lowercased email', session?.email, signIn);
const [{ c: signInProfiles }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE LOWER(email) = ${signIn}`;
eq('exactly one profile after sign-in', signInProfiles, 1);

section('verify-otp — rejections');
res = mockRes();
await verifyOtp({ method: 'POST', body: { email: signIn, code: '424242' } }, res);
eq('a used code cannot be replayed', res.statusCode, 401);
res = mockRes();
await verifyOtp({ method: 'POST', body: { email: at('nobody'), code: '000000' } }, res);
eq('an unknown code is rejected', res.statusCode, 401);
res = mockRes();
await verifyOtp({ method: 'POST', body: { email: '', code: '424242' } }, res);
eq('a missing email is rejected', res.statusCode, 400);
res = mockRes();
await verifyOtp({ method: 'GET', body: {} }, res);
eq('GET is rejected', res.statusCode, 405);
const expired = at('expired');
await sql`INSERT INTO otp_codes (email, code, expires_at) VALUES (${expired}, '111111', NOW() - INTERVAL '1 minute')`;
res = mockRes();
await verifyOtp({ method: 'POST', body: { email: expired, code: '111111' } }, res);
eq('an expired code is rejected', res.statusCode, 401);
const [{ c: expiredProfiles }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE LOWER(email) = ${expired}`;
eq('a rejected sign-in creates no profile', expiredProfiles, 0);
const [{ c: expiredSessions }] = await sql`SELECT COUNT(*)::int c FROM user_sessions WHERE email = ${expired}`;
eq('a rejected sign-in creates no session', expiredSessions, 0);

section('send-otp — the gate is open');
const stranger = at('stranger');
const realResendKey = process.env.RESEND_API_KEY;
process.env.RESEND_API_KEY = 'hsi-selftest-not-a-real-key';
res = mockRes();
await sendOtp({ method: 'POST', body: { email: stranger.toUpperCase() }, headers: {} }, res);
process.env.RESEND_API_KEY = realResendKey;
check('an address with no application is not turned away',
  res.body?.exists !== false && res.body?.status === undefined,
  `status ${res.statusCode} body ${JSON.stringify(res.body)}`);
const [otpRow] = await sql`SELECT email FROM otp_codes WHERE LOWER(email) = ${stranger}`;
check('a code was stored for the stranger', !!otpRow, 'no otp_codes row was written');
eq('the stored code row is lowercased', otpRow?.email, stranger);

section('settings/account — no second profile, missing application tolerated');
res = mockRes();
await accountGet({ method: 'POST', body: { email: signIn.toUpperCase() } }, res);
eq('account loads', res.statusCode, 200);
check('profile returned', !!res.body?.profile, JSON.stringify(res.body?.profile));
eq('application is null, not an error', res.body?.application, null);
check('user_settings row created', !!res.body?.settings, JSON.stringify(res.body?.settings));
const [{ c: afterGet }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE LOWER(email) = ${signIn}`;
eq('still exactly one profile', afterGet, 1);

section('settings/account — renaming and changing email');
res = mockRes();
await accountUpdate({ method: 'POST', body: { email: signIn.toUpperCase(), displayName: 'Renamed Person' } }, res);
eq('rename applies to the existing row', res.body?.profile?.display_name, 'Renamed Person');
const movedTo = at('moved');
res = mockRes();
await accountUpdate({ method: 'POST', body: { email: signIn, newEmail: movedTo.toUpperCase() } }, res);
eq('email change stores the lowercased address', res.body?.profile?.email, movedTo);
const [{ c: oldGone }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE LOWER(email) = ${signIn}`;
eq('the old address no longer resolves', oldGone, 0);

section('existing data is untouched');
const [{ c: mixedCase }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE email <> LOWER(email)`;
eq('no mixed-case profile emails anywhere', mixedCase, 0);
const dups = await sql`SELECT LOWER(email) e FROM profiles GROUP BY 1 HAVING COUNT(*) > 1`;
eq('no case-duplicate profiles anywhere', dups.length, 0);

// ILIKE, not LIKE: a regression that stops normalizing would leave rows in the
// casing they were typed in, and the cleanup has to catch those too.
const suffix = `%${DOMAIN}`;
await sql`DELETE FROM user_sessions  WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM otp_codes      WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM user_settings  WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM applications   WHERE email ILIKE ${suffix}`;
await sql`DELETE FROM profiles       WHERE email ILIKE ${suffix}`;
const [{ c: leftover }] = await sql`SELECT COUNT(*)::int c FROM profiles WHERE email ILIKE ${'%hsi-selftest.invalid'}`;
section('cleanup');
eq('no self-test rows remain', leftover, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
