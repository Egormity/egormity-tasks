# API source

`app.ts` composes the authenticated API; `main.ts` loads configuration and opens SQLite.

| Directory   | Responsibility                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `auth`      | Local admin/manager accounts, scrypt passwords, signed sessions and admin-only user management |
| `board`     | Tasks, tags, comments, files, import support and board event stream                            |
| `contracts` | Transport schemas owned by API and copied to Web                                               |

Mutations require the configured browser origin. Authenticated reads and writes share local session
checks; account management also requires an administrator role. Committed board writes publish SSE
invalidations. SQLite stores workspace accounts and board data, including attachment bytes.

Keep the contract copy under `web/src/api/contracts` synchronized when editing transport schemas.
`contracts/board-columns.ts` owns the default column list and validation schema; the live ordered
columns and board-wide dividers are persisted as JSON in SQLite's `board_settings` table. This is
initialized in place and does not require a versioned migration. Task status values remain strings
and writes validate against the live column list. Keep IDs stable for existing task references, and
prevent deletion while any active or archived tasks still reference a column.
Tag colors preserve the existing named tones while also accepting validated `#RRGGBB` values from
the Web color picker.
