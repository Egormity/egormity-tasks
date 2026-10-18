# Egormity Tasks

Independent task board and Amazi Agent, a web client for the server's Codex CLI.
Extracted from Amazi commit `009624016419f8cb31157908ba06c488ee541c8d` on 2026-10-11.
Canonical repository: https://github.com/Egormity/egormity-tasks.
Moved from `amazi-internal-tasks` commit `a489e5d1e46265d34bee5373e244e0a0e425064f`
on 2026-10-18, including Web, API and the Gateway bridge. Production routes, authentication and
existing runtime data remain compatible. See [the database migration runbook](MIGRATION.md)
for the private production export and verified import procedure.

## Structure

One npm project, one package.json, one lockfile. No workspace packages.

```text
src/
  web/                         # Main server: React frontend
    main.tsx                   # Browser entry point
    app/                       # Shell, navigation and routes
    features/
      board/                   # Cards, editor, attachments, tags, DnD and task discussion
      agent/                   # Conversation, composer, requests and live state
      auth/                    # Administrator sign-in
      confirmation/            # Telegram confirmation dialog and hook
    shared/                    # HTTP client, localization, preferences and UI primitives
  api/                         # Main server: HTTP composition in app.ts, entry in main.ts
    auth/                      # Administrator sessions and Telegram work confirmation
    board/                     # SQLite, CRUD, files, SSE and bundle import
    task-agent/                # Chat associations, task context and verdict writes
    relay/                     # Streaming HTTP relay to Gateway
    contracts/                 # Shared transport types and generated native protocol
  agent/                       # Gateway: HTTP composition in app.ts, entry in main.ts
    codex/                     # Native RPC connection, bridge, account and controls
    history/                   # Native history observation and turn activity
    workspace/                 # Git worktrees, attachments and SSH
    instructions/              # Loading/context and one shared agent.md
    tasks/                     # Task context and verdict submission helper
    testing/fixtures/          # Fake Codex subprocess for integration tests
```

Each application keeps its entry point and configuration at its root. Tests live beside their
implementation. Feature folders own their UI, state and utilities; shared code contains only
cross-feature primitives. `@/` resolves inside Web, and `@contracts/` imports the API-owned transport
files directly, without another package. Build output and launch commands are unchanged.
See the [Web map](src/web/README.md), [API map](src/api/README.md) and
[Gateway map](src/agent/README.md) for entry points, ownership and request flows.

The frontend and HTTP API are separate applications and containers on the main server at `tasks.amazi.pro`.
Only Codex and its bridge run on Gateway. There are no imports from the Amazi monorepo.
Administrator identity is validated through the external `/auth/token` and `/auth/session` endpoints.
The browser never receives the bridge token. Web contains no server code or database.

The board keeps its own SQLite database, including one task-to-chat association per task. Chats have no application database: native Codex owns
session IDs, names, turns and history under `CODEX_HOME`. Existing board volumes retain the
`data/chats.sqlite` filename; obsolete chat tables in old volumes are unused.
The local transfer retained 146 tasks, 7 tags, 853 events and 142 files.
No old application chat contained messages.

## Development

Requires Node 24+, npm, Git and Codex CLI 0.162.1.

```sh
cp .env.example .env
# Set OPERATIONS_AGENT_REPOSITORY to the Git repository Codex should work on.
npm ci
npm run dev
```

Local development also supports `pnpm install` and `pnpm run dev` with pnpm 11.
`pnpm-workspace.yaml` contains only the build-script permission for esbuild; it adds no workspace
packages. Keep `allowBuilds.esbuild: true` so pnpm can prepare the binary used by Vite and tsx.
Docker builds continue to use the canonical `package-lock.json` with `npm ci`.

One command starts the frontend on **5176**, main HTTP API on **3010**, and Codex bridge on **3011**.
Open http://localhost:5176. Ctrl+C stops all three. The frontend port is strict.
The identity API defaults to http://localhost:3000; configure `OPERATIONS_AGENT_API_URL` to change it.
Local `.env` is read by the dev launcher. Bridge tokens, board data and worktrees live under ignored
`.runtime/operations-agent`. Existing local data is preserved there.
Vite excludes `.runtime` from file watching, so creating a chat worktree does not trigger a page
reload from its `tsconfig.json` or HTML files and interrupt the first message's confirmation.
Local Agent reuses the CLI's current `CODEX_HOME`, or `~/.codex` when unset, so an existing Codex login
works immediately. Native settings, instructions and chat history come from that same profile.
It does not create or overwrite global instructions in your local profile. Native proxy/CA settings
and Linux keyring access retain their environment. To use a separate profile, explicitly set
`OPERATIONS_AGENT_CODEX_HOME`; this takes precedence over `CODEX_HOME`.
Amazi's own dev commands do not launch this repository.

```sh
npm run typecheck
npm run lint
npm test
npm run test:codex
npm run build
```

The native Codex tests use isolated profiles to verify thread persistence and instruction updates
against a local model fixture, without authenticating or calling an external model. HTTP/subprocess tests cover events, files,
admission and retries. `npm run generate:codex` regenerates native protocol types with the pinned CLI.
UI dependencies are build-time dependencies; production API and Agent processes need only Express and Zod.
The Web container serves static assets with Nginx and proxies `/api/` to the API container.

## Chats and context

### Telegram confirmation

The first agent action requires a six-digit code sent to the configured Telegram topic.
Enter it within five minutes. The code is single-use and bound to the administrator's current
browser session and exact first action (chat, request ID, text, attachments and model settings).
Pasting a full code replaces the field's previous value. Spaces, formatting marks and the bot's
`Код:` line are supported; when pasting the whole Telegram message, only that code line is used.
Cancelling preserves the draft. Successful verification confirms this browser session while its
accepted native turns run and for **five minutes after they finish**, including interrupted/failed
turns. A new task sent during that interval continues the confirmed work session without another
code. Follow-ups, answers to questions/approvals, model settings and compaction use that session.
With overlapping chats, the last tracked turn's completion starts the grace period. An unrelated
CLI turn never extends it. Native completion timestamps determine expiry even with the browser
closed; reading chats or refreshing the page does not renew confirmation. The API checks native
activity on protected requests, without adding background polling. Gateway failures cannot grant
new access. Logout, a different login session or an API restart requires confirmation again.
Connecting a Codex account remains a separately confirmed account action. Stopping a turn or its
background terminals remains immediately available.

The API enforces confirmation before forwarding to Gateway; direct requests cannot bypass the dialog.
Only explicit relay routes are exposed. Codes are never sent to Codex or returned in browser API
responses. The API holds keyed code hashes, request fingerprints, hashed session grants and tracked
native turn IDs in memory; restarting invalidates them. No chat database or message queue is added. Resending invalidates
the previous code, is limited to once per 30 seconds, and five wrong attempts invalidate a code.
Five wrong attempts across codes also block confirmations for that account for 15 minutes.
Issuance is capped at 120 requests per account per hour and 10 requests globally per minute.

Set `OPERATIONS_AGENT_TELEGRAM_URL` to the existing Gateway's `/telegram/sendMessage` endpoint and
`OPERATIONS_AGENT_TELEGRAM_TOKEN` to its server-side bearer credential. The Gateway owns the bot token.
`OPERATIONS_AGENT_TELEGRAM_CHAT_ID=-1004381042765` and `OPERATIONS_AGENT_TELEGRAM_THREAD_ID=210`
select [the requested group topic](https://t.me/c/4381042765/210). The browser cannot change the destination.
The topic uses Telegram's [sendMessage `message_thread_id`](https://core.telegram.org/bots/api#sendmessage).
The message includes the request reference, administrator, text preview and attachment count.
Missing configuration or failed/misdirected delivery blocks agent actions; there is no fallback bypass.
Administrator login and read access to the board and existing chats continue to use Amazi authentication.

### Native chats

Each web chat is exactly one native Codex thread. New chats get a Git worktree from the repository
configured by `OPERATIONS_AGENT_REPOSITORY`; existing chats keep their native cwd and history.
This working repository is independent of this application's source.
Renaming updates the native thread name. Follow-up messages resume that same thread.
During an active turn, messages and attachments go through native `turn/steer` with its expected
turn ID, just like a clarification in CLI. If that turn has changed, the error leaves the draft
available for review; the bridge never silently starts a replacement turn. Sending is blocked only
while the current submission/confirmation is in progress, not while Codex works. Other chats can
start independently. Request IDs prevent duplicate submissions; no application queue is added.
The selected thread is stored in `/agent?chat=<thread-id>` so reloads, direct links and browser
Back/Forward restore the conversation. Switching to Tasks and back keeps the selected chat.
Navigation uses browser history without a page reload. Existing `/#/tasks` and `/#/agent`
links are converted to their path URLs, preserving task/chat parameters without adding a history
entry. Direct links and refreshes are served by the Web container's SPA fallback.

The web client renders messages, commentary, plans, command output, diffs and exposed progress
summaries when they contain text; empty progress items have no placeholder. Other tool items remain
visible as native JSON. The live inspector receives every native
notification; its connection log is only browser memory. After reload, history comes from Codex.
Chats running in a separate CLI process with the same `CODEX_HOME` also update automatically.
The bridge observes native history-store metadata and legacy session files, coalesces changes into
at most one SSE invalidation per second, and the browser rereads history in the background. Updates
appear after Codex persists them. When a native daemon is running, the bridge connects to its private
`CODEX_HOME/app-server-control/app-server-control.sock` using WebSocket and rejoins the selected
thread. Live events, approval requests and controls then use the same native process as CLI.
Rejoining a loaded thread subscribes to it without restarting or replaying its turn. Separate CLI
processes without that shared socket expose persisted history only; controls report that the chat
must be reopened through the native daemon. The bridge never kills an unrelated OS process.
No session contents are copied into another database. Monitoring stops when no SSE clients remain.
Background refreshes preserve the draft, expanded items and scroll position; changes received during
a read trigger a follow-up read. The periodic authenticated SSE reconnect is not the refresh clock.
Paginated histories refresh from the last known turn, including its updated items, instead of
downloading the entire conversation each time. Missing anchors/rollbacks fall back to a full read.
On Linux, external activity combines Codex 0.162.1's native `thread_turns` state (read-only) with
the thread's live writer lock in `/proc/locks`. For threads loaded by the connected native process,
live thread status and the current turn take precedence: an idle loaded thread can retain a writer
lock and an unfinished history row after recovery. Such a row must not revive the Working indicator.
The snapshot, activity endpoint and Stop control reconcile that same native state without rewriting
stored history. Separate processes still use lock-backed evidence. This corrects Codex's reconstructed `interrupted` status for live
external turns and powers the header, conversation-list and current-turn activity indicators.
Header activity is scoped to the selected thread; another chat's running turn never makes a new
draft appear busy. The connection indicator still shows whether Gateway is available.
Activity does not disable the composer. Stop targets the selected native thread, including chats
owned by the shared daemon; it never interrupts every chat globally.
The chat uses the available workspace width. History and the desktop conversation list scroll
independently, while the header and composer stay visible. Long text wraps; wide code scrolls
horizontally inside its block. Commands, file changes and native events expand as disclosures;
expanded output scrolls vertically with the conversation, without nested scroll areas.
On narrow screens, a compact conversation selector replaces the list. Below 768 px, the main
navigation, appearance/language settings and account controls live in a hamburger drawer.
The drawer closes on navigation, Escape, tapping outside, or switching to the desktop layout;
closing it returns keyboard focus to the menu button. The chat remains mounted while it is open.
Selecting a chat immediately shows its name and a history-loading indicator; the new-chat welcome
appears only after an empty history loads. Failed loads show a retry action.
Approvals and structured questions have response controls. MCP elicitation requests show the server's
question and tool parameters directly: empty forms offer **Approve once**, **Decline** and **Cancel**;
standard forms render text, numbers, yes/no and single/multiple-choice fields with schema validation.
URL requests offer an explicit HTTP(S) link and **Done**; opening a link never sends an answer.
Replies use native MCP `action`, `content` and `_meta` fields and pass through the same work-session
confirmation as other Codex answers. Cancelling Telegram confirmation preserves the question and
entered values. Approval is for one request, without session-wide or permanent permission grants.
Unfamiliar request modes or unsupported schemas retain a manual JSON reply instead of dropping fields.
No automatic approval or automatic prompt replay is added. User messages have a tinted background,
an accent border and larger text, with no author name. Their native Codex role is independent of
the signed-in Amazi account; its identity is not attributed to messages in the CLI history.

Asynchronous questions arrive in native `agentMessage.questions`, independently of blocking RPC
requests. The conversation renders their options and free-text answers directly, even while Codex
continues working. Answers include the native question item ID in `send_user_message_question_reply`
and use the regular message/steering path. Reloaded native history determines which questions have
already been answered; failed or cancelled sends preserve entered answers. Ordinary prose is not
heuristically converted into a question form.

### Composer commands

The composer is one rounded input with inline file previews and a toolbar. Its height grows with
text up to the viewport limit. Paste or drag files into it, or use the paperclip; dropping files
highlights the input. The draft and files are retained if sending fails or confirmation is cancelled.
Type `/` or use the commands button to open a searchable command dialog. Arrow keys select a command;
Enter/Tab opens it and Escape closes the dialog. Enter in the message input sends a message;
Shift+Enter inserts a line break (Ctrl/Cmd+Enter also sends).
The composer footer shows the model, reasoning effort and speed, including Standard when Fast is
off. Click that summary to open model settings in a modal. Commands, model settings, native status,
background terminals and the header's context/info view use accessible modal dialogs with a close
button, Escape and focus trapping. Closing preserves the chat and draft. The summary wraps on narrow
screens so the current settings remain visible.
New drafts read effective profile/project defaults through `/controls` without allocating a chat ID.
Model, reasoning and speed can be chosen before the first message. Draft choices are included in
that message's Telegram confirmation fingerprint and applied through native `turn/start` after
confirmation. `/model`, `/fast`, `/new` and `/status` work in drafts; `/compact`, `/ps` and `/stop`
require an existing conversation. Changing draft settings does not change another native chat.

- `/model`: select an available native model and reasoning effort.
- `/fast`: open speed settings; Fast is offered only when the native model catalog supports it.
  Model, effort and service tier are saved with `thread/settings/update` for subsequent turns.
  Fast may increase usage; the UI shows this before saving.
- `/compact`: request native context compaction. Progress stays in the conversation.
- `/ps`: list the selected chat's actual background terminals, refresh them, stop one or stop all.
  Uses native process IDs and `thread/backgroundTerminals/*`, never arbitrary OS PIDs.
- `/stop`: interrupt the selected chat's current turn.
- `/new`: open a draft; allocate the native conversation only when sending its first message.
- `/status`: show the selected Codex session's activity, model, reasoning, speed, context token
  counters and account usage limits/reset times. It reads native state on opening or Refresh,
  without sending a message, creating a thread or requesting a Telegram code. Drafts retain
  their selected model settings. Missing counters stay blank; unavailable limits are identified.
  Server connections, working directories and instructions remain under the header's ⓘ button.

The [native app-server protocol](https://learn.chatgpt.com/docs/app-server) is pinned to Codex 0.162.1;
settings and background-terminal operations use its experimental API. The web client has no generic
RPC endpoint. Model settings and compact confirmations are bound to the exact command and chat.

Select, paste or drop up to ten files: 20 MB each, 50 MB total. API streams them to
`CODEX_HOME/uploads` on Gateway. PNG/JPEG/WebP/GIF signatures select native image inputs;
other files are supplied by their local paths. Downloads require administrator authentication.
Audio/video remain files; no transcription service is added.
Browser disconnection does not cancel work. Stop explicitly calls Codex interruption.
Without an existing daemon, the bridge starts its own stdio app-server and restarting the bridge
interrupts that child process. With a shared daemon, disconnecting/restarting the bridge leaves
CLI work running. Restarting Web does not interrupt either mode.

**Context and instructions** shows the native session ID, model, cwd, branch, instruction sources
and configured SSH connections. One file applies to all chats:
[src/agent/instructions/agent.md](src/agent/instructions/agent.md), configured through
`OPERATIONS_AGENT_INSTRUCTIONS_FILE`. There is no general/board instruction selector.

The shared instruction requires assessment when a task is attached: investigate requirements
and code, identify blockers, propose a plan and save `agentVerdict` through `saveVerdictCommand`
from the trusted task snapshot. Implementation requires the user's request or authorization.
Main uses its saved task/chat association or confirmed `taskId` to prepend fresh task data to each
message, including the first message from a task draft. Task ID is bound to Telegram confirmation;
unknown tasks and conflicting selections are rejected. Client text and headers cannot choose an
instruction file or substitute a task snapshot. Unlinking a chat removes task data from subsequent
messages; it does not switch instructions.

The bridge rereads the single file for each new chat and before each new turn submitted by the
application. New chats receive native `developerInstructions`; existing chats receive changed
instructions as a developer message through `thread/inject_items`, because native resume ignores
instruction overrides for loaded threads. An active turn keeps its current instructions; follow-ups
use `turn/steer`, and file changes apply before the next new turn. A missing, empty or oversized
instruction file fails explicitly.
Updates remain in native Codex history and do not require a new chat or application database.
Direct CLI input keeps native instruction behavior; the application refreshes its instructions on
web submissions. Previously injected instructions remain part of native history and are superseded
by the current application instruction on the next new turn.

The file does not overwrite native global instructions. Codex still reads its profile's global
instructions and the working repository's applicable AGENTS.md files. The application passes the
single additional file, plus configured SSH connection details without passwords.
Native model/MCP/settings remain in `CODEX_HOME/config.toml`.

### SSH access

Configure main and Gateway independently in local `.env` or the Gateway's `.env.agent`:
`OPERATIONS_AGENT_SSH_MAIN_*` and `OPERATIONS_AGENT_SSH_GATEWAY_*` each accept `HOST`, `PORT`,
`USER`, `DIRECTORY`, `IDENTITY_FILE` and `PASSWORD`. See [.env.example](.env.example) for every field.
An entirely empty connection is disabled. A configured connection requires host, user and an absolute
remote directory; port defaults to 22. Paths refer to the Agent host, not the browser or API host.
After changing environment values, restart `npm run dev` or recreate the Agent container.

An explicit private key takes precedence over a password. Without either, OpenSSH uses the local
SSH agent/default keys. Passwords are delivered through OpenSSH askpass: private files (0600) and
helpers (0700) in the `ssh` directory beside the configured worktrees. They are not passed to Codex's
environment, model instructions, CLI arguments or the context API. Protect `.env` with mode 0600.
The model receives connection details and a command prefix; these are visible in its native history.

OpenSSH is required locally and included in the Agent image. Host-key checking is always enabled.
`OPERATIONS_AGENT_SSH_KNOWN_HOSTS` defaults to `~/.ssh/known_hosts` locally. Use previously verified
host keys; the bridge never accepts new keys automatically. A configured connection does not itself
authorize deployment or production changes. The agent follows the administrator's task scope.

When the selected profile is not signed in, use **Connect Codex account** to complete device-code
sign-in. On the server, Compose explicitly selects the separate persistent `/home/node/.codex`
volume; the account survives container restarts and workstation credentials are not copied.
These are [Codex's native cached login and device-code mechanisms](https://learn.chatgpt.com/docs/auth).
HTTP readiness does not imply an authenticated model turn.

The original board and its interactions are documented in
[src/web/features/board/README.md](src/web/features/board/README.md). It works without Gateway.
Board updates use an authenticated SSE connection: cards, tags and history refresh after changes,
with no periodic board/file requests. Search and archive share the same cached snapshot, and image
previews reuse downloaded attachment bytes. Reconnection catches missed changes without reloading
an unchanged board. The API must remain the single running writer of its board SQLite database.
Queue is only a board column; moving a task does not launch Codex. Assessment happens in the task chat.
The **Needs clarification / design** column is between Backlog and Queue; it has the same drag,
history and export behavior as the other columns. Existing task statuses are unchanged.

### Task comments

Open a task to read and add comments below its description/attachments. Comments show the signed-in
administrator's name and timestamp. Send text, attachments, or both; Ctrl/Cmd+Enter submits the
comment and Enter inserts a line break. File picking, pasting and dropping support up to ten
non-empty files, **20 MB total** per comment, with previews/removal before sending. Text is limited
to 8,000 characters. Sent attachments can be previewed or downloaded. Failed sends retain the draft;
retrying the same request cannot create a duplicate comment.

Comments live in `task_comments(id, cardId, data)` in the board SQLite database. Their files use the
existing content-addressed `task_files` table. Startup adds the table/index without replacing cards,
history or attachments. One transaction saves the comment and bytes, increments the task revision
and records a `comment_added` event. The existing board SSE updates open comments; there is no polling.
Authenticated `GET/POST /api/board/cards/:id/comments` reads/sends them; POST uses multipart form data
with a UUID `id`, `text` and repeated `files` parts. The server supplies the author. Existing attachment
download routes also resolve comment files within that task. Task/column ZIP exports include comments
and their attachments. Agent instructions identify this table as an additional source of task context.

### Discuss a task with the agent

The full-height agent panel on the left of each card opens task details and the shared chat
component side by side. The drag handle stays on the right. The panel is grey before discussion,
blue with a chat icon once a native conversation is linked, and green with a check when `agentVerdict`
contains text. Blue means discussion in progress, not that a native turn is currently running.
The task dialog offers only **Discuss with agent**; creating or choosing a replacement chat stays
in the discussion sidebar. Phones collapse task details above the chat.
**Open task** in the details sidebar opens the same task dialog as the board, with editing,
attachments, tags, history and export. Closing it returns to the chat without losing the draft.
The board instructions tell Codex to record its assessment with the snapshot's `saveVerdictCommand`.
This local Gateway helper reads verdict text from stdin and writes only this task's `agentVerdict`
through `POST /api/agent/tasks/:id/verdict`. Main validates a task/chat/revision-specific HMAC
credential and the current chat association, checks the revision, records a history event and
invalidates the board over SSE. Card status never changes. Retries are idempotent; changed tasks or
replaced chats require a fresh snapshot. The token stays in a private Gateway file under
`OPERATIONS_AGENT_WORKTREES/.task-actions`, never in model input or browser responses.

A task has at most one linked native chat. **New conversation** opens a draft without a chat ID;
**Choose existing chat** searches all native conversations and replaces the task's association.
A chat already linked to another task is identified and unavailable for selection. Replacing a
link preserves the previous conversation in Codex and returns it to the general chat list.
Opening a task reuses its linked chat, or shows an empty draft when there is none. A locked block
above the composer shows the task title, ID and absolute task URL. This brief reference is prepended
to every message, including follow-ups and messages sent from the general Agent page to a linked
chat. It is outside the editable textarea and included before Telegram confirmation. The link opens
the authenticated task application; it does not grant unauthenticated access to board data.
After confirmation, main also supplies a fresh task snapshot from its board database, selected by
the validated task ID or persisted chat link. Gateway prepends it to the native user input, including
description, status, priority, tags, verdict and attachment metadata. A browser cannot substitute
this snapshot. Question answers receive it too. The shared agent instruction gives the exact board
database path and tables so Codex can read current details and reference files through configured SSH.
The UI collapses the snapshot into task context so it does not bury the actual user message.
Attachment metadata is not file content. For production tasks, the agent uses the `main` SSH target
to read `/var/www/amazi-internal-tasks/.runtime/operations-agent/data/chats.sqlite` with SQLite
`mode=ro`. `task_cards.data` contains task JSON; each attachment's `sha256` points to the BLOB in
`task_files.bytes`. The agent downloads the selected file into its Gateway worktree, verifies the
hash and opens it before assessing the reference. The instructions authorize these task reads as
part of the discussion, without a separate browser login or repeated manual attachment action.
The composer keeps the pinned task reference and ordinary file picker; there is no task-file import
button. Browser tools remain available for UI investigation/testing required by the task.

The task/chat URL is `/tasks?task=<task-id>&chat=<native-thread-id>`; an empty draft has only
the task ID (`new=1` explicitly starts a replacement draft). Sending allocates a native thread
internally for uploads and confirmation. Its ID is published in the URL and linked to the task only
after confirmed input is accepted. Cancelled confirmation leaves the draft unlinked. Failed link
saves can be retried without replaying accepted input. API link writes validate that the native
chat contains a user message; they never start a turn. Stale unlinked task/chat URLs return to the
task's current chat or its draft. The bridge handles native unmaterialized threads for first input.

Amazi Agent has **General** and **Tasks** filters. A direct chat link resolves its associated task
and shows a link back to the task workspace. `task_chat_links` stores only task ID, native chat ID
and association time, with unique constraints on both IDs. Native messages, names, files and events
remain on Gateway. Association changes invalidate the board through the existing SSE stream.
To import a private `amazi-operations-board-v1` bundle with the board API stopped:
`node dist/api/import-main.js <bundle> <sqlite>`.

## Deployment

Three Dockerfiles build Web, API and Agent independently. `compose.yml` starts Web and API on main;
`compose.agent.yml` starts only Agent on Gateway.
No Python deployment framework or monorepo build orchestration is required.

On main, create an ignored `.env.api` with:

```dotenv
OPERATIONS_AGENT_PUBLIC_URL=https://tasks.amazi.pro/
OPERATIONS_AGENT_API_URL=https://api.amazi.pro
OPERATIONS_AGENT_WORKER_URL=https://gateway.amazi.pro/operations-agent
OPERATIONS_AGENT_WORKER_TOKEN=<same-random-token-on-both-hosts-at-least-32-characters>
OPERATIONS_AGENT_TELEGRAM_URL=https://gateway.amazi.pro/telegram/sendMessage
OPERATIONS_AGENT_TELEGRAM_TOKEN=<existing-gateway-bearer-credential>
OPERATIONS_AGENT_TELEGRAM_CHAT_ID=-1004381042765
OPERATIONS_AGENT_TELEGRAM_THREAD_ID=210
```

On Gateway, create an ignored `.env.agent` containing the same
`OPERATIONS_AGENT_WORKER_TOKEN` and the SSH settings from `.env.example` for any required hosts.
The image contains both instruction files. Compose mounts the Gateway checkout's
`src/agent/instructions/agent.md` read-only at `/app/agent-instructions.md` and sets
`OPERATIONS_AGENT_INSTRUCTIONS_FILE` to that path.
Edit the host files to adjust the corresponding profile. New turns reread file contents without
rebuilding the image. If your editor replaces a mounted file by renaming a new inode over it,
recreate the container to refresh that file bind mount. For custom paths, change the corresponding
Compose environment value and volume mount together. The existing Codex profile volume and its
global instructions are preserved.
Do not use local workstation paths from `.env` inside the container.
Prepare a separate Git checkout under
`.runtime/operations-agent/workspace/repository` and writable `workspace` and `codex` directories.
Main needs a writable `.runtime/operations-agent/data` directory.
Container processes use UID/GID 1000; preserve existing volume contents when assigning ownership.
Do not put secrets or imported data in image layers.
Put verified `known_hosts` and optional private keys in `.runtime/operations-agent/ssh-access`.
Compose mounts this directory read-only at `/run/agent-ssh` and selects
`/run/agent-ssh/known_hosts`. Set any `*_IDENTITY_FILE` to a file inside that mount and make it
readable only by UID 1000. Do not copy account credentials from the workstation.

```sh
# Main server (existing amazi-proxy network and Traefik):
docker compose -f compose.yml -f compose.main.yml up -d --build
# Gateway:
docker compose -f compose.agent.yml up -d --build
```

Web listens on loopback 8080, API on 3010, and Agent on 3011. `compose.main.yml` attaches only Web
to the existing `amazi-proxy` network and registers `tasks.amazi.pro` with Traefik's `letsencrypt`
resolver. API stays on the application's private network. Include
[deploy/gateway-location.conf](deploy/gateway-location.conf) inside the existing
`gateway.amazi.pro` TLS server block and run `nginx -t` before reloading Nginx. It strips the
`/operations-agent/` prefix, permits 20 MB uploads and preserves SSE streaming. Existing host
proxies own TLS; no main Amazi container needs to be recreated.

Images may be built locally, transferred with `docker save`/`docker load`, then started with
`up -d --no-build --pull never --wait`. Deploy only committed source; keep `.env.api`, `.env.agent`,
board data, SSH material and the Codex profile outside the archive. For the initial board transfer,
use SQLite's backup API while reading the live local database, remove local-only chat associations
from the transfer copy, and verify row counts, database integrity and attachment SHA-256 hashes
on both ends before starting API. Do not overwrite an existing server board.

Codex runs inside an unprivileged, read-only-root container with explicit writable account/workspace
mounts and no host Docker socket. Only explicitly configured SSH connections are supplied to the agent.
Native approval requests remain visible.
Local execution defaults to `workspace-write`; the Gateway container uses its container boundary.
Before replacing Gateway, wait for any active turn to finish; a restart interrupts active work.
Health endpoints are `/health` on all three processes. Check a real authenticated turn separately.
