import { importBoard } from "./board-import.js";
import { BoardStore } from "./board-store.js";
import { PostgresDatabase } from "../database/database.js";

const [directory] = process.argv.slice(2);
if (!directory) throw new Error("Usage: import-main.js <bundle-directory>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const database = new PostgresDatabase(process.env.DATABASE_URL);
try {
  await database.migrate();
  const store = new BoardStore(database);
  await store.initialize();
  console.log(JSON.stringify(await importBoard(store, directory)));
} finally {
  await database.close();
}
