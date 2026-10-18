# Egormity Tasks

Independent task board and web client for the Codex CLI on Gateway.
Read README.md before editing. This is one npm project, not a monorepo.
Keep three application directories under src: web, api and agent.
Use each application's README as its code map. Group implementation by feature/responsibility;
keep tests adjacent and only application composition/configuration at the application root.
Web uses app/, features/ and shared/. Do not recreate the flat web/ui directory or add barrel layers.
Web contains only frontend code. API owns authentication, board SQLite and the Gateway relay.
Shared contracts are ordinary files under src/api/contracts, imported directly by web and agent.
Do not introduce workspace packages or a separate configuration package.
Keep the two hosts independent: web, authentication and board SQLite on main;
Codex, its native thread history, attachments and working repositories on Gateway.
Do not add a second chat database or copy Codex history into the board database.
Preserve raw Codex events; never automatically replay a turn after reconnection.
During an active turn, send follow-ups through native turn/steer with its expected turn ID.
Do not create an application message queue or block other chats while Codex is working.
Connect to the existing Codex daemon when available; never stop it when the bridge disconnects.
Keep source and runtime/account data separate. Never commit credentials or imported data.
Use reusable components, split files over 500 lines, and use apply_patch for text edits.
Maintain Russian and English UI labels and light/dark themes.
Run focused tests, typecheck and build before meaningful versioned local commits.
Do not push, publish, deploy or create remote repositories without explicit authorization.

## Amazi application roots

The separately registered Amazi applications run from `web/` and `api/`. These folders are
standalone copies of `src/web` and `src/api`; `web/src/api/contracts` is the frontend's copy of
the shared transport contracts. The original `src/` tree remains intact for the imported
repository and its Compose workflow. Keep corresponding behavior changes synchronized between
the app roots and original sources when maintaining both deployment paths.
