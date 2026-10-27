from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from database_transfer import export_database, inspect_database, restore_database


class DatabaseTransferTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = self.root / "source.sqlite"
        self.live = sqlite3.connect(self.source)
        self.addCleanup(self.live.close)
        self.live.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE task_cards (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE task_files (sha256 TEXT PRIMARY KEY, bytes BLOB NOT NULL);
            CREATE TABLE task_comments (
                id TEXT PRIMARY KEY, cardId TEXT REFERENCES task_cards(id), data TEXT NOT NULL
            );
        """)
        content = b"attachment\x00\xff\n"
        digest = hashlib.sha256(content).hexdigest()
        task = {
            "id": "task",
            "title": "Unicode ✓\nSecond line",
            "attachments": [{"sha256": digest}],
        }
        self.live.execute(
            "INSERT INTO task_cards VALUES (?, ?)", ("task", json.dumps(task))
        )
        self.live.execute("INSERT INTO task_files VALUES (?, ?)", (digest, content))
        self.live.execute(
            "INSERT INTO task_comments VALUES (?, ?, ?)",
            ("comment", "task", json.dumps({"text": "Comment", "attachments": []})),
        )
        self.live.commit()

    def test_live_wal_snapshot_and_sql_restore_preserve_all_data(self) -> None:
        self.assertTrue(Path(str(self.source) + "-wal").exists())
        bundle = self.root / "export"
        manifest = export_database(self.source, bundle)
        self.assertEqual(manifest["database"]["attachmentFilesVerified"], 1)
        for from_sql in (False, True):
            destination = self.root / f"restored-{from_sql}.sqlite"
            result = restore_database(bundle, destination, from_sql=from_sql)
            self.assertEqual(result, manifest["database"])
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            with closing(sqlite3.connect(destination)) as database:
                self.assertEqual(
                    database.execute("SELECT cardId FROM task_comments").fetchone(),
                    ("task",),
                )
                self.assertEqual(
                    database.execute("SELECT bytes FROM task_files").fetchone(),
                    (b"attachment\x00\xff\n",),
                )

    def test_restore_refuses_existing_destination_and_corrupt_export(self) -> None:
        bundle = self.root / "export"
        export_database(self.source, bundle)
        with self.assertRaises(FileExistsError):
            restore_database(bundle, self.source)
        destination = self.root / "new.sqlite"
        Path(str(destination) + "-wal").touch()
        with self.assertRaises(FileExistsError):
            restore_database(bundle, destination)
        (bundle / "board.sqlite").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            restore_database(bundle, self.root / "other.sqlite")
        self.assertFalse((self.root / "other.sqlite").exists())

    def test_verification_detects_corrupt_bytes_and_missing_attachment_reference(
        self,
    ) -> None:
        self.live.execute("UPDATE task_files SET bytes = ?", (b"different",))
        self.live.commit()
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            inspect_database(self.source)
        self.live.execute("DELETE FROM task_files")
        self.live.commit()
        with self.assertRaisesRegex(ValueError, "missing file"):
            inspect_database(self.source)

    def test_restore_rejects_manifest_mismatch_before_publishing(self) -> None:
        bundle = self.root / "export"
        manifest = export_database(self.source, bundle)
        manifest["database"]["tables"]["task_cards"] = 999
        (bundle / "manifest.json").write_text(json.dumps(manifest))
        destination = self.root / "restore.sqlite"
        with self.assertRaisesRegex(ValueError, "does not match"):
            restore_database(bundle, destination)
        self.assertFalse(destination.exists())
        self.assertEqual(list(self.root.glob(".restore-*")), [])


if __name__ == "__main__":
    unittest.main()
