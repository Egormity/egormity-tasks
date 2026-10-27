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
`contracts/board-columns.ts` is the single ordered array of board column IDs, labels and accents;
task status validation derives from that list. The SQLite records store statuses as strings in task
JSON, so adding or reordering a column requires no database migration. Keep existing IDs stable and
add English copy in the Web board translation catalog when introducing a new label.
