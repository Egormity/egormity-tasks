import { parseInternalTasksAgentEnvironment } from "./config.js";
import { access, mkdir } from "node:fs/promises";
import { readAgentInstructions } from "./instructions/instructions.js";

import { createWorker } from "./app.js";

const config = parseInternalTasksAgentEnvironment(process.env);

if (config.sandbox === "danger-full-access") await access("/.dockerenv");
await mkdir(config.codexHome, { recursive: true, mode: 0o700 });
await readAgentInstructions(config);
const worker = createWorker(config, process.env.PATH ?? "");

const server = worker.app.listen(config.workerPort, "0.0.0.0");

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  server.closeAllConnections();
  void worker.close();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
