# Web

Frontend only. `main.tsx` initializes preferences and mounts `app/App.tsx`.
`app/` owns login gating, the main sidebar and History API navigation. `AppLink` keeps internal
links within the mounted application; modified clicks still open new tabs. Startup converts legacy
hash links to `/tasks` or `/agent` URLs. The `/users` page is shown only to admins; the API also
enforces that role. `styles.css` owns shared theme tokens;
board-specific colors live in `features/board/board-theme.css`.

| Directory                     | Responsibility                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| `features/board`              | Board workspace and page composition                             |
| `features/board/components`   | Board columns, cards and board UI primitives                     |
| `features/board/editor`       | Task view/edit dialog, editor state and event history            |
| `features/board/comments`     | Comment feed, multipart submission and SSE-driven refresh        |
| `features/board/attachments`  | Uploads, previews, carousel and attachment editing               |
| `features/board/tags`         | Tag selection, appearance and management                         |
| `features/board/dnd`          | Drag sensors, hit testing and insertion ordering                 |
| `features/board/data`         | API adapter, shared query cache, SSE, types and export           |
| `features/board/discussion`   | Task-to-chat navigation, pinned task context and verdict display |
| `features/board/i18n`         | Board translation catalog and lookup                             |
| `features/agent`              | Reusable chat page, conversation selector, activity and context  |
| `features/agent/composer`     | Message input, attachments and slash commands                    |
| `features/agent/conversation` | Native messages, tool results and user-message formatting        |
| `features/agent/requests`     | Blocking approvals, MCP elicitation and asynchronous questions   |
| `features/agent/state`        | Snapshot/SSE reconciliation and native history merging           |
| `features/auth`               | Administrator login screen                                       |
| `features/users`              | Admin-only user table and create/edit dialog                     |
| `features/confirmation`       | Telegram code dialog and confirmed-action submission             |
| `shared`                      | HTTP/error handling, localization/preferences and reusable UI    |

`@/` means this directory; `@contracts/` means `../api/contracts/`. Import shared transport types
directly. Never import API implementations or Gateway modules into browser code.
Task discussion reuses the same Agent page, conversation and composer; it is not a second chat UI.
Managers and admins sign in through the same workspace form. Admins can create and edit admin or
manager accounts; account passwords are supplied on creation and may be reset during editing.
Context and conversation have separate React key prefixes for the same native thread. Live
updates must keep one context panel mounted and preserve the conversation and composer draft.
The `/status` composer command opens `composer/CodexStatus.tsx`, independently of the header's
context button. Both use `shared/ui/AppDialog.tsx`, as do command search, model settings and background
terminals. Status is fetched on demand and manual refresh, without adding polling or submitting a prompt.
Closing/refreshing a dialog preserves the draft and its model settings. The composer uses the shared
autosizing textarea hook and draft attachment previews; comments reuse those input primitives.
Tests are adjacent to the feature they verify. Browser test setup stays in `test-setup.ts`.

Run from the repository root: `npm run dev`, `npm run build:web`, `npm test -- src/web`.
For board behavior and the copied UI's provenance, see [the board notes](features/board/README.md).
