import type { ReactNode } from "react";
import type { SessionStatus } from "@contracts/session-status.js";
import { usePreferences } from "@/shared/i18n/preferences";

export const CodexStatus = ({
  status,
  refresh,
}: {
  status: SessionStatus;
  refresh: () => void;
}) => {
  const { copy, locale } = usePreferences();
  const number = new Intl.NumberFormat(locale);
  const states = {
    ready: copy.ready,
    working: copy.working,
    waiting: copy.awaitingResponse,
    offline: copy.offline,
  };
  const field = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-muted mb-1 text-xs">{label}</dt>
      <dd className="min-h-5 wrap-anywhere">{value}</dd>
    </div>
  );
  const speed = !status.settingsAvailable
    ? ""
    : status.serviceTier === "fast" || status.serviceTier === "priority"
      ? "Fast"
      : !status.serviceTier || status.serviceTier === "default"
        ? copy.standardSpeed
        : status.serviceTier;
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {field(copy.status, states[status.state])}
        {field(copy.model, status.model)}
        {field(copy.reasoningEffort, status.effort)}
        {field(copy.speed, speed)}
        {field(
          copy.codexAccount,
          status.account &&
            `${status.account.type === "chatgpt" ? "ChatGPT" : status.account.type}${status.account.plan ? ` · ${status.account.plan}` : ""}`,
        )}
        {field(copy.codexThread, status.threadId)}
        {field(
          copy.contextUsage,
          status.context && (
            <>
              {number.format(status.context.tokens)}
              {status.context.window ? ` / ${number.format(status.context.window)}` : ""}
            </>
          ),
        )}
        {field(copy.totalTokens, status.context && number.format(status.context.totalTokens))}
      </dl>
      <div className="border-line border-t pt-3">
        <h3 className="mb-2 font-medium">{copy.usageLimits}</h3>
        {!status.limitsAvailable && (
          <p className="text-muted text-xs">{copy.limitsUnavailable}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {status.limits.flatMap((bucket, index) =>
            [bucket.primary, bucket.secondary].map((window, slot) => {
              if (!window) return null;
              const mins = window.windowDurationMins;
              const period = !mins
                ? ""
                : mins % 1440 === 0
                  ? `${mins / 1440} ${copy.daysShort}`
                  : mins % 60 === 0
                    ? `${mins / 60} ${copy.hoursShort}`
                    : `${mins} ${copy.minutesShort}`;
              const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
              return (
                <div key={`${index}:${slot}`} className="min-w-0 space-y-1">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {bucket.name}
                      {period && ` · ${period}`}
                    </span>
                    <span>
                      {number.format(remaining)}% {copy.remaining}
                    </span>
                  </div>
                  <meter
                    className="w-full"
                    min={0}
                    max={100}
                    value={remaining}
                    aria-label={`${bucket.name} ${period}`}
                  />
                  {window.resetsAt !== null && (
                    <p className="text-muted text-xs">
                      {copy.resetsAt}: {new Date(window.resetsAt * 1000).toLocaleString(locale)}
                    </p>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <button type="button" className="text-accent" onClick={refresh}>
        {copy.refresh}
      </button>
    </div>
  );
};
