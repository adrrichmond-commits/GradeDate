# Production readiness

## Database readiness

`GET /api/ready` is a dependency probe. It returns `200` only after the runtime
can execute `SELECT 1` against the configured Neon database. It returns `503`
with one of these safe reason codes: `not_configured`, `invalid_config`, or
`query_failed`. It never returns the connection string or provider error.

A production `DATABASE_URL` must be the complete Neon Postgres connection string,
for example `postgresql://user:password@ep-example.us-east-2.aws.neon.tech/dbname?sslmode=require`.
Do not commit or paste the real value into source control, tickets, or logs.

### Operator action when readiness is unhealthy

1. In the production Vercel project's **Settings → Environment Variables**, set
   `DATABASE_URL` for the **Production** environment to the current Neon
   connection string (not a placeholder, and not a preview-only variable).
2. Redeploy production so the function receives the updated variable. A redeploy
   is required after changing environment variables.
3. Request `https://<production-domain>/api/ready` and confirm HTTP `200` with
   `{ "ok": true, "status": "ready" }`.

If the result is `invalid_config`, correct the URL format/host. If it is
`query_failed`, verify the Neon database is available and the production secret
is current. No code change can recover an unavailable or unknown owner secret.

### Prebuilt deployment note

`bun run go-live` must not override the Vercel project variable with the sandbox's
injected `DATABASE_URL`. The deployment script forwards a value only when it is a
whitespace-free `postgres://` or `postgresql://` URL; other values are ignored so
the prebuilt deployment inherits Vercel's Production environment variable. This
protects deployments from provider management URLs such as `https://...` that are
not database connection strings.
