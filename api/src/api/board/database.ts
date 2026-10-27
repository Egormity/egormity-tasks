import { DatabaseSync } from "node:sqlite";

/** SQLite storage for board content and workspace accounts. */
export class BoardDatabase {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  }
  close = () => this.db.close();
}
