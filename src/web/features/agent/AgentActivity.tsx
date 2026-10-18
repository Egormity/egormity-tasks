import { LoaderCircle } from "lucide-react";
import type { AgentStatus } from "@contracts/agent.js";
import { usePreferences } from "@/shared/i18n/preferences";

export const AgentActivity = ({
  status,
  connected,
  chatId,
  busy,
}: {
  status: AgentStatus | undefined;
  connected: boolean;
  chatId: string | null;
  busy: boolean;
}) => {
  const { copy } = usePreferences();
  const external =
    !!chatId && !!status?.externalTurns?.some((turn) => turn.threadId === chatId);
  const working =
    connected && !!chatId && (busy || external || status?.activeChatId === chatId);
  const label = !connected
    ? copy.unavailable
    : working
      ? external
        ? copy.workingCli
        : copy.working
      : status?.authenticated
        ? copy.ready
        : copy.offline;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex max-w-36 items-center gap-2 text-xs sm:max-w-none ${working ? "text-accent" : "text-muted"}`}
    >
      {working ? (
        <LoaderCircle
          aria-hidden="true"
          size={16}
          className="shrink-0 motion-safe:animate-spin"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-current"}`}
        />
      )}
      <span>{label}</span>
    </span>
  );
};
