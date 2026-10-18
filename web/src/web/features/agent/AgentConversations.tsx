import type { ExternalTurn, Thread } from "@contracts/agent.js";
import { LoaderCircle, SquarePen } from "lucide-react";
import { Select } from "@/shared/ui/Select";
import { usePreferences } from "@/shared/i18n/preferences";
import type { ChatScope, TaskChatLink } from "@contracts/task-agent.js";

export const AgentConversations = ({
  chats,
  chatId,
  activeChatId,
  externalTurns,
  disabled,
  onCreate,
  onSelect,
  scope,
  onScope,
  taskChats,
}: {
  chats: Thread[];
  chatId: string | null;
  activeChatId: string | null;
  externalTurns: ExternalTurn[];
  disabled: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
  scope: ChatScope;
  onScope: (scope: ChatScope) => void;
  taskChats: TaskChatLink[];
}) => {
  const { copy } = usePreferences();
  const options = chats.map((chat) => {
    const name = (chat.name ?? chat.preview).trim();
    return {
      value: chat.id,
      label:
        !name || name === "New conversation"
          ? (taskChats.find((link) => link.chatId === chat.id)?.taskTitle ?? copy.newChat)
          : name,
    };
  });
  return (
    <aside className="border-line bg-panel flex min-h-0 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 lg:w-56 lg:max-w-56 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-3 lg:border-r lg:border-b-0 lg:p-3">
      <div role="group" aria-label={copy.chatScope} className="flex w-full gap-1">
        {(["general", "tasks"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={scope === value}
            onClick={() => onScope(value)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs ${scope === value ? "bg-selected text-ink" : "text-muted hover:bg-canvas"}`}
          >
            {value === "general" ? copy.generalChats : copy.taskChats}
          </button>
        ))}
      </div>
      <button
        aria-label={copy.newChat}
        title={copy.newChat}
        className="border-line hover:bg-canvas flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm disabled:opacity-50 lg:h-10 lg:w-full lg:px-3"
        onClick={onCreate}
        disabled={disabled}
      >
        <SquarePen aria-hidden="true" size={18} className="lg:hidden" />
        <span className="hidden lg:inline">{copy.newChat}</span>
      </button>
      <div className="min-w-0 flex-1 lg:hidden">
        <Select
          label={copy.conversations}
          hideLabel
          className="h-11 text-base sm:text-sm"
          value={chatId ?? ""}
          options={options.length ? options : [{ value: "", label: copy.emptyChats }]}
          disabled={!options.length}
          onChange={onSelect}
        />
      </div>
      <nav
        aria-label={copy.conversations}
        className="scroll-area hidden min-h-0 w-full min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-1 lg:flex"
      >
        {options.map((chat) => (
          <button
            key={chat.value}
            title={chat.label}
            aria-current={chatId === chat.value ? "page" : undefined}
            className={`w-full min-w-0 max-w-full shrink-0 rounded-lg px-3 py-2 text-left text-sm ${chatId === chat.value ? "bg-selected text-ink" : "text-muted hover:bg-canvas"}`}
            onClick={() => onSelect(chat.value)}
          >
            <span className="block truncate">{chat.label}</span>
            {(activeChatId === chat.value ||
              externalTurns.some((turn) => turn.threadId === chat.value)) && (
              <span className="text-accent mt-1 flex items-center gap-1 text-xs">
                <LoaderCircle
                  aria-hidden="true"
                  size={12}
                  className="motion-safe:animate-spin"
                />
                {copy.working}
              </span>
            )}
          </button>
        ))}
        {!options.length && <p className="text-muted text-xs leading-6">{copy.emptyChats}</p>}
      </nav>
    </aside>
  );
};
