# Secrets Hygiene & Rotation Plan

Status: audit complete 2026-08 — **no credentials were ever committed to the
repository**, so no history rewrite was performed and no emergency rotation is
required. This document records the audit, the conventions that keep it that
way, and the rotation steps to run if you ever choose to rotate.

## Audit findings (git history + working tree)

- `.env` and `.env.local` were **never tracked** in git history. Searched all
  commits (`git log --all`) for any `.env*` file path and for the names
  `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`,
  `OPENAI_API_KEY`, `VERCEL_OIDC_TOKEN`, `DATABASE_URL`. The only matches are
  **code references** (e.g. `process.env.VAPID_PRIVATE_KEY`) — zero lines
  contain an actual secret value assigned to a variable.
- `.gitignore` already ignores `.env`, `.env.local`, and `.env*`.
- A live secret scan of every tracked file (assignment patterns like
  `VAR=<16+ char value>`, excluding `process.env.X` references) returns zero
  matches. A regression test enforces this: `src/env-hygiene.test.ts`.

## What the designer saw

- `.env` (local dev) contains `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — real
  values on the shared sandbox machine, but gitignored and untracked.
- `.env.local` contains `VERCEL_OIDC_TOKEN` — the Vercel CLI auth token for
  this sandbox, gitignored and untracked.

These are local machine files. They are not in the repo, not in any commit,
and not exposed through the published site.

## Conventions (now enforced)

- Real env files stay untracked: `.env`, `.env.local` (`.gitignore`).
- Placeholder templates are tracked and kept free of real values:
  - `.env.example` — all app/runtime env vars with `your_..._here` placeholders.
  - `.env.local.example` — Vercel CLI token placeholder.
- Never commit a `.env` file, a real token, or a key. If you must share config,
  update the template with a placeholder instead.

## Rotation plan (owner action — only if you choose to rotate)

Nothing was leaked, so rotation is **optional**. If you want to rotate anyway:

### VAPID keys (web push)
1. Generate a new pair: `npx web-push generate-vapid-keys`
2. Replace `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in the local `.env`.
3. Update the Vercel project env vars (Settings → Environment Variables).
4. Restart the local server (`bun run publish`) and redeploy to Vercel.
5. Existing push subscriptions will need to re-subscribe (service worker gets
   the new public key automatically on next load).

### VERCEL_OIDC_TOKEN (sandbox only)
1. Regenerate in Vercel account settings (the integration can also refresh it).
2. Update `.env.local` on this machine. Nothing else reads it.

### Stripe / OpenAI / Resend / Neon / Blob (production)
These live only in Vercel env vars, never in the repo. Rotate per the
provider's console (Stripe: roll secret keys + regenerate the webhook signing
secret and update `STRIPE_WEBHOOK_SECRET`).

## Anonymous upload retention (summary)

Anonymous free-preview photos (`anon_*`, no DB record) are now cleaned up:
- deleted immediately after grading (`/api/grade`, anonymous path);
- TTL sweep (24h default) on the local server at startup + every 6h
  (`serve.ts`), throttled on every anonymous upload (`/api/upload`), and via
  the manual script `bun run cleanup:anon-uploads` for cron use.
- Authenticated/profile uploads (`<userId>_...`, DB-recorded) are never
  touched — see `src/anon-upload-retention.ts`.
