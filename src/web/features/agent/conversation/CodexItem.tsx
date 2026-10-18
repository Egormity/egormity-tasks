import type { ThreadItem } from "@contracts/agent.js";
import Markdown from "react-markdown";
import { usePreferences } from "@/shared/i18n/preferences";
import { userMessagePresentation } from "./user-message";

export const attachmentUrl = (path: string) => {
  const match = /\/uploads\/([0-9a-f-]{36})\/[^/]+$/iu.exec(path);
  return match ? `/api/files/${match[1]}` : null;
};
const markdownClass =
  "[&_a]:text-accent [&_pre]:bg-code space-y-3 wrap-anywhere [&_a]:underline [&_code]:font-mono [&_h1]:text-xl [&_h2]:text-lg [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_ul]:list-disc";
const Text = ({ children }: { children: string }) => (
  <div className={markdownClass}>
    <Markdown
      urlTransform={(url) =>
        attachmentUrl(url) ?? (/^(https?:|mailto:|\/api\/files\/)/iu.test(url) ? url : "")
      }
    >
      {children}
    </Markdown>
  </div>
);

export const CodexItem = ({ item }: { item: ThreadItem }) => {
  const { copy } = usePreferences();
  if (item.type === "userMessage")
    return (
      <article
        aria-label={copy.userMessage}
        className="bg-accent/10 border-accent/25 border-l-accent space-y-3 rounded-xl border border-l-4 p-4 text-base leading-7 font-medium sm:px-5"
      >
        {item.content.map((part, index) => {
          if (part.type === "text") {
            const { text, context } = userMessagePresentation(part.text);
            return (
              <div key={index} className="space-y-3">
                {context && (
                  <details className="text-muted text-xs font-normal">
                    <summary className="cursor-pointer">
                      {copy.taskContext}: {context.task.title}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap">{context.task.description}</p>
                  </details>
                )}
                <Text>{text}</Text>
              </div>
            );
          }
          if (part.type === "localImage") {
            const url = attachmentUrl(part.path);
            return url ? (
              <a key={index} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={part.path.split("/").at(-1)}
                  className="max-h-80 max-w-full rounded-lg"
                />
              </a>
            ) : (
              <pre key={index}>{part.path}</pre>
            );
          }
          if (part.type === "image" && "url" in part)
            return (
              <a key={index} href={/^https?:/iu.test(part.url) ? part.url : undefined}>
                {copy.attachments}
              </a>
            );
          return (
            <pre key={index} className="whitespace-pre-wrap">
              {JSON.stringify(part, null, 2)}
            </pre>
          );
        })}
      </article>
    );
  if (item.type === "agentMessage")
    return (
      <article className="space-y-3 text-sm leading-7">
        <p className="text-muted text-xs font-semibold">
          {copy.authorAgent}
          {item.phase === "commentary" ? ` · ${copy.working}` : ""}
        </p>
        <Text>{item.text}</Text>
      </article>
    );
  if (item.type === "reasoning") {
    const text = [...item.summary, ...item.content].filter((part) => part.trim()).join("\n\n");
    if (!text) return null;
    return (
      <details className="text-muted text-sm" open={false}>
        <summary className="cursor-pointer">{copy.reasoning}</summary>
        <Text>{text}</Text>
      </details>
    );
  }
  if (item.type === "commandExecution")
    return (
      <details
        open={item.status === "inProgress"}
        className="border-line rounded-lg border text-xs"
      >
        <summary className="cursor-pointer p-3">
          <span className="inline-flex w-[calc(100%-1rem)] items-baseline gap-2 align-top">
            <span className="min-w-0 flex-1 truncate font-mono" title={item.command}>
              {item.command}
            </span>
            <span className="text-muted shrink-0">
              {item.status}
              {item.exitCode !== null ? ` · ${item.exitCode}` : ""}
            </span>
          </span>
        </summary>
        <pre className="border-line border-t p-3 whitespace-pre-wrap">{item.command}</pre>
        <pre className="bg-code p-4 whitespace-pre-wrap">{item.aggregatedOutput}</pre>
      </details>
    );
  if (item.type === "fileChange")
    return (
      <details className="border-line rounded-lg border text-xs">
        <summary className="cursor-pointer p-3">
          {copy.fileChanges} · {item.status}
        </summary>
        {item.changes.map((change, index) => (
          <div key={index} className="p-3">
            <p className="mb-2 font-mono">{change.path}</p>
            <pre className="bg-code p-3 whitespace-pre-wrap">{change.diff}</pre>
          </div>
        ))}
      </details>
    );
  if (item.type === "plan")
    return (
      <section className="border-line rounded-lg border p-4 text-sm">
        <p className="text-muted mb-2">{copy.plan}</p>
        <Text>{item.text}</Text>
      </section>
    );
  return (
    <details className="border-line rounded-lg border text-xs">
      <summary className="cursor-pointer p-3">{item.type}</summary>
      <pre className="bg-code p-4 whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
    </details>
  );
};
