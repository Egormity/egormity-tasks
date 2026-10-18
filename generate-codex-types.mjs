import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
const version = execFileSync("codex", ["--version"], { encoding: "utf8" }).trim();
if (version !== "codex-cli 0.162.1") throw new Error(`Expected Codex 0.162.1, got ${version}`);
const temporary = mkdtempSync(join(tmpdir(), "internal-tasks-protocol-"));
try {
  execFileSync("codex", ["app-server", "generate-ts", "--experimental", "--out", temporary]);
  const copied = new Set();
  function copy(name) {
    if (copied.has(name)) return;
    copied.add(name);
    const source = readFileSync(join(temporary, name), "utf8");
    for (const [, dependency] of source.matchAll(/from "([^"]+)"/g)) {
      copy(relative(temporary, resolve(temporary, dirname(name), `${dependency}.ts`)));
    }
    const target = join("src/api/contracts/codex", name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source.replace(/from "([^"]+)"/g, 'from "$1.js"'));
  }
  for (const name of [
    "Thread",
    "ThreadItem",
    "Turn",
    "UserInput",
    "ToolRequestUserInputParams",
    "McpServerElicitationRequestResponse",
    "Model",
    "ThreadSettings",
    "ThreadResumeResponse",
    "ThreadBackgroundTerminal",
    "GetAccountResponse",
    "GetAccountRateLimitsResponse",
  ])
    copy(`v2/${name}.ts`);
  console.log(`Generated ${copied.size} protocol types from ${version}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
