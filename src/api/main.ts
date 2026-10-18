import { parseInternalTasksEnvironment } from "./config.js";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createApplication } from "./app.js";
import { BoardDatabase } from "./board/database.js";

const config = parseInternalTasksEnvironment(process.env);
await mkdir(config.dataDirectory, { recursive: true, mode: 0o700 });
const store = new BoardDatabase(join(config.dataDirectory, "chats.sqlite"));

const application = createApplication(config, store);

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
