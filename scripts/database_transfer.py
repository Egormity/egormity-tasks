"""Consistent board exports and offline restores; never overwrite an existing database."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def readonly(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(
        path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30
    )
    connection.execute("PRAGMA query_only=ON")
    return connection


def checksum(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inspect_database(path: Path) -> dict[str, Any]:
    with closing(readonly(path)) as database:
        if database.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        if database.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign key check failed")
        tables = [
            row[0]
            for row in database.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        if not {
            "task_cards",
            "task_files",
            "task_comments",
            "task_chat_links",
        }.issubset(tables):
            raise ValueError("Expected the Internal Tasks board schema")
        counts: dict[str, int] = {}
        logical = hashlib.sha256()
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            rows = []
            for row in database.execute(f"SELECT * FROM {quoted}"):
                encoded = json.dumps(
                    [
                        {"blobSha256": hashlib.sha256(value).hexdigest()}
                        if isinstance(value, bytes)
                        else value
                        for value in row
                    ],
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode()
                rows.append(hashlib.sha256(encoded).digest())
            counts[table] = len(rows)
            logical.update(table.encode() + b"\0")
            for digest in sorted(rows):
                logical.update(digest)
        files = set()
        for digest, content in database.execute("SELECT sha256, bytes FROM task_files"):
            if hashlib.sha256(content).hexdigest() != digest:
                raise ValueError("Attachment checksum mismatch")
            files.add(digest)
        references = 0
        external_references = 0
        for table in ("task_cards", "task_comments"):
            for (data,) in database.execute(f"SELECT data FROM {table}"):
                for attachment in json.loads(data).get("attachments", []):
                    digest = attachment.get("sha256")
                    if digest:
                        if digest not in files:
                            raise ValueError("An attachment references a missing file")
                        references += 1
                    else:
                        external_references += 1
        schema = database.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name"
        ).fetchall()
        return {
            "integrity": "ok",
            "foreignKeys": "ok",
            "tables": counts,
            "attachmentFilesVerified": len(files),
            "attachmentReferencesVerified": references,
            "legacyExternalAttachmentReferences": external_references,
            "logicalSha256": logical.hexdigest(),
            "schemaSha256": hashlib.sha256(json.dumps(schema).encode()).hexdigest(),
        }


def export_database(source: Path, output: Path) -> dict[str, Any]:
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    snapshot = output / "board.sqlite"
    dump = output / "board.sql.gz"
    # SQLite's backup API includes committed WAL data without copying live database files.
    with (
        closing(readonly(source)) as live,
        closing(sqlite3.connect(snapshot)) as target,
    ):
        live.backup(target, pages=256, sleep=0.05)
        target.execute("PRAGMA journal_mode=DELETE")
    snapshot.chmod(0o600)
    report = inspect_database(snapshot)
    with (
        closing(readonly(snapshot)) as database,
        gzip.open(dump, "wt", encoding="utf-8") as stream,
    ):
        for statement in database.iterdump():
            stream.write(statement + "\n")
    dump.chmod(0o600)
    manifest = {
        "format": "egormity-tasks-sqlite-v1",
        "exportedAt": datetime.now(UTC).isoformat(),
        "sourceDatabase": str(source.resolve()),
        "database": report,
        "files": {
            path.name: {"sha256": checksum(path), "bytes": path.stat().st_size}
            for path in (snapshot, dump)
        },
        "chatHistory": "Native Codex history remains on Gateway; board chat links are preserved.",
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    manifest_path.chmod(0o600)
    return manifest


def restore_database(
    bundle: Path, destination: Path, *, from_sql: bool = False
) -> dict[str, Any]:
    manifest = json.loads((bundle / "manifest.json").read_text())
    if manifest.get("format") != "egormity-tasks-sqlite-v1":
        raise ValueError("Unsupported database export")
    if any(
        Path(str(destination) + suffix).exists()
        for suffix in ("", "-wal", "-shm", "-journal")
    ):
        raise FileExistsError(
            "Destination database or sidecar exists; restore to a new path"
        )
    name = "board.sql.gz" if from_sql else "board.sqlite"
    source = bundle / name
    if checksum(source) != manifest["files"][name]["sha256"]:
        raise ValueError("Export checksum mismatch")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".restore-", dir=destination.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with closing(sqlite3.connect(temporary)) as database:
            if from_sql:
                with gzip.open(source, "rt", encoding="utf-8") as stream:
                    pending = ""
                    for line in stream:
                        pending += line
                        if sqlite3.complete_statement(pending):
                            database.execute(pending)
                            pending = ""
                    if pending.strip():
                        raise ValueError("Incomplete SQL dump")
            else:
                with closing(readonly(source)) as exported:
                    exported.backup(database)
            database.execute("PRAGMA journal_mode=DELETE")
        report = inspect_database(temporary)
        if report != manifest["database"]:
            raise ValueError("Restored database does not match the export")
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        # Atomic no-clobber publication. A racing process cannot be overwritten.
        os.link(temporary, destination)
        return report
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    export = commands.add_parser("export")
    export.add_argument("source", type=Path)
    export.add_argument("output", type=Path)
    restore = commands.add_parser("restore")
    restore.add_argument("bundle", type=Path)
    restore.add_argument("destination", type=Path)
    restore.add_argument("--from-sql", action="store_true")
    inspect = commands.add_parser("inspect")
    inspect.add_argument("database", type=Path)
    args = parser.parse_args()
    if args.action == "export":
        result = export_database(args.source, args.output)
    elif args.action == "restore":
        result = restore_database(args.bundle, args.destination, from_sql=args.from_sql)
    else:
        result = inspect_database(args.database)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
