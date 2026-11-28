type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * Sign-in emails are case-insensitive: sessions have always been stored lowercased,
 * so every row keyed by email must be too, or "Jane@x.com" and "jane@x.com" become
 * two accounts (TEXT UNIQUE in Postgres is case-sensitive and won't stop it).
 */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** "jane.doe@x.com" -> ["Jane", "Doe"]; punctuation-only local parts yield []. */
function nameWordsFromEmail(email: string): string[] {
  return email
    .split('@')[0]
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

async function freeHandle(sql: Sql, base: string): Promise<string> {
  let handle = base;
  let suffix = 1;
  while ((await sql`SELECT id FROM profiles WHERE handle = ${handle}`)[0]) {
    suffix++;
    handle = `${base}-${suffix}`;
  }
  return handle;
}

/**
 * Creates the member's profile on first sign-in, and is a no-op afterwards.
 * Names come from their application when they have one; without the application
 * gate most sign-ups don't, so they fall back to the email's local part.
 * Returns the normalized email that the profile is keyed by.
 */
export async function ensureProfile(sql: Sql, rawEmail: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error('ensureProfile: email is required');

  if ((await sql`SELECT id FROM profiles WHERE LOWER(email) = ${email}`)[0]) return email;

  const app = (await sql`SELECT first_name, last_name FROM applications WHERE LOWER(email) = ${email}`)[0];
  const words = nameWordsFromEmail(email);
  const firstName = String(app?.first_name || words[0] || 'User');
  const lastName = String(app?.last_name || (app ? '' : words.slice(1).join(' ')));
  const displayName = `${firstName} ${lastName}`.trim();
  const baseHandle = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'user';

  // Retry rather than 500 when two sign-ins race for the same handle; ON CONFLICT
  // DO NOTHING is untargeted so it absorbs an email conflict too.
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = await freeHandle(sql, baseHandle);
    const [created] = await sql`
      INSERT INTO profiles (email, handle, display_name)
      VALUES (${email}, ${handle}, ${displayName})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (created) return email;
    if ((await sql`SELECT id FROM profiles WHERE LOWER(email) = ${email}`)[0]) return email;
  }

  throw new Error(`ensureProfile: could not allocate a handle for ${email}`);
}
