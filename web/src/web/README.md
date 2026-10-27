# Web

Frontend only. `main.tsx` initializes preferences and mounts `app/App.tsx`. `app/` owns login gating,
the compact responsive header and History API navigation between `/tasks` and `/users`. The users page is
restricted to administrators in both Web and API. Modified link clicks retain native new-tab behavior.
Startup normalizes legacy task/user hash links and sends unsupported page URLs to the task board.

| Directory                    | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `features/board`             | Board workspace and page composition                           |
| `features/board/components`  | Columns, cards and board UI primitives                         |
| `features/board/editor`      | Task view/edit dialog, editor state and event history          |
| `features/board/comments`    | Comment feed, multipart submission and SSE refresh             |
| `features/board/attachments` | Uploads, previews, carousel and attachment editing             |
| `features/board/tags`        | Tag selection, appearance and management                       |
| `features/board/dnd`         | Drag sensors, hit testing and insertion ordering               |
| `features/board/data`        | API adapter, query cache, SSE, types and export                |
| `features/board/i18n`        | Board translation catalog and lookup                           |
| `features/auth`              | Workspace login screen                                         |
| `features/users`             | Admin-only account table and create/edit dialog                |
| `shared`                     | HTTP/error handling, preferences, localization and reusable UI |

`@/` means this directory; `@contracts/` means `../api/contracts/`. Import shared transport types
directly and keep API implementations out of browser code. Navigation, language/theme preferences and account controls stay in the header on desktop and mobile.
Shared theme tokens live in `styles.css`;
board colors live in `features/board/board-theme.css`. Comments use the shared textarea and draft
attachment preview primitives. Tests live beside the feature; browser setup is in `test-setup.ts`.

Run `npm run dev`, `npm run build` and `npm test` from `web/`.
See [the board notes](features/board/README.md) for board behavior and source provenance.
