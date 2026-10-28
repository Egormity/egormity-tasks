import { parseInternalTasksEnvironment } from "./config.js";

import { createApplication } from "./app.js";
import { PostgresDatabase } from "./database/database.js";

const config = parseInternalTasksEnvironment(process.env);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const store = new PostgresDatabase(process.env.DATABASE_URL);

const application = await createApplication(config, store);

const server = application.app.listen(config.port, "0.0.0.0");

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  server.closeAllConnections();
  void application.close().finally(() => store.close());
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
