import { build } from "esbuild";
import { copyFile, rm } from "node:fs/promises";

const app = process.argv[2];
if (app !== "api" && app !== "agent") throw new Error("Expected api or agent");
const outdir = `dist/${app}`;
await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints:
    app === "api"
      ? { main: "src/api/main.ts", "import-main": "src/api/board/import-main.ts" }
      : { main: "src/agent/main.ts" },
  outdir,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
if (app === "agent")
  await copyFile("src/agent/tasks/submit-verdict.mjs", `${outdir}/submit-verdict.mjs`);
