import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { importBoard } from "./board-import.js";
import { BoardStore } from "./board-store.js";
import { BoardDatabase } from "./database.js";

const [directory, database] = process.argv.slice(2);
if (!directory || !database)
  throw new Error("Usage: import-main.js <bundle-directory> <sqlite-path>");
mkdirSync(dirname(resolve(database)), { recursive: true, mode: 0o700 });
const store = new BoardDatabase(database);
try {
  console.log(JSON.stringify(importBoard(new BoardStore(store.db), directory)));
} finally {
  store.close();
}
