# API application

This standalone Amazi application owns local accounts, administrator and manager sessions, the task
board, comments, attachment storage and SQLite. Task changes publish board events over SSE.

## Code map

| Directory           | Responsibility                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `src/api/auth`      | Scrypt passwords, signed sessions, account roles and admin-only user management |
| `src/api/board`     | SQLite stores, task/tag/comment/file routes, imports and board event stream     |
| `src/api/contracts` | API-owned transport schemas copied to Web                                       |

`src/api/main.ts` reads configuration and opens `chats.sqlite` in the configured data directory.
`src/api/app.ts` composes the HTTP routes and security checks. Tests live beside their implementation.

## Configuration

Configure these API-only environment values:

- `OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL`
- `OPERATIONS_AGENT_LOCAL_ADMIN_NAME`
- `OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH` — base64url salt and scrypt hash separated by `.`
- `OPERATIONS_AGENT_LOCAL_SESSION_SECRET` — signing secret with at least 32 characters
- `OPERATIONS_AGENT_PUBLIC_URL` — public browser origin for mutation checks
- `OPERATIONS_AGENT_DATA_DIRECTORY` — optional; defaults to `/data` in production and `.runtime/data` locally
- `PORT` or `OPERATIONS_AGENT_PORT` — optional listener port, default `3010`

The legacy environment prefix is retained for deployment compatibility. Authentication, board storage
and user management use these settings directly. Login throttling, HttpOnly/SameSite cookies, session
expiry, logout revocation, same-origin mutation checks and administrator-only account routes are enforced locally.

Run `npm ci`, then `npm run dev` from `api/`. Use `npm run typecheck`, `npm run lint`, `npm test` and
`npm run build` for validation.
