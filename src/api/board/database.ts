import { DatabaseSync } from "node:sqlite";

/** The board owns this database. Codex threads stay entirely on Gateway. */
export class BoardDatabase {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  }
  close = () => this.db.close();
}
