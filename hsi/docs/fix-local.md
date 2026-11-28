# HSI local login: root cause and fix

**Runbook — local environment** · hsi-app · Vite dev server · Neon Postgres · 2026-11-11

What broke the OTP login flow on localhost, what was changed to get past it, and the exact steps to put the same working state on a different machine.

## What happened

Signing in at `/login` with the backup OTP code failed with _"Something went wrong. Please try again."_ The failure traced back to two separate gaps between this project's **local dev mock** of the auth API (inside `vite.config.ts`) and its **real** handler code (`api/auth/*.ts`), which only runs in production.

## Root causes

### Cause 1 — The dev mock always checks the applications table

`vite.config.ts` contains its own hand-written copy of `/api/send-otp`, separate from `api/auth/_send-otp.ts`. The real handler only consults the `applications` table when `APPLICATION_GATE_ENABLED=true` — off by default, so any new email can sign in. The dev copy skipped that check and **always** looked the email up in `applications`, returning `{"exists": false}` for anything not already approved there. The login page doesn't recognize that response shape, so it fell through to the generic error.

### Cause 2 — OTP_BACKUP_CODE never reached the server process

`vite.config.ts` forwards only a handful of variables from `.env.local` into `process.env` for its dev middleware — `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `OLLAMA_HOST`, `OLLAMA_MODEL`. `OTP_BACKUP_CODE` isn't on that list, so even after Cause 1 was worked around, the backup-code check in `/api/verify-otp` saw `undefined` and rejected the code.

## What was changed to fix it

No source file was edited. Both fixes are local state: one database row, and how the dev server was launched.

1. **Approve the test email in `applications`** — inserted one row so the dev mock's gate check passes for the address used to sign in.

   ```sql
   INSERT INTO applications (first_name, last_name, email, status)
   VALUES ('Paco', 'Test', 'paco@test.com', 'approved')
   ON CONFLICT (email) DO UPDATE SET status = 'approved';
   ```

2. **Restart the dev server with the backup code exported** — launched Vite with `OTP_BACKUP_CODE` set directly in the shell, so it lands in `process.env` regardless of what the Vite config forwards from `.env.local`.

   ```bash
   OTP_BACKUP_CODE=123456 npm run dev
   ```

3. **Verified both endpoints directly** with curl before touching the browser:

   | Request                | Before             | After              |
   | ---------------------- | ------------------ | ------------------ |
   | `POST /api/send-otp`   | `{"exists":false}` | `{"success":true}` |
   | `POST /api/verify-otp` | `401` invalid code | `{"valid":true}`   |

## Replicate on another machine

Everything above was local state, not code — so a fresh clone needs these same steps repeated. `.env.local` is gitignored and never travels with the repo.

1. **Prerequisites** — Node 20+ and npm. A Neon connection string for a database that already has `schema.sql` applied (or run that file once with `psql` if starting from empty).

2. **Create `.env.local` in the project root:**

   ```
   DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
   OTP_BACKUP_CODE="123456"
   ```

3. **Install dependencies:**

   ```bash
   npm install
   # if that fails with EACCES on ~/.npm:
   npm install --cache=/tmp/npm-cache-hsi
   ```

4. **Approve whichever email you'll sign in with** — required every time, on every machine and for every new test email; this is the dev-only gate from Cause 1, not a one-time setup step. Run via `psql`, or through any Postgres client pointed at the same `DATABASE_URL`.

   ```sql
   INSERT INTO applications (first_name, last_name, email, status)
   VALUES ('Your', 'Name', 'you@example.com', 'approved')
   ON CONFLICT (email) DO UPDATE SET status = 'approved';
   ```

5. **Start the dev server with the backup code exported** — plain `npm run dev` is not enough; the variable has to be in the shell's environment when Vite's Node process starts, not just in `.env.local`.

   ```bash
   OTP_BACKUP_CODE=123456 npm run dev
   ```

6. **Sign in** — open `http://localhost:5173/login`, enter the email approved in step 4, and enter `123456` when asked for the verification code.

## If you'd rather fix it for real

Both causes are bugs in `vite.config.ts`'s dev-only auth mock, not in the product's real auth code. The permanent fix — not applied here, since the local workaround was preferred — would be to delete that duplicated mock and route `/api/send-otp`, `/api/verify-otp`, and `/api/check-email` through the existing `delegated` import map the same way `/api/vault/assistant` and the other real handlers already are, and forward `OTP_BACKUP_CODE` and `RESEND_API_KEY` into `process.env` alongside `DATABASE_URL`. That would make `applications` approval unnecessary for local sign-in, matching production's gate-off-by-default behavior.

---

_hsi-app · local dev · no files modified_
