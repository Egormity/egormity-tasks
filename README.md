# Egormity Tasks

Egormity Tasks is split into exactly two Amazi applications. `web/` is the browser client; `api/`
owns administrator authorization, the task board, SQLite storage, and the optional Gateway relay.
There is no third application or duplicate root-level application source tree.

| Application | Source root | Responsibility                                                                         |
| ----------- | ----------- | -------------------------------------------------------------------------------------- |
| Web         | `web/`      | React interface, sign-in screen, board, and same-origin API proxy                      |
| API         | `api/`      | Local administrator sessions, task and attachment APIs, SQLite, optional Gateway relay |

## Local administrator

The API authenticates the locally configured administrator; it does not call an external identity
service. The account is configured using API-only environment values. Passwords are stored as a
scrypt verifier, and successful sign-in issues an HttpOnly, SameSite=Strict, signed session cookie.
The initial login identifier is `admin@example`. Keep the plaintext password out of source files.

## Data and optional Gateway

The task board and attachment bytes live in the API's SQLite database at `/data/chats.sqlite`.
Gateway chat/agent routes are enabled only when both `OPERATIONS_AGENT_WORKER_URL` and
`OPERATIONS_AGENT_WORKER_TOKEN` are configured. Without them, local sign-in and board management
remain available; Gateway-dependent chat actions report that the worker is not configured. The
Gateway worker is not an application in this project.

## App references

- [Web application map](web/README.md)
- [API application map](api/README.md)
- [Historical data migration notes](MIGRATION.md)
