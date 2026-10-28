# Egormity Tasks

Egormity Tasks has two independent Amazi applications: `web/` provides the browser interface;
`api/` owns authentication, workspace accounts, the task board and PostgreSQL storage.

| Application | Source root | Responsibility                                                                              |
| ----------- | ----------- | ------------------------------------------------------------------------------------------- |
| Web         | `web/`      | Sign-in, task board, comments, attachments, admin user management and same-origin API proxy |
| API         | `api/`      | Local sessions, account roles, task/tag/comment/file APIs, PostgreSQL and board events      |

## Local accounts

The API authenticates local administrator and manager accounts. The initial administrator is configured
with API-only environment values. Passwords use scrypt verifiers; successful sign-in issues an HttpOnly,
SameSite=Strict signed session cookie. Administrators can manage accounts, including deleting them,
but never their own account or the last remaining administrator. Both roles use the task board.
Keep plaintext passwords and session secrets out of source files.

## Data

Amazi-managed PostgreSQL, supplied to the API as `DATABASE_URL`, is the source of truth for accounts,
tasks, tags, comments, event history and attachment bytes. Development and production use that shared
database when running the PostgreSQL-backed API. The old SQLite file is retained only as a legacy
export/import source; it does not automatically synchronize with PostgreSQL. Import a verified SQLite
snapshot with `npm run migrate:sqlite -- <file> <source-key>` from `api/`. The importer requires an empty
destination and records each source so it cannot silently overwrite or merge existing rows.

## App references

- [Web application map](web/README.md)
- [API application map](api/README.md)
- [Historical data migration notes](MIGRATION.md)
