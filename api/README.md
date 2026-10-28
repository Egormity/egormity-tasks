# API application

This standalone Amazi application owns local accounts, administrator and manager sessions, the task
board, comments, attachment storage and PostgreSQL. Task changes publish board events over SSE.

## Code map

| Directory           | Responsibility                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `src/api/auth`      | Scrypt passwords, signed sessions, account roles and admin-only user management |
| `src/api/board`     | PostgreSQL stores, task/tag/comment/file routes, imports and board event stream |
| `src/api/contracts` | API-owned transport schemas copied to Web                                       |

`src/api/main.ts` requires the Amazi-managed `DATABASE_URL` and opens a PostgreSQL connection pool.
`src/api/app.ts` applies the schema migration, initializes the bootstrap account and composes the HTTP
routes and security checks. Tests live beside their implementation.

## Configuration

Configure these API-only environment values:

- `OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL`
- `OPERATIONS_AGENT_LOCAL_ADMIN_NAME`
- `OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH` — base64url salt and scrypt hash separated by `.`
- `OPERATIONS_AGENT_LOCAL_SESSION_SECRET` — signing secret with at least 32 characters
- `OPERATIONS_AGENT_PUBLIC_URL` — public browser origin for mutation checks
- `DATABASE_URL` — Amazi-managed PostgreSQL connection; do not copy or commit its value
- `OPERATIONS_AGENT_DATA_DIRECTORY` — legacy SQLite path; the live API no longer reads this file
- `PORT` or `OPERATIONS_AGENT_PORT` — optional listener port, default `3010`

The legacy environment prefix is retained for deployment compatibility. Authentication, board storage
and user management use these settings directly. Login throttling, HttpOnly/SameSite cookies, session
expiry, logout revocation, same-origin mutation checks and administrator-only account routes are enforced locally.

The API applies additive schema versioning at startup. To import a trusted SQLite snapshot, build first
and run `npm run migrate:sqlite -- <sqlite-file> <source-key>`. The importer checks SQLite integrity and
foreign keys, requires all destination tables to be empty, copies the existing account hashes and board
data transactionally, verifies attachment bytes, and records the source digest. Repeating an import with
the same source key and file is idempotent; a different file or populated destination is rejected.
Production SQLite data must be exported and reconciled before a production cutover; preview and production
then share the same Amazi-managed PostgreSQL database.

Run `npm ci`, then `npm run dev` from `api/`. Use `npm run typecheck`, `npm run lint`, `npm test` and
`npm run build` for validation.
