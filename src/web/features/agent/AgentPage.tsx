import { useState } from "react";
import { Pencil, Info } from "lucide-react";
import { Conversation } from "@/features/agent/conversation/Conversation";
import { AgentContext } from "./AgentContext";
import { AgentConversations } from "./AgentConversations";
import { usePreferences } from "@/shared/i18n/preferences";
import { useWorkspace } from "@/features/agent/state/useWorkspace";
import { TelegramConfirmation } from "@/features/confirmation/TelegramConfirmation";
import { AgentActivity } from "./AgentActivity";
import { taskDiscussionHref, writeChatScope } from "@/app/navigation";
import { AppLink } from "@/app/AppLink";
import type { Task } from "@contracts/board.js";
import { AppDialog } from "@/shared/ui/AppDialog";

export const AgentPage = ({
  onSessionExpired,
  taskId,
  task,
}: {
  onSessionExpired: () => void;
  taskId?: string;
  task?: Task | undefined;
}) => {
  const state = useWorkspace(onSessionExpired, taskId);
  const { copy, errorText } = usePreferences();
  const [context, setContext] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const status = state.snapshot?.status;
  const detail = state.snapshot?.detail?.id === state.chatId ? state.snapshot.detail : null;
  const selectedChat = detail ?? state.snapshot?.chats.find((chat) => chat.id === state.chatId);
  const linkedTask = task ?? (detail ? state.snapshot?.linkedTask : null);
  const busy =
    detail?.status?.type === "active" ||
    !!detail?.turns.some((turn) => turn.status === "inProgress");
  const loading = !detail && (state.loading || (!!state.chatId && !state.error));
  const title = (value?: string | null) =>
    !value || value === "New conversation" ? copy.newChat : value;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <TelegramConfirmation state={state.confirmation} />
      {!taskId && (
        <AgentConversations
          chats={state.snapshot?.chats ?? []}
          chatId={state.chatId}
          activeChatId={status?.activeChatId ?? null}
          externalTurns={status?.externalTurns ?? []}
          disabled={
            state.pending ||
            state.loading ||
            !state.connected ||
            (state.snapshot?.chatScope === "tasks" && !linkedTask)
          }
          onCreate={() => void state.create()}
          scope={state.snapshot?.chatScope ?? "general"}
          taskChats={state.snapshot?.taskChats ?? []}
          onScope={writeChatScope}
          onSelect={(id) => {
            state.setChatId(id);
            setEditing(false);
          }}
        />
      )}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {editing ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void state.rename(name).then((ok) => {
                    if (ok) setEditing(false);
                  });
                }}
              >
                <input
                  aria-label={copy.renameChat}
                  className="border-line bg-canvas min-w-0 flex-1 rounded border px-3 py-1 text-sm"
                  value={name}
                  maxLength={120}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false);
                  }}
                />
                <button
                  disabled={state.pending || !name.trim()}
                  className="text-accent text-xs"
                >
                  {copy.save}
                </button>
                <button
                  type="button"
                  className="text-muted text-xs"
                  onClick={() => setEditing(false)}
                >
                  {copy.cancel}
                </button>
              </form>
            ) : (
              <>
                <h1 className="truncate text-sm font-medium">
                  {selectedChat
                    ? title(selectedChat.name || selectedChat.preview || linkedTask?.title)
                    : loading
                      ? copy.loading
                      : copy.newChat}
                </h1>
                {detail && (
                  <button
                    aria-label={copy.renameChat}
                    title={copy.renameChat}
                    className="text-muted hover:text-ink shrink-0 p-1"
                    onClick={() => {
                      setName(detail.name ?? detail.preview);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              title={copy.context}
              aria-label={copy.context}
              aria-expanded={context}
              onClick={() => setContext((value) => !value)}
              className="text-muted hover:text-ink p-1"
            >
              <Info size={18} />
            </button>
            <AgentActivity
              status={status}
              connected={state.connected}
              chatId={state.chatId}
              busy={busy}
            />
          </div>
        </header>
        {!taskId && linkedTask && (
          <AppLink
            href={taskDiscussionHref(linkedTask.id, state.chatId ?? undefined)}
            className="border-line bg-accent/10 text-accent border-b px-4 py-3 text-sm sm:px-6"
          >
            {copy.linkedTask}: {linkedTask.title} · {copy.openTask}
          </AppLink>
        )}
        {context && (
          <AppDialog open title={copy.context} onClose={() => setContext(false)} wide>
            <AgentContext
              key={`context:${state.chatId ?? "new"}`}
              chatId={state.chatId}
              taskId={linkedTask?.id}
            />
          </AppDialog>
        )}
        {state.error && (
          <p
            role="alert"
            className="border-line text-danger shrink-0 border-b px-4 py-3 text-sm wrap-anywhere sm:px-6"
          >
            {errorText(state.error)}
          </p>
        )}
        {status && !status.authenticated && (
          <section className="border-line bg-panel border-b px-5 py-5">
            <p className="text-sm">{copy.connectDescription}</p>
            <button
              className="bg-accent text-on-accent mt-3 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              disabled={state.pending || status.loginRunning || status.busy}
              onClick={() => void state.connect()}
            >
              {copy.connect}
            </button>
            {status.loginOutput && (
              <div className="mt-4">
                <p className="text-muted text-xs">{copy.completeLogin}</p>
                <pre className="bg-code mt-2 overflow-auto rounded-lg p-4 text-sm whitespace-pre-wrap">
                  {status.loginOutput}
                </pre>
              </div>
            )}
          </section>
        )}
        <Conversation
          task={linkedTask ?? undefined}
          key={`conversation:${state.chatId ?? "new"}`}
          detail={detail}
          onCommand={state.command}
          onStopTerminals={state.stopTerminals}
          onNew={state.create}
          loading={loading}
          loadFailed={!detail && state.loadFailed}
          onReload={state.reload}
          events={state.events.filter(
            (event) =>
              !!state.chatId &&
              (!event.params.threadId || event.params.threadId === state.chatId),
          )}
          requests={state.chatId ? (state.snapshot?.requests ?? []) : []}
          busy={busy}
          canStop={!!detail}
          disabled={
            state.pending ||
            !state.connected ||
            !status?.authenticated ||
            (!taskId && state.snapshot?.chatScope === "tasks" && !linkedTask)
          }
          onSend={state.send}
          onStop={state.stop}
          onRespond={state.respond}
        />
      </section>
    </div>
  );
};
