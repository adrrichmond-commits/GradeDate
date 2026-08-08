# Safety retention and audit controls

- Privileged admin audit events are append-only and retained for 24 months. The database trigger rejects UPDATE and DELETE; application code has only the server-side insert helper.
- Safety reports are retained for 12 months after resolution, then eligible for privacy-safe deletion by the scheduled retention job.
- Quarantined photo cases and their private review objects have a 30-day default retention. Quarantine remains private and fail-closed when review storage/signing is not configured.
- Audit metadata is allowlisted to coarse lifecycle fields. Paths, URLs, bytes, tokens, message bodies, reporter identity, and arbitrary request payloads are never persisted.
- Production privileged access remains gated on MFA configuration; this document does not claim an MFA flow is complete. The code contract also requires a session no longer than 15 minutes, checks revocation on every request, and requires reauthentication within 5 minutes for destructive actions.
- `runRetentionCleanup` in `src/retention-cleanup.ts` is the callable, idempotent cleanup contract. Production operations must invoke it from an authenticated server-side scheduler at least daily, monitor its result/failure, and retry failures. Scheduling is configured as the daily Vercel Cron route `/api/cron/retention`; set a long random `CRON_SECRET` in Vercel Production. The endpoint requires `Authorization: Bearer <CRON_SECRET>`, fails closed when missing or invalid, and never exposes the secret. Database credentials remain operator configuration. It never removes active appeals or legal holds.

The custom prebuilt deployment runs `scripts/vercel-output-config.ts` during `build-vercel.sh`. This explicitly carries the `crons` entry from `vercel.json` into `.vercel/output/config.json`, because `vercel deploy --prebuilt` consumes Build Output API metadata rather than translating the source project config at deploy time.
