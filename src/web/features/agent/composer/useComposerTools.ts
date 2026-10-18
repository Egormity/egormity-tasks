import { useEffect, useRef, useState } from "react";
import type {
  AgentCommand,
  BackgroundTerminal,
  ChatControls,
  ModelSettings,
} from "@contracts/commands.js";
import type { ComposerCommand } from "./composer-commands";
import { request } from "@/shared/http/api";
import type { SessionStatus } from "@contracts/session-status.js";

export type ComposerActions = {
  onCommand: (input: AgentCommand) => Promise<boolean>;
  onStopTerminals: (processId?: string) => Promise<boolean>;
  onNew: () => Promise<boolean>;
  onStop: () => Promise<boolean>;
};
export const useComposerTools = (
  chatId: string | null,
  actions: ComposerActions,
  enabled = true,
) => {
  const [panel, setPanel] = useState<"settings" | "terminals" | "status" | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [controls, setControls] = useState<ChatControls | null>(null);
  const [terminals, setTerminals] = useState<BackgroundTerminal[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draftSettings, setDraftSettings] = useState<ModelSettings>();
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (!chatId && draftLoaded.current && panel !== "status") {
      setLoading(false);
      setError("");
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError("");
    const load =
      panel === "status"
        ? request<SessionStatus>(
            `/session-status${chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""}`,
            undefined,
            abort.signal,
          ).then((value) => {
            if (!abort.signal.aborted) setStatus(value);
          })
        : panel === "terminals" && chatId
          ? request<BackgroundTerminal[]>(
              `/chats/${chatId}/terminals`,
              undefined,
              abort.signal,
            ).then(setTerminals)
          : request<ChatControls>(
              chatId ? `/chats/${chatId}/controls` : "/controls",
              undefined,
              abort.signal,
            ).then((value) => {
              if (!abort.signal.aborted) {
                setControls(value);
                if (!chatId) draftLoaded.current = true;
              }
            });
    void load
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [chatId, panel, revision, enabled]);
  const execute = (id: ComposerCommand) => {
    if (id === "model" || id === "fast") setPanel("settings");
    if (id === "ps") setPanel("terminals");
    if (id === "compact") void actions.onCommand({ command: "compact" });
    if (id === "stop") void actions.onStop();
    if (id === "new") void actions.onNew();
    if (id === "status") {
      setPanel("status");
      setRevision((value) => value + 1);
    }
  };
  return {
    panel,
    setPanel,
    toggleSettings: () => setPanel((value) => (value === "settings" ? null : "settings")),
    controls,
    status:
      status && !chatId && controls
        ? {
            ...status,
            model: controls.model,
            effort: controls.effort,
            serviceTier: controls.serviceTier,
          }
        : status,
    draftSettings,
    terminals,
    error,
    loading,
    execute,
    refresh: () => setRevision((value) => value + 1),
    save: async (input: AgentCommand) => {
      setPanel(null);
      if (!chatId && input.command === "settings") {
        const { model, effort, serviceTier } = input;
        setDraftSettings({ model, effort, serviceTier });
        setControls(
          (value) =>
            value && {
              ...value,
              model,
              serviceTier,
              effort:
                value.models
                  .find((item) => item.model === model)
                  ?.supportedReasoningEfforts.find((item) => item.reasoningEffort === effort)
                  ?.reasoningEffort ?? null,
            },
        );
        return;
      }
      if (await actions.onCommand(input)) setRevision((value) => value + 1);
    },
    stopTerminals: async (processId?: string) => {
      if (await actions.onStopTerminals(processId)) setRevision((value) => value + 1);
    },
  };
};
