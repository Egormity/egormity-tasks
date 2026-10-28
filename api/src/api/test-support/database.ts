import { DataType, newDb } from "pg-mem";
import type { Pool } from "pg";

import { PostgresDatabase } from "../database/database.js";

export const createTestDatabase = () => {
  const memory = newDb({ noAstCoverageCheck: true });
  memory.public.registerFunction({
    name: "decode",
    args: [DataType.text, DataType.text],
    returns: DataType.bytea,
    implementation: (encoded, format) => {
      if (format !== "hex") throw new Error("Only hexadecimal test blobs are supported.");
      return Buffer.from(String(encoded), "hex");
    },
  });
  memory.public.registerFunction({
    name: "encode",
    args: [DataType.bytea, DataType.text],
    returns: DataType.text,
    implementation: (bytes, format) => {
      if (format !== "hex") throw new Error("Only hexadecimal test blobs are supported.");
      if (!Buffer.isBuffer(bytes)) throw new Error("Expected bytea test data.");
      return bytes.toString("hex");
    },
  });
  const adapter = memory.adapters.createPg() as { Pool: new () => Pool };
  return new PostgresDatabase(new adapter.Pool());
};
