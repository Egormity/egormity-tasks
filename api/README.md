# API application

This standalone Amazi application owns local administrator authentication, the task-board API,
attachment storage, SQLite, and an optional HTTP relay to the separately hosted Gateway worker.
The API stays useful for sign-in and board management when Gateway settings are absent.

## Code map

| Directory            | Responsibility                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `src/api/auth`       | Scrypt password verification, signed administrator sessions, optional work confirmations |
| `src/api/board`      | SQLite schema/store, task/tag/comment/file routes, and board event stream                |
| `src/api/task-agent` | Board-to-Gateway context, chat associations, and scoped task verdicts                    |
| `src/api/relay`      | Allowlisted streaming HTTP relay when a Gateway worker is configured                     |
| `src/api/contracts`  | API transport schemas and Web-shared contracts                                           |

`src/api/main.ts` reads configuration and opens `/data/chats.sqlite`; `src/api/app.ts` composes the
HTTP routes and security checks. Tests are kept beside their implementation.

## Local authorization

The API does not use Amazi `/auth/token` or `/auth/session`. Configure these API-only environment
values instead:

- `OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL`
- `OPERATIONS_AGENT_LOCAL_ADMIN_NAME`
- `OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH` — base64url salt and scrypt hash separated by `.`
- `OPERATIONS_AGENT_LOCAL_SESSION_SECRET` — random signing secret, at least 32 characters

Login throttling, secure HttpOnly/SameSite cookies, session expiry, logout revocation, same-origin
mutation checks, and administrator-only API routes remain enforced locally.

Gateway functionality is activated only when both `OPERATIONS_AGENT_WORKER_URL` and
`OPERATIONS_AGENT_WORKER_TOKEN` are present. Do not configure a separate worker application here.
