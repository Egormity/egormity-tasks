import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import type { RpcMessage, Thread } from "@contracts/agent.js";
import { ChatComposer } from "@/features/agent/composer/ChatComposer";
import { CodexItem } from "./CodexItem";
import { CodexRequests } from "@/features/agent/requests/CodexRequests";
import { usePreferences } from "@/shared/i18n/preferences";
import type { AgentCommand, ModelSettings } from "@contracts/commands.js";
import type { Task } from "@contracts/board.js";
import { AsyncQuestions } from "@/features/agent/requests/AsyncQuestions";
import { answeredQuestions } from "@/features/agent/requests/async-questions";

export const Conversation = ({
  detail,
  loading,
  loadFailed,
  onReload,
  events,
  requests,
  busy,
  canStop,
  disabled,
  onSend,
  onStop,
  onRespond,
  onCommand,
  onStopTerminals,
  onNew,
  task,
}: {
  detail: Thread | null;
  loading: boolean;
  loadFailed: boolean;
  onReload: () => void;
  events: RpcMessage[];
  requests: RpcMessage[];
  busy: boolean;
  canStop: boolean;
  disabled: boolean;
  onSend: (text: string, files: File[], settings?: ModelSettings) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onRespond: (id: string | number, result: unknown) => Promise<boolean>;
  onCommand: (input: AgentCommand) => Promise<boolean>;
  onStopTerminals: (processId?: string) => Promise<boolean>;
  onNew: () => Promise<boolean>;
  task?: Task | undefined;
}) => {
  const { copy } = usePreferences();
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const answered = answeredQuestions(detail);
  useEffect(() => {
    if (following.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [detail]);
  return (
    <>
      <div
        ref={scroll}
        role="region"
        aria-label={copy.history}
        aria-busy={loading}
        tabIndex={0}
        className="scroll-area min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-6"
        onScroll={(event) => {
          const el = event.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        <div className="agent-content space-y-5">
          {loading ? (
            <div role="status" className="text-muted flex items-center gap-2 py-3 text-sm">
              <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
              {copy.loadingHistory}
            </div>
          ) : loadFailed ? (
            <div className="py-3 text-sm">
              <p className="text-muted">{copy.loadFailed}</p>
              <button className="text-accent mt-3 underline" onClick={onReload}>
                {copy.refresh}
              </button>
            </div>
          ) : !detail?.turns.length ? (
            <div className="py-16 text-center">
              <h2 className="text-3xl font-medium tracking-tight">{copy.emptyTitle}</h2>
              <p className="text-muted mt-4 text-sm leading-6">{copy.emptyDescription}</p>
            </div>
          ) : null}
          {detail?.turns.map((turn) => (
            <section key={turn.id} className="space-y-5">
              {turn.items.map((item) =>
                item.type === "agentMessage" && item.questions?.length ? (
                  <AsyncQuestions
                    key={item.id}
                    item={item}
                    answered={answered}
                    disabled={disabled}
                    onSend={(text) => onSend(text, [])}
                  />
                ) : (
                  <CodexItem key={item.id} item={item} />
                ),
              )}
              {turn.error && (
                <p role="alert" className="text-danger text-sm">
                  {turn.error.message}
                </p>
              )}
              {turn.status === "interrupted" && (
                <p className="text-muted text-sm">{copy.interrupted}</p>
              )}
            </section>
          ))}
          <CodexRequests
            events={requests.filter(
              (event) => !event.params.threadId || event.params.threadId === detail?.id,
            )}
            disabled={disabled}
            onRespond={onRespond}
          />
          {!loading && !loadFailed && events.length > 0 && (
            <details className="text-muted rounded-lg text-xs">
              <summary className="cursor-pointer">
                {copy.protocolEvents} ({events.length})
              </summary>
              <div className="mt-3 space-y-2">
                {events.map((event, index) => (
                  <details key={index}>
                    <summary className="cursor-pointer font-mono">{event.method}</summary>
                    <pre className="bg-code p-3 whitespace-pre-wrap">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </details>
          )}
          {detail?.turns.some((turn) => turn.status === "inProgress") && (
            <p className="text-accent flex items-center gap-2 text-xs">
              <LoaderCircle aria-hidden="true" size={16} className="motion-safe:animate-spin" />
              {copy.running}
            </p>
          )}
        </div>
      </div>
      <ChatComposer
        key={detail?.id ?? "loading"}
        task={task}
        disabled={disabled || loading || loadFailed}
        chatId={detail?.id ?? null}
        onCommand={onCommand}
        onStopTerminals={onStopTerminals}
        onNew={onNew}
        busy={busy}
        canStop={canStop}
        onSend={onSend}
        onStop={onStop}
      />
    </>
  );
};
