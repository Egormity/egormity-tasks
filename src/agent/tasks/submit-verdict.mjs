import { readFile } from "node:fs/promises";

try {
  const config = JSON.parse(await readFile(process.argv[2], "utf8"));
  let verdict = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    verdict += chunk;
    if (verdict.length > 8000) throw new Error("Verdict exceeds 8000 characters.");
  }
  if (!verdict.trim()) throw new Error("Provide a verdict on stdin.");
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ chatId: config.chatId, revision: config.revision, verdict }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 409)
      throw new Error(
        "Task or linked chat changed. Request a fresh task snapshot before saving again.",
      );
    throw new Error(`Verdict was not saved (HTTP ${response.status}).`);
  }
  console.log(JSON.stringify(await response.json()));
} catch (error) {
  // Do not print configuration, bearer tokens or fetch internals.
  console.error(
    error instanceof Error && !["TypeError", "SyntaxError"].includes(error.name)
      ? error.message
      : "Could not save the task verdict.",
  );
  process.exitCode = 1;
}
