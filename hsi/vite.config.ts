import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { Resend } from 'resend'
import { put, del } from '@vercel/blob'
import type { IncomingMessage, ServerResponse } from 'http'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function devBaseUrl(req: IncomingMessage): string {
  return `http://${req.headers.host || 'localhost:5173'}`;
}

function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

async function ensureVaultItemColumns(sql: NeonQueryFunction<false, false>) {
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'upload'`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS workspace_content TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS workspace_context TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS slug TEXT`;
  await sql`
    UPDATE vault_scripts
    SET item_kind = 'workspace'
    WHERE item_kind = 'upload'
      AND file_name IS NULL
      AND file_data IS NULL
  `;
  const missing = await sql`SELECT id FROM vault_scripts WHERE slug IS NULL`;
  for (const row of missing) {
    const slug = generateSlug();
    await sql`UPDATE vault_scripts SET slug = ${slug} WHERE id = ${row.id}`;
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_scripts_slug ON vault_scripts(slug)`;
}

async function ensureVaultFoldersTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_folders (
    id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL, name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_folders_owner ON vault_folders(owner_email)`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS folder_slug TEXT`;
}

function apiPlugin() {
  let dbUrl: string | undefined;
  let resendKey: string | undefined;
  let blobToken: string | undefined;

  return {
    name: 'api-dev-server',
    configResolved(config: { mode: string; envDir: string }) {
      const env = loadEnv(config.mode, config.envDir, '');
      dbUrl = env.DATABASE_URL;
      resendKey = env.RESEND_API_KEY;
      blobToken = env.BLOB_READ_WRITE_TOKEN;
      if (blobToken) process.env.BLOB_READ_WRITE_TOKEN = blobToken;
      if (env.OLLAMA_HOST) process.env.OLLAMA_HOST = env.OLLAMA_HOST;
      if (env.OLLAMA_MODEL) process.env.OLLAMA_MODEL = env.OLLAMA_MODEL;
    },
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        // Blob image proxy (GET, no body parsing needed)
        if (req.url?.startsWith('/api/blob/image?') && req.method === 'GET') {
          const params = new URL(req.url, 'http://localhost').searchParams;
          const blobUrl = params.get('url');
          if (!blobUrl || !blobUrl.includes('.private.blob.vercel-storage.com')) {
            res.writeHead(400); res.end('Not a private blob URL'); return;
          }
          try {
            const { get: getBlob } = await import('@vercel/blob');
            const result = await getBlob(blobUrl, { access: 'private', token: blobToken });
            if (!result || !result.stream) { res.writeHead(404); res.end('Blob not found'); return; }
            const ct = result.headers.get('content-type') || 'application/octet-stream';
            const cl = result.headers.get('content-length');
            const headers: Record<string, string> = { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000, immutable' };
            if (cl) headers['Content-Length'] = cl;
            res.writeHead(200, headers);
            const reader = result.stream.getReader();
            let chunk;
            while (!(chunk = await reader.read()).done) res.write(chunk.value);
            res.end();
          } catch { res.writeHead(404); res.end('Blob not found'); }
          return;
        }

        if (!dbUrl) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DATABASE_URL not set' }));
          return;
        }

        const sql = neon(dbUrl);
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = body ? JSON.parse(body) : {};

        try {
          // Delegate tracking + assistant routes to the real Vercel handlers
          const delegated: Record<string, () => Promise<{ default: (req: VercelRequest, res: VercelResponse) => Promise<unknown> }>> = {
            '/api/vault/assistant': () => import('./api/vault/_assistant'),
            '/api/people/featured': () => import('./api/people/_featured'),
            '/api/profile/get': () => import('./api/profile/_get'),
            '/api/entity/projects': () => import('./api/entity/_projects'),
            '/api/entity/get': () => import('./api/entity/_get'),
            '/api/entity/search': () => import('./api/entity/_search'),
            '/api/entity/view': () => import('./api/entity/_view'),
            '/api/entity/company-save': () => import('./api/entity/_company-save'),
            '/api/profile/experience/save': () => import('./api/profile/experience/_save'),
            '/api/search/query': () => import('./api/search/_query'),
            '/api/search/trending': () => import('./api/search/_trending'),
            '/api/vault/upload': () => import('./api/vault/_upload'),
            '/api/vault/upload-token': () => import('./api/vault/_upload-token'),
            '/api/vault/tracking/create-link': () => import('./api/vault/tracking/_create-link'),
            '/api/vault/tracking/list-links': () => import('./api/vault/tracking/_list-links'),
            '/api/vault/tracking/update-link': () => import('./api/vault/tracking/_update-link'),
            '/api/vault/tracking/resolve': () => import('./api/vault/tracking/_resolve'),
            '/api/vault/tracking/start': () => import('./api/vault/tracking/_start'),
            '/api/vault/tracking/beat': () => import('./api/vault/tracking/_beat'),
            '/api/vault/tracking/note': () => import('./api/vault/tracking/_note'),
            '/api/vault/tracking/summary': () => import('./api/vault/tracking/_summary'),
            '/api/vault/tracking/unlock': () => import('./api/vault/tracking/_unlock'),
            '/api/vault/tracking/verify-viewer': () => import('./api/vault/tracking/_verify-viewer'),
            '/api/vault/tracking/download-event': () => import('./api/vault/tracking/_download-event'),
            '/api/vault/tracking/signatures': () => import('./api/vault/tracking/_signatures'),
            '/api/vault/tracking/versions': () => import('./api/vault/tracking/_versions'),
            '/api/vault/tracking/deactivate-all': () => import('./api/vault/tracking/_deactivate-all'),
          };
          const loadHandler = delegated[req.url.split('?')[0]];
          if (loadHandler) {
            process.env.DATABASE_URL = dbUrl;
            const { default: handler } = await loadHandler();
            const vReq = Object.assign(req, { body: data, query: {}, cookies: {} });
            const vRes = {
              status(code: number) { res.statusCode = code; return vRes; },
              json(obj: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return vRes; },
            };
            await handler(vReq as unknown as VercelRequest, vRes as unknown as VercelResponse);
            return;
          }

          if (req.url === '/api/check-email' && req.method === 'POST') {
            if (!data.email) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Email is required' }));
              return;
            }
            const rows = await sql`SELECT status FROM applications WHERE email = ${data.email}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (rows.length === 0) {
              res.end(JSON.stringify({ exists: false }));
            } else {
              res.end(JSON.stringify({ exists: true, status: rows[0].status }));
            }
            return;
          }

          if (req.url === '/api/send-otp' && req.method === 'POST') {
            await sql`CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, email TEXT NOT NULL, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`;
            await sql`CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email)`;

            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Email is required' })); return; }

            const rows = await sql`SELECT status FROM applications WHERE email = ${data.email}`;
            if (rows.length === 0) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ exists: false })); return; }
            if (rows[0].status !== 'approved') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ exists: true, status: rows[0].status })); return; }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            await sql`DELETE FROM otp_codes WHERE email = ${data.email} AND used = FALSE`;
            await sql`INSERT INTO otp_codes (email, code, expires_at) VALUES (${data.email}, ${code}, NOW() + INTERVAL '5 minutes')`;

            if (resendKey) {
              const resend = new Resend(resendKey);
              await resend.emails.send({
                from: 'HSI <onboarding@resend.dev>',
                to: data.email,
                subject: 'Your HSI verification code',
                html: `
                  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
                    <img src="${devBaseUrl(req)}/hero-logo.png" alt="HSI" width="48" style="margin-bottom: 24px;" />
                    <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">Your verification code</h2>
                    <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">Enter this code to sign in to HSI:</p>
                    <div style="background: #1a1a1a; border-radius: 8px; padding: 16px 24px; text-align: center; margin-bottom: 24px;">
                      <span style="color: #fff; font-size: 32px; letter-spacing: 0.3em; font-weight: 700;">${code}</span>
                    </div>
                    <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 8px;">This code expires in 5 minutes.</p>
                    <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
                  </div>
                `,
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url === '/api/verify-otp' && req.method === 'POST') {
            if (!data.email || !data.code) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Email and code are required' })); return; }

            async function ensureProfile(userEmail: string) {
              const [existing] = await sql`SELECT id FROM profiles WHERE email = ${userEmail}`;
              if (existing) return;
              const [app] = await sql`SELECT first_name, last_name FROM applications WHERE email = ${userEmail}`;
              const firstName = app?.first_name || 'User';
              const lastName = app?.last_name || '';
              const displayName = `${firstName} ${lastName}`.trim();
              const baseHandle = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
              let handle = baseHandle;
              let suffix = 1;
              while (true) {
                const [taken] = await sql`SELECT id FROM profiles WHERE handle = ${handle}`;
                if (!taken) break;
                suffix++;
                handle = `${baseHandle}-${suffix}`;
              }
              await sql`INSERT INTO profiles (email, handle, display_name) VALUES (${userEmail}, ${handle}, ${displayName})`;
            }

            const backup = process.env.OTP_BACKUP_CODE;
            if (backup && data.code === backup) {
              await ensureProfile(data.email);
              res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ valid: true })); return;
            }

            const match = await sql`
              SELECT id FROM otp_codes
              WHERE email = ${data.email} AND code = ${data.code} AND used = FALSE AND expires_at > NOW()
              ORDER BY created_at DESC LIMIT 1
            `;

            if (match.length === 0) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ valid: false, error: 'Invalid or expired code' })); return; }

            await sql`UPDATE otp_codes SET used = TRUE WHERE id = ${match[0].id}`;
            await ensureProfile(data.email);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true }));
            return;
          }

          // People: list
          if (req.url === '/api/people/list' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const [me] = await sql`SELECT id, skills FROM profiles WHERE email = ${data.email}`;
            if (!me) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const mySkills: string[] = Array.isArray(me.skills) ? me.skills.map((s: string) => s.toLowerCase()) : [];
            const profiles = await sql`
              SELECT p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.skills, p.location,
                     COALESCE(
                       (SELECT c.status FROM connections c
                        WHERE (c.from_profile = ${me.id} AND c.to_profile = p.id)
                           OR (c.from_profile = p.id AND c.to_profile = ${me.id})
                        LIMIT 1),
                       'none'
                     ) AS connection_status,
                     CASE
                       WHEN EXISTS (SELECT 1 FROM connections c WHERE c.from_profile = ${me.id} AND c.to_profile = p.id AND c.status = 'pending')
                       THEN 'sent'
                       WHEN EXISTS (SELECT 1 FROM connections c WHERE c.from_profile = p.id AND c.to_profile = ${me.id} AND c.status = 'pending')
                       THEN 'received'
                       ELSE NULL
                     END AS request_direction
              FROM profiles p WHERE p.id != ${me.id} ORDER BY p.display_name ASC
            `;
            const scored = profiles.map((p: Record<string, unknown>) => {
              const theirSkills: string[] = Array.isArray(p.skills) ? (p.skills as string[]).map((s: string) => s.toLowerCase()) : [];
              const shared = mySkills.filter((s: string) => theirSkills.includes(s)).length;
              return { ...p, relevance: shared };
            });
            scored.sort((a: { relevance: number }, b: { relevance: number }) => b.relevance - a.relevance);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ people: scored }));
            return;
          }

          // People: send connection request
          if (req.url === '/api/people/request' && req.method === 'POST') {
            if (!data.email || !data.targetId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and targetId required' })); return; }
            const [from] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!from) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [to] = await sql`SELECT id FROM profiles WHERE id = ${data.targetId}`;
            if (!to) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Target not found' })); return; }
            if (from.id === to.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Cannot connect to yourself' })); return; }
            const existing = await sql`SELECT id FROM connections WHERE (from_profile = ${from.id} AND to_profile = ${to.id}) OR (from_profile = ${to.id} AND to_profile = ${from.id})`;
            if (existing.length > 0) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Connection exists' })); return; }
            await sql`INSERT INTO connections (from_profile, to_profile, status) VALUES (${from.id}, ${to.id}, 'pending')`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // People: respond to connection request
          if (req.url === '/api/people/respond' && req.method === 'POST') {
            if (!data.email || !data.fromProfileId || !data.action) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email, fromProfileId, and action required' })); return; }
            const [me2] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!me2) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [conn] = await sql`SELECT id FROM connections WHERE from_profile = ${data.fromProfileId} AND to_profile = ${me2.id} AND status = 'pending'`;
            if (!conn) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No pending request' })); return; }
            if (data.action === 'accept') {
              await sql`UPDATE connections SET status = 'accepted' WHERE id = ${conn.id}`;
            } else {
              await sql`DELETE FROM connections WHERE id = ${conn.id}`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url === '/api/apply' && req.method === 'POST') {
            if (!data.firstName || !data.lastName || !data.email) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'First name, last name, and email are required' }));
              return;
            }
            const existing = await sql`SELECT id, status FROM applications WHERE email = ${data.email}`;
            if (existing.length > 0) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Application already exists', status: existing[0].status }));
              return;
            }
            await sql`
              INSERT INTO applications (
                first_name, last_name, email, phone,
                roles, headline, background,
                genres, formats, focus_areas, interests, connections,
                why_join, use_cases, use_case_detail,
                referred, has_ip, understands_curated, agrees_standards, wants_updates,
                additional_info
              ) VALUES (
                ${data.firstName}, ${data.lastName}, ${data.email}, ${data.phone || null},
                ${data.roles || []}, ${data.headline || null}, ${data.background || null},
                ${data.genres || []}, ${data.formats || []}, ${data.focusAreas || []}, ${data.interests || []}, ${data.connections || []},
                ${data.whyJoin || null}, ${data.useCases || []}, ${data.useCaseDetail || null},
                ${data.referred || false}, ${data.hasIP || false}, ${data.understandsCurated || false}, ${data.agreesStandards || false}, ${data.wantsUpdates || false},
                ${data.additionalInfo || null}
              )
            `;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Profile: get
          // Profile: upsert
          if (req.url === '/api/profile/upsert' && req.method === 'POST') {
            if (!data.email || !data.handle || !data.displayName) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'email, handle, and displayName are required' }));
              return;
            }
            const [profile] = await sql`
              INSERT INTO profiles (email, handle, display_name, headline, bio, location, skills, representation, media_links, updated_at)
              VALUES (${data.email}, ${data.handle}, ${data.displayName}, ${data.headline || null}, ${data.bio || null}, ${data.location || null},
                      ${JSON.stringify(data.skills || [])}, ${JSON.stringify(data.representation || [])}, ${JSON.stringify(data.mediaLinks || [])}, NOW())
              ON CONFLICT (email) DO UPDATE SET
                handle = ${data.handle},
                display_name = ${data.displayName},
                headline = ${data.headline || null},
                bio = ${data.bio || null},
                location = ${data.location || null},
                skills = ${JSON.stringify(data.skills || [])},
                representation = ${JSON.stringify(data.representation || [])},
                media_links = ${JSON.stringify(data.mediaLinks || [])},
                updated_at = NOW()
              RETURNING *
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ profile }));
            return;
          }

          // Profile: credits save (bulk replace)
          if (req.url === '/api/profile/credits/save' && req.method === 'POST') {
            if (!data.email || !Array.isArray(data.credits)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'email and credits array are required' }));
              return;
            }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            await sql`DELETE FROM credits WHERE profile_id = ${profile.id}`;
            for (const c of data.credits) {
              await sql`INSERT INTO credits (profile_id, department, title, year, role, work_type, sort_order, entity_id)
                VALUES (${profile.id}, ${c.department}, ${c.title}, ${c.year || null}, ${c.role || null}, ${c.workType || null}, ${c.sortOrder || 0}, ${c.entityId || null})`;
            }
            const saved = await sql`SELECT * FROM credits WHERE profile_id = ${profile.id} ORDER BY department, sort_order, year DESC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ credits: saved }));
            return;
          }

          // Profile: experience save
          if (req.url === '/api/profile/experience/save' && req.method === 'POST') {
            if (!data.email || !data.company || !data.jobTitle) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'email, company, and jobTitle are required' }));
              return;
            }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            let exp;
            if (data.id) {
              [exp] = await sql`UPDATE experience SET company = ${data.company}, job_title = ${data.jobTitle},
                start_date = ${data.startDate || null}, end_date = ${data.endDate || null}, description = ${data.description || null}
                WHERE id = ${data.id} AND profile_id = ${profile.id} RETURNING *`;
            } else {
              [exp] = await sql`INSERT INTO experience (profile_id, company, job_title, start_date, end_date, description)
                VALUES (${profile.id}, ${data.company}, ${data.jobTitle}, ${data.startDate || null}, ${data.endDate || null}, ${data.description || null}) RETURNING *`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ experience: exp }));
            return;
          }

          // Profile: experience delete
          if (req.url === '/api/profile/experience/delete' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const result = await sql`DELETE FROM experience WHERE id = ${data.id} AND profile_id = ${profile.id} RETURNING id`;
            if (result.length === 0) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Profile: awards save
          if (req.url === '/api/profile/awards/save' && req.method === 'POST') {
            if (!data.email || !data.awardName) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'email and awardName are required' }));
              return;
            }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            let award;
            if (data.id) {
              [award] = await sql`UPDATE awards SET award_name = ${data.awardName}, category = ${data.category || null},
                year = ${data.year || null}, result = ${data.result || 'Nominated'}, project = ${data.project || null}
                WHERE id = ${data.id} AND profile_id = ${profile.id} RETURNING *`;
            } else {
              [award] = await sql`INSERT INTO awards (profile_id, award_name, category, year, result, project)
                VALUES (${profile.id}, ${data.awardName}, ${data.category || null}, ${data.year || null}, ${data.result || 'Nominated'}, ${data.project || null}) RETURNING *`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ award }));
            return;
          }

          // Profile: awards delete
          if (req.url === '/api/profile/awards/delete' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const result = await sql`DELETE FROM awards WHERE id = ${data.id} AND profile_id = ${profile.id} RETURNING id`;
            if (result.length === 0) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Profile: connect
          if (req.url === '/api/profile/connect' && req.method === 'POST') {
            if (!data.email || !data.targetHandle) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and targetHandle are required' })); return; }
            const [from] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!from) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [to] = await sql`SELECT id FROM profiles WHERE handle = ${data.targetHandle}`;
            if (!to) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Target not found' })); return; }
            if (from.id === to.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Cannot connect to yourself' })); return; }
            const existing = await sql`SELECT id FROM connections WHERE (from_profile = ${from.id} AND to_profile = ${to.id}) OR (from_profile = ${to.id} AND to_profile = ${from.id})`;
            if (existing.length > 0) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Connection already exists' })); return; }
            await sql`INSERT INTO connections (from_profile, to_profile, status) VALUES (${from.id}, ${to.id}, 'accepted')`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Vault: create workspace (no file)
          if (req.url === '/api/vault/create-workspace' && req.method === 'POST') {
            if (!data.ownerEmail || !data.title) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'ownerEmail and title are required' }));
              return;
            }
            await ensureVaultItemColumns(sql);
            await ensureVaultFoldersTable(sql);
            const wsSlug = generateSlug();
            const [row] = await sql`
              INSERT INTO vault_scripts (slug, owner_email, title, item_kind, project_type, privacy, status, collaborators, folder_slug)
              VALUES (${wsSlug}, ${data.ownerEmail}, ${data.title}, 'workspace',
                      ${data.projectType || 'other'}, ${data.privacy || 'private'},
                      ${data.status || 'draft'}, ${data.collaborators || []}, ${data.folderSlug || null})
              RETURNING slug, title, file_name, file_type, file_size, item_kind, project_type, privacy, status, collaborators, created_at
            `;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
            return;
          }

          // Vault: list
          if (req.url === '/api/vault/list' && req.method === 'POST') {
            if (!data.email) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Email is required' }));
              return;
            }
            await ensureVaultItemColumns(sql);
            await ensureVaultFoldersTable(sql);
            const scripts = await sql`
              SELECT s.slug, s.title, s.file_name, s.file_type, s.file_size,
                     s.item_kind, s.project_type, s.privacy, s.status, s.collaborators, s.created_at,
                     s.folder_slug,
                COALESCE(
                  (SELECT json_agg(json_build_object('shared_with', sh.shared_with, 'permission', sh.permission))
                   FROM vault_shares sh WHERE sh.script_id = s.id), '[]'
                ) AS shares
              FROM vault_scripts s
              WHERE s.owner_email = ${data.email}
              ORDER BY s.created_at DESC
            `;
            const sharedWithMe = await sql`
              SELECT s.slug, s.title, s.file_name, s.file_type, s.file_size,
                     s.item_kind, s.project_type, s.privacy, s.status, s.created_at,
                     s.owner_email, sh.permission AS my_permission
              FROM vault_shares sh
              JOIN vault_scripts s ON s.id = sh.script_id
              WHERE sh.shared_with = ${data.email}
              ORDER BY s.created_at DESC
            `;
            const vaultFolders = await sql`
              SELECT f.slug, f.name, f.created_at,
                (SELECT COUNT(*)::int FROM vault_scripts s
                 WHERE s.folder_slug = f.slug AND s.owner_email = f.owner_email) AS item_count
              FROM vault_folders f
              WHERE f.owner_email = ${data.email}
              ORDER BY f.name ASC
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ owned: scripts, shared: sharedWithMe, folders: vaultFolders }));
            return;
          }

          // Vault: folders create/rename/delete + move item
          if (req.url === '/api/vault/folders/create' && req.method === 'POST') {
            if (!data.ownerEmail || !data.name?.trim()) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'ownerEmail and name are required' }));
              return;
            }
            await ensureVaultFoldersTable(sql);
            const folderSlug = generateSlug();
            const [row] = await sql`
              INSERT INTO vault_folders (slug, owner_email, name)
              VALUES (${folderSlug}, ${data.ownerEmail}, ${data.name.trim()})
              RETURNING slug, name, created_at
            `;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
            return;
          }

          if (req.url === '/api/vault/folders/rename' && req.method === 'POST') {
            if (!data.ownerEmail || !data.slug || !data.name?.trim()) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'ownerEmail, slug and name are required' }));
              return;
            }
            await ensureVaultFoldersTable(sql);
            const [row] = await sql`
              UPDATE vault_folders SET name = ${data.name.trim()}
              WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}
              RETURNING slug, name
            `;
            if (!row) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized or not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
            return;
          }

          if (req.url === '/api/vault/folders/delete' && req.method === 'POST') {
            if (!data.ownerEmail || !data.slug) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'ownerEmail and slug are required' }));
              return;
            }
            await ensureVaultFoldersTable(sql);
            const [folder] = await sql`
              SELECT id FROM vault_folders WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}
            `;
            if (!folder) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized or not found' }));
              return;
            }
            await sql`
              UPDATE vault_scripts SET folder_slug = NULL
              WHERE folder_slug = ${data.slug} AND owner_email = ${data.ownerEmail}
            `;
            await sql`DELETE FROM vault_folders WHERE id = ${folder.id}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url === '/api/vault/move' && req.method === 'POST') {
            if (!data.ownerEmail || !data.slug) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'ownerEmail and slug are required' }));
              return;
            }
            await ensureVaultFoldersTable(sql);
            const [item] = await sql`
              SELECT id FROM vault_scripts WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}
            `;
            if (!item) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized or not found' }));
              return;
            }
            if (data.folderSlug) {
              const [folder] = await sql`
                SELECT id FROM vault_folders WHERE slug = ${data.folderSlug} AND owner_email = ${data.ownerEmail}
              `;
              if (!folder) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Folder not found' }));
                return;
              }
            }
            await sql`
              UPDATE vault_scripts SET folder_slug = ${data.folderSlug || null} WHERE id = ${item.id}
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Vault: get item
          if (req.url === '/api/vault/get' && req.method === 'POST') {
            if (!data.slug || !data.email) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug and email are required' }));
              return;
            }
            await ensureVaultItemColumns(sql);
            const [item] = await sql`
              SELECT s.slug, s.owner_email, s.title, s.file_name, s.file_type, s.file_size, s.file_data,
                     s.item_kind, s.project_type, s.privacy, s.status, s.collaborators,
                     s.workspace_content, s.workspace_context, s.created_at,
                COALESCE(
                  (SELECT json_agg(json_build_object('shared_with', sh.shared_with, 'permission', sh.permission))
                   FROM vault_shares sh WHERE sh.script_id = s.id), '[]'
                ) AS shares
              FROM vault_scripts s
              WHERE s.slug = ${data.slug} AND s.owner_email = ${data.email}
            `;
            if (!item) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Vault item not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(item));
            return;
          }

          // Vault: save item
          if (req.url === '/api/vault/save' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug and ownerEmail are required' }));
              return;
            }
            await ensureVaultItemColumns(sql);
            const [existing] = await sql`
              SELECT id, title, status, file_data, file_size, workspace_content, workspace_context, collaborators
              FROM vault_scripts
              WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}
            `;
            if (!existing) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized or not found' }));
              return;
            }

            const nextTitle = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : existing.title;
            const nextStatus = typeof data.status === 'string' ? data.status : existing.status;
            const nextFileData = typeof data.fileData === 'string' ? data.fileData : existing.file_data;
            const nextFileSize = typeof data.fileSize === 'number' ? data.fileSize : existing.file_size;
            const nextWorkspaceContent = typeof data.workspaceContent === 'string' ? data.workspaceContent : existing.workspace_content;
            const nextWorkspaceContext = typeof data.workspaceContext === 'string' ? data.workspaceContext : existing.workspace_context;
            const nextCollaborators = Array.isArray(data.collaborators) ? data.collaborators : existing.collaborators;

            const [item] = await sql`
              UPDATE vault_scripts
              SET title = ${nextTitle},
                  status = ${nextStatus},
                  file_data = ${nextFileData},
                  file_size = ${nextFileSize},
                  workspace_content = ${nextWorkspaceContent},
                  workspace_context = ${nextWorkspaceContext},
                  collaborators = ${nextCollaborators}
              WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}
              RETURNING slug, title, file_name, file_type, file_size, item_kind, project_type,
                        privacy, status, collaborators, workspace_content, workspace_context, created_at
            `;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(item));
            return;
          }

          // Vault: share
          if (req.url === '/api/vault/share' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail || !data.sharedWith) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            const [script] = await sql`SELECT id, title FROM vault_scripts WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}`;
            if (!script) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized' }));
              return;
            }
            const existing = await sql`SELECT id FROM vault_shares WHERE script_id = ${script.id} AND shared_with = ${data.sharedWith}`;
            if (existing.length > 0) {
              await sql`UPDATE vault_shares SET permission = ${data.permission || 'view'} WHERE script_id = ${script.id} AND shared_with = ${data.sharedWith}`;
            } else {
              await sql`INSERT INTO vault_shares (script_id, shared_with, permission) VALUES (${script.id}, ${data.sharedWith}, ${data.permission || 'view'})`;
            }

            if (resendKey && data.sharedWith.includes('@')) {
              const resend = new Resend(resendKey);
              await resend.emails.send({
                from: 'HSI Vault <onboarding@resend.dev>',
                to: data.sharedWith,
                subject: `A script has been shared with you — "${script.title}"`,
                html: `
                  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
                    <img src="${devBaseUrl(req)}/hero-logo.png" alt="HSI" width="48" style="margin-bottom: 24px;" />
                    <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">A script has been shared with you</h2>
                    <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
                      <strong style="color: #fff;">${data.ownerEmail}</strong> shared <strong style="color: #fff;">"${script.title}"</strong> with you (${data.permission || 'view'} access).
                    </p>
                    <a href="${devBaseUrl(req)}/vault" style="display: inline-block; padding: 10px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                      Open Vault
                    </a>
                    <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
                  </div>
                `,
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Vault: delete
          if (req.url === '/api/vault/delete' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            const result = await sql`DELETE FROM vault_scripts WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail} RETURNING id`;
            if (result.length === 0) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not authorized or not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // ── Vault Attachments endpoints ──

          if (req.url === '/api/vault/attachments/upload' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail || !data.fileName || !data.fileData) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug, ownerEmail, fileName, and fileData are required' }));
              return;
            }
            await sql`CREATE TABLE IF NOT EXISTS vault_attachments (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER DEFAULT 0,
              file_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
            const ext = data.fileName.split('.').pop()?.toLowerCase() || '';
            const [att] = await sql`
              INSERT INTO vault_attachments (vault_slug, owner_email, file_name, file_type, file_size, file_data)
              VALUES (${data.slug}, ${data.ownerEmail}, ${data.fileName}, ${ext}, ${data.fileSize || 0}, ${data.fileData})
              RETURNING id, file_name, file_type, file_size, created_at`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(att));
            return;
          }

          if (req.url === '/api/vault/attachments/list' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug and ownerEmail are required' }));
              return;
            }
            await sql`CREATE TABLE IF NOT EXISTS vault_attachments (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER DEFAULT 0,
              file_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
            const rows = await sql`
              SELECT id, file_name, file_type, file_size, created_at
              FROM vault_attachments
              WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail}
              ORDER BY created_at DESC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(rows));
            return;
          }

          if (req.url === '/api/vault/attachments/delete' && req.method === 'POST') {
            if (!data.id || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'id and ownerEmail are required' }));
              return;
            }
            await sql`CREATE TABLE IF NOT EXISTS vault_attachments (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER DEFAULT 0,
              file_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
            await sql`DELETE FROM vault_attachments WHERE id = ${data.id} AND owner_email = ${data.ownerEmail}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url === '/api/vault/attachments/download' && req.method === 'POST') {
            if (!data.id || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'id and ownerEmail are required' }));
              return;
            }
            await sql`CREATE TABLE IF NOT EXISTS vault_attachments (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER DEFAULT 0,
              file_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
            const [att] = await sql`SELECT file_name, file_data FROM vault_attachments WHERE id = ${data.id} AND owner_email = ${data.ownerEmail}`;
            if (!att) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(att));
            return;
          }

          // ── Vault Analysis endpoints ──

          if (req.url === '/api/vault/analysis/run' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail || !data.tool || !data.dimensionKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug, ownerEmail, tool, and dimensionKey are required' }));
              return;
            }

            const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
            const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

            const { getToolDef: aGetToolDef, getDimensionDef: aGetDimensionDef } = await import('./api/vault/_analysis-config');
            const { callOllama: aCallOllama } = await import('./api/vault/_ollama');

            const toolDef = aGetToolDef(data.tool);
            if (!toolDef) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid tool' })); return; }

            const dimDef = aGetDimensionDef(data.tool, data.dimensionKey);
            if (!dimDef) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid dimension' })); return; }

            await sql`CREATE TABLE IF NOT EXISTS vault_analyses (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              tool TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', overall_score INTEGER,
              dimensions JSONB NOT NULL DEFAULT '[]', error_message TEXT,
              started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(vault_slug, owner_email, tool))`;

            if (toolDef.prerequisite) {
              const [prereq] = await sql`SELECT overall_score, status FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${toolDef.prerequisite}`;
              if (!prereq || prereq.status !== 'completed' || (prereq.overall_score ?? 0) < toolDef.unlockThreshold) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Complete ${toolDef.prerequisite} with a score of ${toolDef.unlockThreshold}+ first` }));
                return;
              }
            }

            const [vaultItem] = await sql`SELECT workspace_content, file_data, item_kind FROM vault_scripts WHERE slug = ${data.slug} AND owner_email = ${data.ownerEmail}`;
            if (!vaultItem) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Vault item not found' })); return; }

            let projectContent = vaultItem.workspace_content || '';
            if (!projectContent && vaultItem.file_data) {
              const commaIdx = vaultItem.file_data.indexOf(',');
              if (commaIdx !== -1) {
                const meta = vaultItem.file_data.slice(0, commaIdx);
                const payload = vaultItem.file_data.slice(commaIdx + 1);
                try {
                  if (meta.includes(';base64')) {
                    projectContent = Buffer.from(payload, 'base64').toString('utf-8');
                  } else {
                    projectContent = decodeURIComponent(payload);
                  }
                } catch { projectContent = ''; }
              }
            }

            if (!projectContent.trim()) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Project has no content to analyze. Add text to your workspace or upload a script first.' }));
              return;
            }

            await sql`INSERT INTO vault_analyses (vault_slug, owner_email, tool, status, started_at)
              VALUES (${data.slug}, ${data.ownerEmail}, ${data.tool}, 'running', NOW())
              ON CONFLICT (vault_slug, owner_email, tool)
              DO UPDATE SET status = CASE WHEN vault_analyses.status = 'completed' THEN vault_analyses.status ELSE 'running' END,
                            started_at = COALESCE(vault_analyses.started_at, NOW())`;

            let priorContext: string | undefined;
            if (data.tool === 'relativity') {
              const [cov] = await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = 'coverage'`;
              if (cov) priorContext = `Coverage Score: ${cov.overall_score}/100\n` + (Array.isArray(cov.dimensions) ? cov.dimensions : JSON.parse(cov.dimensions || '[]')).map((d: { label: string; score: number; summary: string }) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n');
            } else if (data.tool === 'greenlight') {
              const [cov] = await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = 'coverage'`;
              const [rel] = await sql`SELECT dimensions, overall_score FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = 'relativity'`;
              const parts: string[] = [];
              if (cov) parts.push(`Coverage Score: ${cov.overall_score}/100\n` + (Array.isArray(cov.dimensions) ? cov.dimensions : JSON.parse(cov.dimensions || '[]')).map((d: { label: string; score: number; summary: string }) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n'));
              if (rel) parts.push(`Relativity Score: ${rel.overall_score}/100\n` + (Array.isArray(rel.dimensions) ? rel.dimensions : JSON.parse(rel.dimensions || '[]')).map((d: { label: string; score: number; summary: string }) => `${d.label}: ${d.score}/100 - ${d.summary}`).join('\n'));
              if (parts.length) priorContext = parts.join('\n\n');
            }

            try {
              const result = await aCallOllama(ollamaHost, ollamaModel, projectContent, dimDef.label, dimDef.description, priorContext);
              const dimResult = {
                dimension: dimDef.key,
                label: dimDef.label,
                score: result.score,
                weight: dimDef.weight,
                summary: result.summary,
                detailed_analysis: result.detailed_analysis,
                completed_at: new Date().toISOString(),
              };

              const [current] = await sql`SELECT dimensions FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${data.tool}`;
              const dims: { dimension: string; label: string; score: number; weight: number; summary: string; detailed_analysis: string; completed_at: string }[] = Array.isArray(current.dimensions) ? current.dimensions : JSON.parse(current.dimensions || '[]');
              const filtered = dims.filter(d => d.dimension !== dimDef.key);
              filtered.push(dimResult);

              const completedCount = filtered.length;
              const totalCount = toolDef.dimensions.length;
              const isComplete = completedCount >= totalCount;

              let overallScore: number | null = null;
              if (isComplete) {
                let weightedSum = 0, weightSum = 0;
                for (const d of filtered) {
                  const def = toolDef.dimensions.find(td => td.key === d.dimension);
                  const w = def?.weight || (1 / totalCount);
                  weightedSum += d.score * w;
                  weightSum += w;
                }
                overallScore = Math.round(weightedSum / weightSum);
              }

              await sql`UPDATE vault_analyses SET
                dimensions = ${JSON.stringify(filtered)},
                status = ${isComplete ? 'completed' : 'running'},
                overall_score = ${overallScore},
                completed_at = ${isComplete ? new Date().toISOString() : null}
                WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${data.tool}`;

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                dimension: dimDef.key, label: dimDef.label,
                score: result.score, summary: result.summary,
                detailed_analysis: result.detailed_analysis,
                progress: { completed: completedCount, total: totalCount },
                overall_score: overallScore,
                tool_status: isComplete ? 'completed' : 'running',
              }));
              return;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Analysis failed';
              await sql`UPDATE vault_analyses SET status = 'failed', error_message = ${message} WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${data.tool}`;
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: message || 'Analysis failed. Is Ollama running?' }));
              return;
            }
          }

          if (req.url === '/api/vault/analysis/status' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug and ownerEmail are required' }));
              return;
            }

            await sql`CREATE TABLE IF NOT EXISTS vault_analyses (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              tool TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', overall_score INTEGER,
              dimensions JSONB NOT NULL DEFAULT '[]', error_message TEXT,
              started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(vault_slug, owner_email, tool))`;

            const rows = await sql`SELECT tool, status, overall_score, dimensions, error_message, started_at, completed_at FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail}`;
            const result: Record<string, Record<string, unknown> | null> = { coverage: null, relativity: null, greenlight: null };
            for (const row of rows) {
              result[row.tool] = {
                tool: row.tool,
                status: row.status,
                overall_score: row.overall_score,
                dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
                error_message: row.error_message,
                started_at: row.started_at,
                completed_at: row.completed_at,
              };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }

          if (req.url === '/api/vault/analysis/reset' && req.method === 'POST') {
            if (!data.slug || !data.ownerEmail || !data.tool) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'slug, ownerEmail, and tool are required' }));
              return;
            }

            await sql`CREATE TABLE IF NOT EXISTS vault_analyses (
              id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
              tool TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', overall_score INTEGER,
              dimensions JSONB NOT NULL DEFAULT '[]', error_message TEXT,
              started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE(vault_slug, owner_email, tool))`;

            await sql`DELETE FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${data.tool}`;

            const downstream: string[] = [];
            if (data.tool === 'coverage') downstream.push('relativity', 'greenlight');
            else if (data.tool === 'relativity') downstream.push('greenlight');
            for (const t of downstream) {
              await sql`DELETE FROM vault_analyses WHERE vault_slug = ${data.slug} AND owner_email = ${data.ownerEmail} AND tool = ${t}`;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // ── Upload endpoints ──
          if (req.url === '/api/upload/image' && req.method === 'POST') {
            if (!data.imageData || !data.fileName) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'imageData and fileName are required' })); return; }
            const matches = data.imageData.match(/^data:(.+?);base64,(.+)$/);
            if (!matches) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid image data' })); return; }
            const buffer = Buffer.from(matches[2], 'base64');
            const blob = await put(data.fileName, buffer, { access: 'private', contentType: matches[1], token: blobToken });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: blob.url }));
            return;
          }

          // ── Entity endpoints ──

          // Entity: create
          if (req.url === '/api/entity/create' && req.method === 'POST') {
            if (!data.email || !data.type || !data.title) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email, type, and title are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }

            let imageUrl = null;
            if (data.imageData && data.fileName) {
              const matches = data.imageData.match(/^data:(.+?);base64,(.+)$/);
              if (matches) {
                const buffer = Buffer.from(matches[2], 'base64');
                const blob = await put(`entities/${data.fileName}`, buffer, { access: 'private', contentType: matches[1], token: blobToken });
                imageUrl = blob.url;
              }
            }

            const slug = generateSlug();

            const [entity] = await sql`
              INSERT INTO entities (type, title, slug, year, image_url, genre, description, metadata, created_by)
              VALUES (${data.type}, ${data.title}, ${slug}, ${data.year || null}, ${imageUrl}, ${data.genre || []}, ${data.description || null}, ${JSON.stringify(data.metadata || {})}, ${profile.id})
              RETURNING *
            `;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ entity }));
            return;
          }

          // Entity: update
          if (req.url === '/api/entity/update' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [entity] = await sql`SELECT * FROM entities WHERE id = ${data.id}`;
            if (!entity) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Entity not found' })); return; }
            if (entity.created_by !== profile.id && data.email !== 'admin@hollywoodstudios.ai') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not authorized' })); return; }

            let imageUrl = entity.image_url;
            if (data.imageData && data.fileName) {
              const matches = data.imageData.match(/^data:(.+?);base64,(.+)$/);
              if (matches) {
                const buffer = Buffer.from(matches[2], 'base64');
                const blob = await put(`entities/${data.fileName}`, buffer, { access: 'private', contentType: matches[1], token: blobToken });
                imageUrl = blob.url;
              }
            }

            const [updated] = await sql`
              UPDATE entities SET title = ${data.title || entity.title}, year = ${data.year !== undefined ? data.year : entity.year},
                image_url = ${imageUrl}, genre = ${data.genre || entity.genre},
                description = ${data.description !== undefined ? data.description : entity.description},
                metadata = ${JSON.stringify(data.metadata || entity.metadata)}, updated_at = NOW()
              WHERE id = ${data.id} RETURNING *
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ entity: updated }));
            return;
          }

          // Entity: get
          if (req.url === '/api/entity/get' && req.method === 'POST') {
            if (!data.slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'slug is required' })); return; }
            const [entity] = await sql`
              SELECT e.*, p.display_name AS creator_name, p.handle AS creator_handle
              FROM entities e LEFT JOIN profiles p ON e.created_by = p.id
              WHERE e.slug = ${data.slug}
            `;
            if (!entity) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Entity not found' })); return; }
            const castCrew = await sql`
              SELECT c.department, c.role, c.year, p.display_name, p.handle, p.avatar_url, p.headline
              FROM credits c JOIN profiles p ON c.profile_id = p.id
              WHERE c.entity_id = ${entity.id}
              ORDER BY c.department, c.sort_order
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ entity, castCrew }));
            return;
          }

          // Entity: delete
          if (req.url === '/api/entity/delete' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [entity] = await sql`SELECT created_by FROM entities WHERE id = ${data.id}`;
            if (!entity) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Entity not found' })); return; }
            if (entity.created_by !== profile.id && data.email !== 'admin@hollywoodstudios.ai') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not authorized' })); return; }
            await sql`DELETE FROM entities WHERE id = ${data.id}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Entity: search (autocomplete)
          if (req.url === '/api/entity/search' && req.method === 'POST') {
            if (!data.query) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'query is required' })); return; }
            const pattern = `%${data.query}%`;
            let results;
            if (data.type) {
              results = await sql`SELECT id, type, title, year, image_url FROM entities WHERE title ILIKE ${pattern} AND type = ${data.type} ORDER BY title LIMIT 10`;
            } else {
              results = await sql`SELECT id, type, title, year, image_url FROM entities WHERE title ILIKE ${pattern} ORDER BY title LIMIT 10`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
            return;
          }

          // Entity: list
          if (req.url === '/api/entity/list' && req.method === 'POST') {
            if (!data.type) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'type is required' })); return; }
            const offset = ((data.page || 1) - 1) * (data.limit || 20);
            const entities = await sql`SELECT * FROM entities WHERE type = ${data.type} ORDER BY created_at DESC LIMIT ${data.limit || 20} OFFSET ${offset}`;
            const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM entities WHERE type = ${data.type}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ entities, total: count }));
            return;
          }

          // ── Settings endpoints ──

          // Settings: account get
          if (req.url === '/api/settings/account/get' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            {
              const [ex] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
              if (!ex) {
                const [ap] = await sql`SELECT first_name, last_name FROM applications WHERE email = ${data.email}`;
                const fn = ap?.first_name || 'User'; const ln = ap?.last_name || '';
                const dn = `${fn} ${ln}`.trim();
                const bh = `${fn}-${ln}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'user';
                let h = bh; let s = 1;
                while (true) { const [t] = await sql`SELECT id FROM profiles WHERE handle = ${h}`; if (!t) break; s++; h = `${bh}-${s}`; }
                await sql`INSERT INTO profiles (email, handle, display_name) VALUES (${data.email}, ${h}, ${dn})`;
              }
            }
            const [profile] = await sql`SELECT * FROM profiles WHERE email = ${data.email}`;
            const [app] = await sql`SELECT first_name, last_name FROM applications WHERE email = ${data.email}`;
            let settings = (await sql`SELECT * FROM user_settings WHERE email = ${data.email}`)[0];
            if (!settings) {
              [settings] = await sql`INSERT INTO user_settings (email) VALUES (${data.email}) ON CONFLICT (email) DO NOTHING RETURNING *`;
              if (!settings) settings = (await sql`SELECT * FROM user_settings WHERE email = ${data.email}`)[0];
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ profile: profile || null, application: app || null, settings }));
            return;
          }

          // Settings: account update
          if (req.url === '/api/settings/account/update' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            if (data.displayName !== undefined) {
              await sql`UPDATE profiles SET display_name = ${data.displayName}, updated_at = NOW() WHERE email = ${data.email}`;
            }
            if (data.handle !== undefined) {
              const existing = await sql`SELECT id FROM profiles WHERE handle = ${data.handle} AND email != ${data.email}`;
              if (existing.length > 0) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Username already taken' })); return; }
              await sql`UPDATE profiles SET handle = ${data.handle}, updated_at = NOW() WHERE email = ${data.email}`;
            }
            if (data.newEmail !== undefined) {
              const existing = await sql`SELECT id FROM profiles WHERE email = ${data.newEmail}`;
              if (existing.length > 0) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Email already in use' })); return; }
              await sql`UPDATE profiles SET email = ${data.newEmail}, updated_at = NOW() WHERE email = ${data.email}`;
              await sql`UPDATE applications SET email = ${data.newEmail} WHERE email = ${data.email}`;
              await sql`UPDATE user_settings SET email = ${data.newEmail}, updated_at = NOW() WHERE email = ${data.email}`;
            }
            const [profile] = await sql`SELECT * FROM profiles WHERE email = ${data.newEmail || data.email}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ profile }));
            return;
          }

          // Settings: add password
          if (req.url === '/api/settings/account/password' && req.method === 'POST') {
            if (!data.email || !data.password) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and password are required' })); return; }
            await sql`INSERT INTO user_settings (email, password_hash) VALUES (${data.email}, ${data.password})
              ON CONFLICT (email) DO UPDATE SET password_hash = ${data.password}, updated_at = NOW()`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Settings: pages list
          if (req.url === '/api/settings/pages/list' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const pages = await sql`SELECT * FROM user_pages WHERE owner_email = ${data.email} ORDER BY created_at DESC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pages));
            return;
          }

          // Settings: pages add
          if (req.url === '/api/settings/pages/add' && req.method === 'POST') {
            if (!data.email || !data.pageName || !data.platform) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email, pageName, and platform are required' })); return; }
            const [page] = await sql`INSERT INTO user_pages (owner_email, page_name, platform, page_url)
              VALUES (${data.email}, ${data.pageName}, ${data.platform}, ${data.pageUrl || null}) RETURNING *`;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(page));
            return;
          }

          // Settings: pages update
          if (req.url === '/api/settings/pages/update' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            if (data.aiWatching !== undefined) {
              await sql`UPDATE user_pages SET ai_watching = ${data.aiWatching} WHERE id = ${data.id} AND owner_email = ${data.email}`;
            }
            if (data.privacy !== undefined) {
              await sql`UPDATE user_pages SET privacy = ${data.privacy} WHERE id = ${data.id} AND owner_email = ${data.email}`;
            }
            const [page] = await sql`SELECT * FROM user_pages WHERE id = ${data.id} AND owner_email = ${data.email}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(page));
            return;
          }

          // Settings: pages delete
          if (req.url === '/api/settings/pages/delete' && req.method === 'POST') {
            if (!data.email || !data.id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and id are required' })); return; }
            await sql`DELETE FROM user_pages WHERE id = ${data.id} AND owner_email = ${data.email}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Settings: access codes list
          if (req.url === '/api/settings/codes/list' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const codes = await sql`SELECT * FROM access_codes WHERE owner_email = ${data.email} ORDER BY created_at DESC`;
            const [{ members }] = await sql`SELECT COUNT(*)::int AS members FROM access_codes WHERE owner_email = ${data.email} AND used = true AND invited_email IS NOT NULL`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ codes, members, followers: 0 }));
            return;
          }

          // Settings: access codes invite
          if (req.url === '/api/settings/codes/invite' && req.method === 'POST') {
            if (!data.email || !data.invitedEmail) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and invitedEmail are required' })); return; }
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            const [row] = await sql`INSERT INTO access_codes (owner_email, code, invited_email) VALUES (${data.email}, ${code}, ${data.invitedEmail}) RETURNING *`;
            if (resendKey && data.invitedEmail.includes('@')) {
              const resend = new Resend(resendKey);
              await resend.emails.send({
                from: 'Palo <onboarding@resend.dev>',
                to: data.invitedEmail,
                subject: 'You\'ve been invited to Palo!',
                html: `
                  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
                    <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">You've been invited to Palo</h2>
                    <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
                      <strong style="color: #fff;">${data.email}</strong> invited you to join Palo. You both get <strong style="color: #fff;">7 days free</strong>!
                    </p>
                    <p style="color: rgba(255,255,255,0.4); font-size: 13px;">Your invite code: <strong style="color: #fff;">${code}</strong></p>
                    <a href="${devBaseUrl(req)}/login" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                      Join Palo
                    </a>
                  </div>
                `,
              });
            }
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
            return;
          }

          // Settings: friends list
          if (req.url === '/api/settings/friends/list' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const friends = await sql`
              SELECT f.id, f.created_at,
                CASE WHEN f.from_email = ${data.email} THEN f.to_email ELSE f.from_email END AS friend_email,
                p.display_name, p.handle, p.avatar_url
              FROM friendships f
              LEFT JOIN profiles p ON (
                CASE WHEN f.from_email = ${data.email} THEN f.to_email ELSE f.from_email END = p.email
              )
              WHERE (f.from_email = ${data.email} OR f.to_email = ${data.email}) AND f.status = 'accepted'
              ORDER BY f.created_at DESC
            `;
            const requests = await sql`
              SELECT f.id, f.from_email, f.created_at, p.display_name, p.handle, p.avatar_url
              FROM friendships f
              LEFT JOIN profiles p ON f.from_email = p.email
              WHERE f.to_email = ${data.email} AND f.status = 'pending'
              ORDER BY f.created_at DESC
            `;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ friends, requests }));
            return;
          }

          // Settings: friends respond
          if (req.url === '/api/settings/friends/respond' && req.method === 'POST') {
            if (!data.email || !data.friendshipId || !data.action) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email, friendshipId, and action are required' })); return; }
            if (data.action === 'accept') {
              await sql`UPDATE friendships SET status = 'accepted' WHERE id = ${data.friendshipId} AND to_email = ${data.email}`;
            } else {
              await sql`DELETE FROM friendships WHERE id = ${data.friendshipId} AND to_email = ${data.email}`;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Settings: friends remove
          if (req.url === '/api/settings/friends/remove' && req.method === 'POST') {
            if (!data.email || !data.friendshipId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and friendshipId are required' })); return; }
            await sql`DELETE FROM friendships WHERE id = ${data.friendshipId} AND (from_email = ${data.email} OR to_email = ${data.email})`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Settings: network get
          if (req.url === '/api/settings/network/get' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            let settings = (await sql`SELECT milestones_enabled FROM user_settings WHERE email = ${data.email}`)[0];
            if (!settings) {
              await sql`INSERT INTO user_settings (email) VALUES (${data.email}) ON CONFLICT (email) DO NOTHING`;
              settings = { milestones_enabled: true };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(settings));
            return;
          }

          // Settings: network update
          if (req.url === '/api/settings/network/update' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            await sql`INSERT INTO user_settings (email, milestones_enabled) VALUES (${data.email}, ${data.milestonesEnabled})
              ON CONFLICT (email) DO UPDATE SET milestones_enabled = ${data.milestonesEnabled}, updated_at = NOW()`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Entity: my pages
          if (req.url === '/api/entity/my-pages' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([])); return; }
            const entities = await sql`SELECT id, type, title, slug, image_url, year FROM entities WHERE created_by = ${profile.id} ORDER BY created_at DESC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(entities));
            return;
          }

          // ── Network Posts endpoints ──

          // Upload token for client-side Blob upload
          if (req.url === '/api/network/upload-token' && req.method === 'POST') {
            const { handleUpload: hu } = await import('@vercel/blob/client');
            const response = await hu({
              body: data,
              request: req as unknown as Request,
              onBeforeGenerateToken: async () => ({
                allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'],
                maximumSizeInBytes: 10 * 1024 * 1024,
              }),
              onUploadCompleted: async () => {},
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
            return;
          }

          // Posts: create
          if (req.url === '/api/network/posts/create' && req.method === 'POST') {
            if (!data.email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const trimmedContent = data.content?.trim() || null;
            const mediaItems = Array.isArray(data.media) ? data.media : [];
            if (!trimmedContent && mediaItems.length === 0) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Post must have text or at least one media item' })); return; }
            if (trimmedContent && trimmedContent.length > 2000) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Text must be 2000 characters or fewer' })); return; }
            if (mediaItems.length > 4) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Maximum 4 media items per post' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [post] = await sql`INSERT INTO posts (profile_id, content, media) VALUES (${profile.id}, ${trimmedContent}, ${JSON.stringify(mediaItems)}) RETURNING *`;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ post }));
            return;
          }

          // Posts: list (GET with query params)
          if (req.url?.startsWith('/api/network/posts/list') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const cursor = url.searchParams.get('cursor') || undefined;
            const email = url.searchParams.get('email') || undefined;
            let viewerProfileId: number | null = null;
            if (email) {
              const [viewer] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
              if (viewer) viewerProfileId = viewer.id;
            }
            const posts = cursor
              ? await sql`
                  SELECT p.*, pr.handle, pr.display_name, pr.avatar_url,
                    (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
                    ${viewerProfileId ? sql`EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND profile_id = ${viewerProfileId})` : sql`FALSE`} AS liked_by_viewer,
                    ${viewerProfileId ? sql`(p.profile_id = ${viewerProfileId})` : sql`FALSE`} AS is_owner
                  FROM posts p JOIN profiles pr ON pr.id = p.profile_id
                  WHERE p.created_at < ${cursor}
                  ORDER BY p.created_at DESC LIMIT 20`
              : await sql`
                  SELECT p.*, pr.handle, pr.display_name, pr.avatar_url,
                    (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
                    ${viewerProfileId ? sql`EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND profile_id = ${viewerProfileId})` : sql`FALSE`} AS liked_by_viewer,
                    ${viewerProfileId ? sql`(p.profile_id = ${viewerProfileId})` : sql`FALSE`} AS is_owner
                  FROM posts p JOIN profiles pr ON pr.id = p.profile_id
                  ORDER BY p.created_at DESC LIMIT 20`;
            const nextCursor = posts.length === 20 ? posts[posts.length - 1].created_at : null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ posts, nextCursor }));
            return;
          }

          // Posts: delete
          if (req.url === '/api/network/posts/delete' && req.method === 'POST') {
            if (!data.email || !data.postId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and postId are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [post] = await sql`SELECT * FROM posts WHERE id = ${data.postId}`;
            if (!post) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Post not found' })); return; }
            if (post.profile_id !== profile.id) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not authorized' })); return; }
            const mediaItems = Array.isArray(post.media) ? post.media : [];
            const blobUrls = mediaItems.map((m: Record<string, string>) => m.url).filter(Boolean);
            if (blobUrls.length > 0) await del(blobUrls, { token: blobToken }).catch((e: unknown) => console.error('Blob cleanup error:', e));
            await sql`DELETE FROM posts WHERE id = ${data.postId}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // Posts: like (toggle)
          if (req.url === '/api/network/posts/like' && req.method === 'POST') {
            if (!data.email || !data.postId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and postId are required' })); return; }
            const [profile] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            if (!profile) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [postExists] = await sql`SELECT id FROM posts WHERE id = ${data.postId}`;
            if (!postExists) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Post not found' })); return; }
            const [existing] = await sql`SELECT id FROM post_likes WHERE post_id = ${data.postId} AND profile_id = ${profile.id}`;
            if (existing) {
              await sql`DELETE FROM post_likes WHERE id = ${existing.id}`;
            } else {
              await sql`INSERT INTO post_likes (post_id, profile_id) VALUES (${data.postId}, ${profile.id})`;
            }
            const [{ count }] = await sql`SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ${data.postId}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ liked: !existing, likeCount: parseInt(count, 10) }));
            return;
          }

          // ── Messaging endpoints ──

          // Messages: list conversations
          if (req.url?.startsWith('/api/network/messages/conversations') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const email = url.searchParams.get('email');
            if (!email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const conversations = await sql`
              SELECT c.*,
                CASE WHEN c.participant_a = ${email} THEN c.participant_b ELSE c.participant_a END AS other_email,
                p.display_name AS other_display_name, p.handle AS other_handle, p.avatar_url AS other_avatar_url,
                m.content AS last_message_content, m.sender_email AS last_message_sender,
                EXISTS(SELECT 1 FROM connections cn JOIN profiles pa ON pa.email = c.participant_a JOIN profiles pb ON pb.email = c.participant_b WHERE ((cn.from_profile = pa.id AND cn.to_profile = pb.id) OR (cn.from_profile = pb.id AND cn.to_profile = pa.id)) AND cn.status = 'accepted') AS is_friend
              FROM conversations c
              LEFT JOIN profiles p ON p.email = CASE WHEN c.participant_a = ${email} THEN c.participant_b ELSE c.participant_a END
              LEFT JOIN LATERAL (SELECT content, sender_email FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) m ON TRUE
              WHERE c.participant_a = ${email} OR c.participant_b = ${email}
              ORDER BY c.last_message_at DESC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ conversations }));
            return;
          }

          // Messages: list messages in conversation
          if (req.url?.startsWith('/api/network/messages/list') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const email = url.searchParams.get('email');
            const conversationId = url.searchParams.get('conversationId');
            const cursor = url.searchParams.get('cursor');
            if (!email || !conversationId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and conversationId are required' })); return; }
            const [conv] = await sql`SELECT id FROM conversations WHERE id = ${conversationId} AND (participant_a = ${email} OR participant_b = ${email})`;
            if (!conv) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not a participant' })); return; }
            const messages = cursor
              ? await sql`SELECT m.*, p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url, (m.sender_email = ${email}) AS is_mine
                  FROM messages m LEFT JOIN profiles p ON p.email = m.sender_email
                  WHERE m.conversation_id = ${conversationId} AND m.created_at < ${cursor} ORDER BY m.created_at DESC LIMIT 30`
              : await sql`SELECT m.*, p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url, (m.sender_email = ${email}) AS is_mine
                  FROM messages m LEFT JOIN profiles p ON p.email = m.sender_email
                  WHERE m.conversation_id = ${conversationId} ORDER BY m.created_at DESC LIMIT 30`;
            const nextCursor = messages.length === 30 ? messages[messages.length - 1].created_at : null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ messages, nextCursor }));
            return;
          }

          // Messages: poll for new messages
          if (req.url?.startsWith('/api/network/messages/poll') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const email = url.searchParams.get('email');
            const since = url.searchParams.get('since');
            if (!email || !since) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and since are required' })); return; }
            const updates = await sql`
              SELECT m.id, m.conversation_id, m.sender_email, m.content, m.created_at,
                p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url,
                (m.sender_email = ${email}) AS is_mine
              FROM messages m JOIN conversations c ON c.id = m.conversation_id
              LEFT JOIN profiles p ON p.email = m.sender_email
              WHERE (c.participant_a = ${email} OR c.participant_b = ${email}) AND m.created_at > ${since}
              ORDER BY m.created_at ASC`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ updates, serverTime: new Date().toISOString() }));
            return;
          }

          // Messages: send
          if (req.url === '/api/network/messages/send' && req.method === 'POST') {
            if (!data.email || !data.toEmail || !data.content?.trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email, toEmail, and content are required' })); return; }
            if (data.email === data.toEmail) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Cannot message yourself' })); return; }
            if (data.content.trim().length > 5000) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Message too long' })); return; }
            const [meP] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            const [toP] = await sql`SELECT id FROM profiles WHERE email = ${data.toEmail}`;
            if (!meP || !toP) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [conn2] = await sql`SELECT id FROM connections WHERE ((from_profile = ${meP.id} AND to_profile = ${toP.id}) OR (from_profile = ${toP.id} AND to_profile = ${meP.id})) AND status = 'accepted'`;
            if (!conn2) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'You can only message friends' })); return; }
            const [a, b] = [data.email, data.toEmail].sort();
            const [conv] = await sql`INSERT INTO conversations (participant_a, participant_b, last_message_at) VALUES (${a}, ${b}, NOW()) ON CONFLICT (participant_a, participant_b) DO UPDATE SET last_message_at = NOW() RETURNING id`;
            const [message] = await sql`INSERT INTO messages (conversation_id, sender_email, content) VALUES (${conv.id}, ${data.email}, ${data.content.trim()}) RETURNING *`;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message, conversationId: conv.id }));
            return;
          }

          // Messages: get or create conversation
          if (req.url === '/api/network/messages/get-or-create' && req.method === 'POST') {
            if (!data.email || !data.toEmail) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email and toEmail are required' })); return; }
            if (data.email === data.toEmail) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Cannot message yourself' })); return; }
            const [meP2] = await sql`SELECT id FROM profiles WHERE email = ${data.email}`;
            const [toP2] = await sql`SELECT id FROM profiles WHERE email = ${data.toEmail}`;
            if (!meP2 || !toP2) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const [conn3] = await sql`SELECT id FROM connections WHERE ((from_profile = ${meP2.id} AND to_profile = ${toP2.id}) OR (from_profile = ${toP2.id} AND to_profile = ${meP2.id})) AND status = 'accepted'`;
            if (!conn3) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'You can only message friends' })); return; }
            const [a, b] = [data.email, data.toEmail].sort();
            const [conv] = await sql`INSERT INTO conversations (participant_a, participant_b) VALUES (${a}, ${b}) ON CONFLICT (participant_a, participant_b) DO UPDATE SET participant_a = conversations.participant_a RETURNING *`;
            const [profile] = await sql`SELECT display_name, handle, avatar_url FROM profiles WHERE email = ${data.toEmail}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ conversation: { ...conv, other_email: data.toEmail, other_display_name: profile?.display_name || data.toEmail, other_handle: profile?.handle || null, other_avatar_url: profile?.avatar_url || null, is_friend: true } }));
            return;
          }

          // Messages: list friends available to message
          if (req.url?.startsWith('/api/network/messages/friends') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const email = url.searchParams.get('email');
            if (!email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'email is required' })); return; }
            const [meProf] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
            if (!meProf) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Profile not found' })); return; }
            const friends = await sql`
              SELECT p.email, p.display_name, p.handle, p.avatar_url
              FROM connections c
              JOIN profiles p ON p.id = CASE WHEN c.from_profile = ${meProf.id} THEN c.to_profile ELSE c.from_profile END
              WHERE (c.from_profile = ${meProf.id} OR c.to_profile = ${meProf.id}) AND c.status = 'accepted'
              ORDER BY p.display_name`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ friends }));
            return;
          }

          next();
        } catch (err) {
          console.error('API error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  envPrefix: ['VITE_', 'DATABASE_', 'RESEND_', 'BLOB_', 'OLLAMA_'],
})
