# Egormity Tasks

Egormity Tasks has two independent Amazi applications: `web/` provides the browser interface;
`api/` owns authentication, workspace accounts, the task board and SQLite storage.

| Application | Source root | Responsibility                                                                              |
| ----------- | ----------- | ------------------------------------------------------------------------------------------- |
| Web         | `web/`      | Sign-in, task board, comments, attachments, admin user management and same-origin API proxy |
| API         | `api/`      | Local sessions, account roles, task/tag/comment/file APIs, SQLite and board events          |

## Local accounts

The API authenticates local administrator and manager accounts. The initial administrator is configured
with API-only environment values. Passwords use scrypt verifiers; successful sign-in issues an HttpOnly,
SameSite=Strict signed session cookie. Administrators can manage accounts, including deleting them,
but never their own account or the last remaining administrator. Both roles use the task board.
Keep plaintext passwords and session secrets out of source files.

## Data

Tasks, tags, comments, event history and attachment bytes live in the API's SQLite database at
`/data/chats.sqlite` in production. Existing environment variable names and the database filename remain
stable so current deployment configuration and data locations continue to work.

## App references

- [Web application map](web/README.md)
- [API application map](api/README.md)
- [Historical data migration notes](MIGRATION.md)
