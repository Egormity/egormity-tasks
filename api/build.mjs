import { build } from "esbuild";
import { rm } from "node:fs/promises";

const outdir = "dist/api";
await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: {
    main: "src/api/main.ts",
    "import-main": "src/api/board/import-main.ts",
    "migrate-sqlite": "src/api/database/migrate-sqlite-main.ts",
  },
  outdir,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
