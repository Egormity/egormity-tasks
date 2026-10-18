# Database transfer

`database_transfer.py` uses only Python 3.11+ standard-library modules. It exports a live board
through SQLite's online backup API, then produces a frozen SQLite database, compressed SQL dump
and SHA-256 manifest. Restores verify all tables, foreign keys, attachment bytes/references and
logical content before publishing a new database path. Existing databases are never overwritten.

The migration and import procedure is documented in [the migration runbook](../MIGRATION.md).
Run its isolated tests with `python3 -m unittest discover -s scripts -p '*_test.py'`.
