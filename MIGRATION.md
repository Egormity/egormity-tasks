# Historical data migration notes

This runbook preserves the original import and verified database snapshot details. The current
project has been simplified to the two independent application roots `web/` and `api/`; the former
root-level monorepo source tree and Compose files have been removed.
The source was originally imported from `amazi-internal-tasks` commit
`a489e5d1e46265d34bee5373e244e0a0e425064f` (v0.19.2), then migrated as v0.20.0.

## Amazi-managed PostgreSQL

The API source now uses Amazi-managed PostgreSQL via `DATABASE_URL`; it applies its schema migration
at startup. The active development snapshot was imported into the project's shared database from
`api/.runtime/migrations/pg-cutover-preview/board.sqlite`. Its verified counts are 5 accounts,
183 tasks, 9 tags, 6 comments, 1,390 history events, 170 attachment files, 1 board import and 1 task/chat
link. The source SQLite file and its original credentials remain unchanged; the importer copies stored
password verifiers without exposing them.

The active production release has not been switched to this new source. It must not be republished
until production's existing `/data/chats.sqlite` has been exported and reconciled with the shared
PostgreSQL contents. The production SQLite volume has not been changed or merged. This is important:
the project PostgreSQL database is shared by environments, but legacy SQLite files do not synchronize.

For a trusted, verified SQLite export, first build the API, then run from `api/`:

```sh
npm run migrate:sqlite -- /path/to/board.sqlite SOURCE_KEY
```

The migration is transactional, checks SQLite integrity and foreign keys, copies only the maintained
account and board tables, stores attachment bytes as PostgreSQL `BYTEA`, and records a source digest.
It refuses to import into a populated destination; the same source key and file may be retried safely.
Do not use it to overwrite PostgreSQL or assume it merges production-only records.

## Runtime compatibility

The existing environment variable names, UI languages, administrator authentication, board and account routes,
database filename and Compose project/router names are preserved. Image names now use
`egormity-tasks`. The production deployment directory can remain `/var/www/amazi-internal-tasks`;
changing the source repository does not require relocating live data or changing DNS.

The API now owns local administrator authentication and does not call Amazi `/auth/token` or
`/auth/session`. Its password verifier and session-signing secret are configured only in the API
application's environment. The current application exposes local account and board APIs only.

The board database includes task cards, tags, comments, event history and attachment BLOBs.
The transfer tools preserve and verify every table in historical snapshots, including unused legacy
metadata. The current API exposes only the maintained board and account contracts.

## Export

Run the following on Main with Python 3.11 or later. The API can remain online:

```sh
python3 scripts/database_transfer.py export \
  /var/www/amazi-internal-tasks/.runtime/operations-agent/data/chats.sqlite \
  /private/new-export-directory
```

The destination must not already exist. SQLite's online backup API captures committed WAL data into
a consistent copy. The export contains `board.sqlite`, `board.sql.gz` and `manifest.json` with file
sizes, SHA-256 hashes, table counts and verification results. Directories are private and artifacts
are mode 0600. Transfer all three files through the authenticated server connection.
Local production exports belong in this checkout's ignored `.runtime/migrations/` directory.

### Prepared production snapshot: 2026-10-18

Local bundle: `.runtime/migrations/production-main-20261018T144253Z/`.
The SQLite snapshot is 57,290,752 bytes; the compressed SQL dump is 52,965,841 bytes.
Both restore to identical schema and logical checksums, including 164 tasks, 8 tags, 6 comments,
1,153 events, 160 stored attachment files and legacy metadata. The original import already
recorded 32 unavailable attachments; their legacy metadata remains unchanged and no missing bytes
are invented. All 160 available file hashes and references passed verification.

The SQLite format is restored at `.runtime/operations-agent/data/chats.sqlite`, ready for local
configuration. The SQL format was restored independently and exercised through the new API using
a local authentication fixture: health/read requests succeeded, anonymous board access was rejected,
all task/comment/event counts matched and an attachment download matched its hash. This does not
claim a live production authentication test. Details are stored in the private bundle's
`api-verification.json`. No dump or runtime credential is committed.

## Import into the new checkout

Install dependencies separately with `npm ci` from `web/` and `api/`; build the API with
`npm run build` from `api/`. Keep the destination API stopped for import. Restore into a new path;
the command refuses to replace an existing database, including any WAL/SHM sidecars:

```sh
python3 scripts/database_transfer.py restore \
  .runtime/migrations/EXPORT_NAME \
  .runtime/operations-agent/data/chats.sqlite
```

The portable compressed SQL dump is independently importable using the same command with
`--from-sql`. Both formats recreate the same schema and logical data, including attachment bytes
and historical metadata. The restore validates SQLite integrity, foreign keys, every attachment hash,
references, table counts and logical checksums against the manifest before publishing the file.
Use only trusted migration exports. Do not use the older `dist/api/import-main.js` JSON-bundle
importer for this full SQLite/SQL export.

Before starting the destination API, configure the local administrator email, name, scrypt password
verifier, and session-signing secret in the API environment. The production image uses
`/data/chats.sqlite`; the development application uses
`api/.runtime/data/chats.sqlite`. Verify `/health` and an authenticated board read after start. Do
not run two APIs against the same SQLite file.

This migration prepares source and data only. No DNS switch, production restart, remote Git push
or new production deployment is performed. Since Main stays writable, take a fresh export during
the eventual cutover if tasks have changed since the prepared snapshot.
