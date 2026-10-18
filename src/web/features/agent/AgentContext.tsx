import { useEffect, useState } from "react";
import type { AgentContext as Context } from "@contracts/agent.js";
import { request } from "@/shared/http/api";
import { usePreferences } from "@/shared/i18n/preferences";

export const AgentContext = ({
  chatId,
  taskId,
}: {
  chatId: string | null;
  taskId?: string | undefined;
}) => {
  const { copy } = usePreferences();
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (chatId) query.set("chatId", chatId);
    if (taskId) query.set("taskId", taskId);
    setContext(null);
    setError("");
    void request<Context>(
      `/context${query.size ? `?${query}` : ""}`,
      undefined,
      controller.signal,
    )
      .then(setContext)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [chatId, taskId]);
  return (
    <section className="min-w-0 text-sm">
      {!context && !error && (
        <p role="status" className="text-muted">
          {copy.loading}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {context && (
        <>
          <p className="text-muted mb-4">{copy.contextDescription}</p>
          <dl className="grid grid-cols-1 gap-2 break-all md:grid-cols-2">
            <dt>{copy.repository}</dt>
            <dd className="font-mono text-xs">{context.repository}</dd>
            <dt>{copy.workingDirectory}</dt>
            <dd className="font-mono text-xs">{context.cwd}</dd>
            <dt>{copy.branch}</dt>
            <dd>{context.branch}</dd>
            <dt>{copy.codexThread}</dt>
            <dd className="font-mono text-xs">{context.threadId}</dd>
            <dt>{copy.model}</dt>
            <dd>{context.model}</dd>
            <dt>{copy.codexState}</dt>
            <dd className="font-mono text-xs">{context.codexHome}</dd>
          </dl>
          <h3 className="mt-4 font-medium">{copy.sshAccess}</h3>
          {context.sshTargets.length === 0 && (
            <p className="text-muted mt-2">{copy.sshNotConfigured}</p>
          )}
          {context.sshTargets.map((target) => (
            <div key={target.id} className="mt-3">
              <p className="font-medium">
                {target.id === "main" ? copy.mainServer : copy.gatewayServer}
              </p>
              <p className="mt-1 break-all font-mono text-xs">
                {target.user}@{target.host}:{target.port} · {target.directory}
              </p>
              <p className="text-muted mt-1">
                {copy.sshAuthentication}:{" "}
                {target.authentication === "key"
                  ? copy.sshKey
                  : target.authentication === "password"
                    ? copy.sshPassword
                    : copy.sshAgent}
              </p>
            </div>
          ))}
          <p className="text-muted mt-4">{copy.instructionsDescription}</p>
          {context.instructions.map((instruction) => (
            <details key={instruction.path} className="mt-3">
              <summary className="cursor-pointer break-all font-mono text-xs">
                {instruction.path}
              </summary>
              <pre className="bg-code mt-2 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
                {instruction.text}
              </pre>
            </details>
          ))}
        </>
      )}
    </section>
  );
};
