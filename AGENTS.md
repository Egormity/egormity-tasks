# Egormity Tasks repository guidance

This project contains exactly two Amazi applications with independent source roots:

- `web/` — browser UI only. It includes the Web copy of transport contracts from `api/src/api/contracts`.
- `api/` — HTTP API, local administrator authentication, Amazi PostgreSQL task board, comments, and attachments.

Treat these two roots as the maintained application source. Do not restore the retired root-level
`src/` tree or Compose deployment files. Keep the Web contract copy
in sync when changing API-owned transport contracts.

Keep credentials and application data out of source and Git. Local administrator password hashes
and session-signing values belong only in API environment configuration. Do not publish production
changes without explicit authorization.
