# Safety retention and audit controls

- Privileged admin audit events are **append-only and immutable**: the database trigger
  (`deny_admin_audit_mutation`, created in `src/db.ts` init) rejects UPDATE and DELETE, and
  application code has only the server-side insert helper. `AUDIT_RETENTION_MONTHS` (24) is a
  retention **floor**, not an expiry — the scheduled job never attempts to delete audit events,
  so they are never purged by `runRetentionCleanup`.
- Safety reports (`reports`) are retained for **12 months after resolution**, then deleted by
  the scheduled retention job. Exemptions: `legal_hold = true` reports are never deleted, and a
  report is kept while a `pending`/`active` appeal exists on a suspension raised from it
  (appeals → user_suspensions.source_report_id → reports.id).
- Quarantined photo cases (`photo_moderation_cases`) and their private review blobs have a
  **30-day default retention**: `retention_until` is set at case creation to
  `NOW() + 30 days`, and the sweep purges the blob (via the private-store provider) once the
  case is resolved (`approved`/`removed`/`restored`) and its retention window has elapsed.
  **Stale unresolved cases of deleted users** (case survives account deletion via the
  `ON DELETE SET NULL` FKs; `user_id IS NULL`) are swept after **12 months**
  (`STALE_UNRESOLVED_CASE_RETENTION_MONTHS`, matching evidence retention) because they can
  never be reviewed. `legal_hold = true` cases are NEVER purged early; unresolved cases with a
  live user stay in the review queue. Quarantine remains private and fail-closed when review
  storage/signing is not configured (without a provider the photo sweep is skipped).
- Account deletion is **immediate**: messages are hard-deleted when either party's account is
  deleted (there is no 30-day post-deletion message purge), and message moderation flags
  cascade with the messages. Flagged/under-investigation message content is therefore NOT
  retained beyond account deletion of either party — see the note at the bottom of this file.
- Audit metadata is allowlisted to coarse lifecycle fields. Paths, URLs, bytes, tokens,
  message bodies, reporter identity, and arbitrary request payloads are never persisted.
- Production privileged access remains gated on MFA configuration; this document does not
  claim an MFA flow is complete. The code contract also requires a session no longer than 15
  minutes, checks revocation on every request, and requires reauthentication within 5 minutes
  for destructive actions.
- `runRetentionCleanup` in `src/retention-cleanup.ts` is the callable, idempotent cleanup
  contract. Production operations must invoke it from an authenticated server-side scheduler
  at least daily, monitor its result/failure, and retry failures. Scheduling is configured as
  the daily Vercel Cron route `/api/cron/retention`; set a long random `CRON_SECRET` in Vercel
  Production. The endpoint requires `Authorization: Bearer <CRON_SECRET>`, fails closed when
  missing or invalid, and never exposes the secret. Database credentials remain operator
  configuration. It never removes active appeals or legal holds.
- The custom prebuilt deployment runs `scripts/vercel-output-config.ts` during
  `build-vercel.sh`. It always writes the retention cron (`RETENTION_CRON` in that script) into
  `.vercel/output/config.json`, because `vercel deploy --prebuilt` consumes Build Output API
  metadata rather than translating the source project config at deploy time. `vercel.json`
  itself carries no `crons` key — the cron is declared only in the generated Build Output
  config, so git-triggered builds (which read both files) register it exactly once.
- **Heartbeat / observability:** each cron run upserts one singleton row in
  `retention_cron_state` (`src/retention-cron-state.ts`) with the run time, outcome
  (success/failure), result counts, and a consecutive-failure streak. The write is
  best-effort and never changes the cron response. `GET /api/ready` exposes the last-run
  state read-only and fail-closed as `retention` (`null`/absent when never run or unreadable);
  it contains only coarse operational facts — no user data, blob keys, or secrets.

## Known gap (product decision pending)

Flagged/under-investigation **message** content is lost on account deletion: `deleteUserAccount`
hard-deletes the messages and the reports referencing either party, and `message_moderation_flags`
cascades with the messages. A report's `target_message_id` is `ON DELETE SET NULL`, so even a
surviving report cannot reference message content. This means the 12-month evidence-retention
goal does not hold for flagged messages once either the reporter or the reported user deletes
their account. Photo evidence is covered (quarantined blobs are purged only by the retention
sweep), but message evidence is not. Fixing this requires a product decision on privacy-vs-
evidence (e.g., preserve an evidence excerpt in a user-independent store, or exempt
under-investigation/legal-hold reports from account deletion with user references set NULL).
