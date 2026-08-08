# Private photo review storage

This slice provides the server-only storage/signing contract for quarantined photos. It does **not** implement the report queue, moderation UI, object-store adapter, or API route.

## Production configuration

Set both variables in the production runtime; the contract fails closed otherwise:

- `GRADEDATE_PRIVATE_REVIEW_STORAGE=true`
- `GRADEDATE_REVIEW_SIGNING_KEY`: a random secret of at least 32 characters (never commit or log it)

A future private object-store adapter may additionally require `BLOB_READ_WRITE_TOKEN`, but the existing public profile-photo Blob path must not be reused. The provider must keep objects private and implement `put`, `get`, and `delete` behind an authorized server route.

Review access is restricted to owner/admin/moderator roles, requires recent reauthentication, and expires after five minutes. Tokens are HMAC-signed and bound to the quarantine case and object key. Tampered, expired, suspended, unauthorized, or misconfigured requests fail closed. Callers receive bytes only after authorization; this module never creates public URLs.

Audit and API callers should use `redactReviewAccess` (and the existing quarantine/audit redaction helpers). Object keys, paths, URLs, signed tokens, and bytes must never be persisted or returned. Existing retention cleanup remains the lifecycle contract: resolved quarantined cases/private objects default to 30 days, except legal holds and active appeals.
