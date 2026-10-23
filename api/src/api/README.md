# Main API

`main.ts` loads `config.ts`, opens the board database and starts `app.ts`.
`app.ts` composes security headers, authentication, feature routes and error handling.

| Directory    | Responsibility                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `auth`       | Password-backed admin/manager accounts, admin-only user management, Telegram challenges and work-session grants |
| `board`      | SQLite store, task/tag/file routes, invalidation SSE and offline bundle import                                  |
| `task-agent` | One native chat per task, scope filtering, trusted task context and verdict API                                 |
| `relay`      | Allowlisted authenticated Gateway forwarding and streaming responses                                            |
| `contracts`  | Transport schemas shared directly with Web/Gateway; generated Codex types under `codex`                         |

A browser message is authenticated, associated with a board task if applicable, confirmed through
Telegram when needed, enriched with a trusted task snapshot and relayed to Gateway. The snapshot's
verdict credential is scoped to one task/chat/revision. Its dedicated callback validates that scope
without exposing browser or generic Gateway credentials. Board writes publish SSE invalidations.

SQLite stores board, account and association data. Codex messages and native history stay on Gateway.
`auth/user-store.ts` stores workspace identities beside the board data. The configured administrator
is bootstrapped once; user passwords are scrypt-hashed, sessions resolve their current role from the
database, and password or role changes invalidate existing sessions. Managers can use the workspace,
while only admins can list or edit accounts. The Users route validates roles server-side and
prevents changing the signed-in account's role.
`board/comments/` owns multipart comment routes and the additive `task_comments` schema. File bytes
share `task_files`; author data comes from the authenticated session. A single transaction saves
the comment, files, task revision and history event before publishing a board SSE invalidation.
Stable request IDs make retries idempotent; replay with a different task, author or payload conflicts.
Only this process writes the board database. The import command requires the API to be stopped.

Run from the repository root: `npm run build:api`, `npm run start:api`, `npm test -- src/api`.
The importer still builds to `dist/api/import-main.js`; its source is `board/import-main.ts`.
API/board boundary tests stay beside their implementation; `app.test.ts` tests the full HTTP app.
