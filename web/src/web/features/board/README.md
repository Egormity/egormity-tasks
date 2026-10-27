# Task board frontend

Copied on 2026-10-11 from project `7ce039e5-ea5e-4f74-906c-51429c3e14ed`,
`workspace/tasks-web/src/modules/tasks/components/tracker` and `features/tracker`.
The original source owns the board/card geometry, view/edit dialog composition, rich description
editor, tag management, attachment carousel/preview,
and ZIP exports. These are copied components, not a replacement UI inspired by the original.

`data/tracker-api.ts` adapts those components to the independent Operations `/api/board` contract and
SQLite store. It resolves tags, preserves revision preconditions and stable `beforeId` placement,
persists draft attachment removal with the task edit, and uploads files using the revision returned
by the save. Existing file hashes identify locally stored attachment bytes. No source API, source
database credentials, or project storage tokens are required by the frontend.

`BoardWorkspace.tsx` owns the administrator-scoped query cache, session expiry, notifications,
and preference rerenders. `i18n/board-copy.catalog.ts` adds English translations to the original Russian
copy; `board-theme.css` gives the original colors named tokens and dark equivalents. The layout uses adjoining columns and crisp borders. Shared typography and spacing tokens in
`styles.css` keep text and controls readable; columns have a 220px minimum width. Application navigation and appearance/language
controls belong to the workspace navigation. Tasks and Archive are separate direct pages (`/tasks`
and `/archive`), with Users available to admins.
Task view omits the attachment section when the task has no attachments.
Opening a card shows its details, comments, attachments, tags and event history in the task dialog.
`editor/use-task-editor.tsx` owns view/edit, archive and export actions. The drag handle remains
independent on the right.
On phones the toolbar keeps task search available at full width. Tag management uses compact rows and
a single scrollable list to keep many tags manageable on smaller screens. Columns scroll within the
board on smaller screens.

## Live updates

The board has no polling. One authenticated `/api/board/events` SSE connection publishes an opaque
version after successful API writes to cards, tags, attachments or comments. `/api/board` returns that same
version with its snapshot. The initial SSE notification closes the subscribe/read race; reconnecting
resynchronizes only when the version differs from the cached snapshot. A server restart changes it.
Heartbeat comments keep proxies open and do not trigger reads. The stream reconnects every minute
through administrator authentication, without reloading unchanged data. Unmounting closes it.
The API owns a single SQLite writer/process; imports run with the API stopped. This in-process
broadcast does not observe direct database writes by other processes.

`data/tracker-query.ts` holds one snapshot query shared by cards, archive, search and tags. Filtering is
local. SSE notifications and local saves coalesce; changes arriving during a read cause a follow-up
refresh, so updates are not lost. Successful mutations still await a refresh, even if SSE is offline.
Task history is cached by task ID and revision and reread when that revision changes.
Comments in `comments/TaskComments.tsx` also use task ID/revision and retain their input across live
updates. The task view shows comments with preview/download attachments; multipart writes commit
text and files together and retain the draft after failure. Exports include comments and their files.
`BoardStore` persists the ordered, editable column list and board-wide dividers in SQLite's
`board_settings` JSON rows. It seeds the default array only when no saved setting exists, so changes
survive API restarts without a versioned database migration. The API-owned defaults and validation
schema live in `api/src/api/contracts/board-columns.ts`; Web mirrors the contract. Task statuses
remain strings and are validated against the current saved columns. Column IDs stay stable; a column
with assigned (including archived) tasks cannot be deleted until those tasks are moved. The Web
column settings dialog creates, renames, recolors, reorders and removes empty columns, and keeps the
column export action there. Dividers append across the board and can be removed individually.
Column and tag colors accept custom hex values through the color picker; legacy named tag colors
remain supported for existing records. Attachment cards use a compact horizontal preview and action
layout.
New tasks can be assigned to any board column (Backlog by default) and are inserted at the top of
that column. The English board label for the clarification/design column is “Design required.”
Attachment bytes and parsed text are cached by file identity/content hash, without timers or broad invalidation.
Opening the full preview reuses the thumbnail's bytes. Failed/rolled-back writes never notify.

`dnd/use-board-drag.ts` replaces the source's unstable sortable preview with stationary card hit areas
and an insertion line. dnd-kit provides pointer/keyboard sensors, overlay and scrolling; React
owns list changes. `dnd/task-board-drop.ts` resolves the pointer against visible column bounds and
card midpoints, including gaps, empty columns and column headers. Release coordinates take
precedence over frame-batched movement. Outside drops and cancellation never save. Arrow keys
step between insertion slots and columns; Space/Enter commits and Escape cancels.

The visible and full task lists stay frozen during a gesture. Search-hidden siblings retain their
relative positions. A successful drop sends the indicated sibling ID and original source revision,
so live updates cannot reinterpret an old numeric index. The committed preview remains until query
refresh; save failure restores current server data. New drags are blocked while saving.

Deterministic tests cover drag ordering, attachment interactions and export contents.
Drag integration tests run the real dnd-kit manager, sensors, collision events and React components
with modeled jsdom geometry. HTTP tests cover concurrent insertions and stale/missing targets.
Additional tests exercise the view/edit flow, localized controls, login without preferences, and
the actual frontend adapter over local HTTP including stale revisions, uploads and tag deletion.
Live-update tests use real HTTP SSE with multiple clients, all mutation routes, revocation on
reconnect and stream shutdown. Browser-query tests cover idle traffic, shared snapshots, cached
attachments, reconnection, coalesced saves and changes arriving during a snapshot read.
