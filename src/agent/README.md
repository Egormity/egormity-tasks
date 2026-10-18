# Gateway Agent

`main.ts` validates configuration/instruction files and starts `app.ts`.
`app.ts` exposes the private authenticated bridge consumed by the main API.

| Directory          | Responsibility                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `codex`            | Native RPC transport, daemon connection, chat bridge, account and model/process controls |
| `history`          | Native turn activity and persisted-history change observation                            |
| `workspace`        | Git worktrees, conversation file storage and configured SSH access                       |
| `instructions`     | One shared Markdown instruction file, loading and instruction-source context             |
| `tasks`            | Trusted board snapshot preparation and the scoped verdict CLI helper                     |
| `testing/fixtures` | Fake native subprocess for transport tests                                               |

`instructions/agent.md` applies to all chats. `OPERATIONS_AGENT_INSTRUCTIONS_FILE` can override
its location. An attached task triggers assessment and verdict saving according to this same file;
Main supplies task data, not an instruction profile. The file supplements the native profile's
global instructions and working repository's AGENTS.md. It is not stored in the frontend or board
database. Existing chats receive updates before their next new turn; active turns retain their
current instructions.

For attached tasks, this file also documents read-only SSH access to the main board database at
`/var/www/amazi-internal-tasks/.runtime/operations-agent/data/chats.sqlite`, its JSON tables and
attachment BLOB lookup. The agent retrieves references into its Gateway worktree and opens them;
the browser does not need to resend existing task files. Verdict writes still use the scoped helper.

`tasks/task-context.ts` stores the private verdict capability and exposes only a helper invocation
to Codex. `tasks/submit-verdict.mjs` sends the assessment to main; it does not open SQLite or change
task status. The build copies this helper beside `dist/agent/main.js` so the invocation works in
development and the production image.

This app owns no board database and no duplicate chat storage. It reuses native Codex threads,
events and history. Disconnecting from a shared daemon never stops the daemon or its CLI tasks.
Loaded threads use live native activity before persisted turn rows and writer locks; idle recovered
threads remain interrupted in snapshots and Stop uses the same activity reader as session status.

`codex/session-status.ts` serves `/session-status?chatId=…` separately from lightweight connection
health. It projects native account/limit data and selected-thread settings/activity without exposing
raw configuration or credentials. `history/token-usage.ts` reads the last valid native `token_count`
from at most 8 MiB of the Codex-provided rollout's tail. Missing/older counters stay unavailable;
no second history database or estimated token counts are introduced. Separate CLI-owned chats
remain readable even when native resume/control is unavailable.

Run from the repository root: `npm run build:agent`, `npm run start:agent`, `npm run test:codex`.
Native tests use isolated profiles and a local model fixture. Unit/integration tests are colocated.
