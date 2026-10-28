import { PostgresDatabase } from "./database.js";
import { importSqliteDatabase } from "./sqlite-import.js";

const [sourcePath, sourceKey] = process.argv.slice(2);
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the SQLite import.");
if (!sourcePath || !sourceKey)
  throw new Error("Usage: migrate-sqlite.js <sqlite-file> <source-key>");

const database = new PostgresDatabase(process.env.DATABASE_URL);
try {
  const summary = await importSqliteDatabase(database, sourcePath, sourceKey);
  console.log(JSON.stringify(summary));
} finally {
  await database.close();
}
