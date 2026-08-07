# Observability events

GradeDate emits newline-delimited structured JSON through `src/observability.ts`.
This is instrumentation only: there is no metrics backend or dashboard in this
change. Events include an optional request correlation ID from `x-request-id`.
The logger redacts IDs, emails, tokens, URLs, paths, photos, bios, message
content, and payment secrets.

Core funnel names: `signup.started|completed|failed`,
`photo_upload.started|completed|failed`, `grading.started|completed|failed`
(with existing `grade.fallback` for simulated fallback), `match.first_like`,
`match.created`, `premium_checkout.started|completed|failed`,
`report.submitted|failed`, and `operational.failure`.

Emission locations: `src/api-handler.ts` signup, upload, multi-photo grading,
like/match, report, Stripe checkout, and existing Stripe webhook handlers.
Existing `stripe.subscription_cancelled` covers cancellation webhooks. Existing
request, provider, moderation, retention, and webhook failure events remain in
place. There is no separate support-response path, so support timing is not
instrumented.
