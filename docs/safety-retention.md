# Safety retention and audit controls

- Privileged admin audit events are append-only and retained for 24 months. The database trigger rejects UPDATE and DELETE; application code has only the server-side insert helper.
- Safety reports are retained for 12 months after resolution, then eligible for privacy-safe deletion by the scheduled retention job.
- Quarantined photo cases and their private review objects have a 30-day default retention. Quarantine remains private and fail-closed when review storage/signing is not configured.
- Audit metadata is allowlisted to coarse lifecycle fields. Paths, URLs, bytes, tokens, message bodies, reporter identity, and arbitrary request payloads are never persisted.
- Production privileged access remains gated on MFA configuration; this document does not claim an MFA flow is complete.
