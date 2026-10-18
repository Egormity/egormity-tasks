import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, RpcMessage, Snapshot, Thread } from "@contracts/agent.js";
import { ApiError, request } from "@/shared/http/api";
import { applyCodexEvent } from "./agent-events";
import {
  ConfirmationCancelled,
  useConfirmation,
} from "@/features/confirmation/useConfirmation";
import { confirmationActionSchema } from "@contracts/confirmation.js";
import {
  readWorkspaceLocation,
  writeChatLocation,
  writeDraftLocation,
  writeTaskLocation,
} from "@/app/navigation";
import { mergeThreadHistory } from "./thread-history";
import type { AgentCommand, ModelSettings } from "@contracts/commands.js";
import { createChat, linkTaskChat } from "@/features/board/discussion/api";

export const useWorkspace = (onSessionExpired: () => void, taskId?: string) => {
  const confirmation = useConfirmation();
  const [chatId, setChatId] = useState<string | null>(() => readWorkspaceLocation().chatId);
  const [scope, setScope] = useState(() => readWorkspaceLocation().chatScope);
  const [draft, setDraft] = useState(() => readWorkspaceLocation().draft);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<RpcMessage[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useRef<{
    text: string;
    files: File[];
    target: string;
    requestId: string;
    attachments: string[];
    sent: boolean;
    settings: ModelSettings | undefined;
  } | null>(null);
  const selectChat = (id: string, replace = false) => {
    setChatId(id);
    writeChatLocation(id, replace);
  };
  useEffect(() => {
    const change = () => {
      setChatId(readWorkspaceLocation().chatId);
      setScope(readWorkspaceLocation().chatScope);
      setDraft(readWorkspaceLocation().draft);
      setError("");
      retry.current = null;
    };
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let refreshing = false;
    let refreshAgain = false;
    let history: Thread | null = null;
    let externalActivity = "";
    const activityKey = (status: Snapshot["status"]) =>
      (status.externalTurns ?? [])
        .map((turn) => `${turn.threadId}:${turn.turnId}`)
        .sort()
        .join("|");
    let live: RpcMessage[] = [];
    const refresh = async () => {
      if (abort.signal.aborted) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      refreshAgain = false;
      live = [];
      try {
        const query = new URLSearchParams();
        if (chatId) query.set("chatId", chatId);
        if (taskId) query.set("taskId", taskId);
        else if (scope) query.set("scope", scope);
        const anchor = history?.turns.at(-1)?.id;
        if (anchor) query.set("sinceTurnId", anchor);
        const result = await request<Snapshot>(
          `/snapshot${query.size ? `?${query}` : ""}`,
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        history = result.partial ? mergeThreadHistory(history, result.detail) : result.detail;
        if (result.partial && !history) {
          refreshAgain = true;
          return;
        }
        externalActivity = activityKey(result.status);
        // Preserve live deltas received after the native snapshot's cursor.
        setSnapshot({
          ...result,
          requests: result.requests ?? [],
          detail: live
            .filter((event) => (event.sequence ?? Infinity) > result.cursor)
            .reduce(applyCodexEvent, history),
        });
        setConnected(true);
        setLoadFailed(false);
        setError("");
        if (!chatId && !taskId && !draft && result.chats[0]) {
          setChatId(result.chats[0].id);
          writeChatLocation(result.chats[0].id, true);
        }
      } catch (cause) {
        if (abort.signal.aborted) return;
        if (
          taskId &&
          cause instanceof ApiError &&
          cause.status === 409 &&
          cause.message === "This conversation is not linked to this task."
        ) {
          writeTaskLocation(taskId, undefined, true);
          return;
        }
        setConnected(false);
        setLoadFailed(true);
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) onSessionExpired();
        else setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        refreshing = false;
        if (!abort.signal.aborted) {
          setLoading(false);
          // A persistence update during this read must not be lost.
          if (refreshAgain) void refresh();
        }
      }
    };
    const stream = typeof EventSource !== "undefined" ? new EventSource("/api/events") : null;
    const boardStream =
      !taskId && typeof EventSource !== "undefined"
        ? new EventSource("/api/board/events")
        : null;
    if (boardStream) {
      let version: string | undefined;
      boardStream.onmessage = (message) => {
        const next = (JSON.parse(message.data as string) as { version: string }).version;
        if (next !== version) void refresh();
        version = next;
      };
    }
    if (stream) {
      stream.onopen = () => void refresh();
      stream.onerror = () => {
        setConnected(false);
      };
      stream.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as RpcMessage;
        if (event.method === "bridge/historyChanged") {
          // This is a cache invalidation, not a synthetic Codex item or approval request.
          void refresh();
          return;
        }
        if (refreshing) live.push(event);
        setEvents((value) => [...value, event]);
        setSnapshot((value) => {
          if (!value) return value;
          let requests = value.requests;
          if (event.id !== undefined)
            requests = [...requests.filter((item) => item.id !== event.id), event];
          if (event.method === "bridge/requestResolved")
            requests = requests.filter((item) => item.id !== event.params.id);
          if (event.method === "serverRequest/resolved")
            requests = requests.filter((item) => item.id !== event.params.requestId);
          if (event.method === "turn/completed")
            requests = requests.filter(
              (item) => item.params.threadId !== event.params.threadId,
            );
          const status =
            event.method === "turn/started"
              ? {
                  ...value.status,
                  busy: true,
                  canStop: true,
                  activeChatId: String(event.params.threadId),
                }
              : value.status;
          return { ...value, requests, status, detail: applyCodexEvent(value.detail, event) };
        });
        if (
          [
            "turn/completed",
            "thread/name/updated",
            "bridge/disconnected",
            "bridge/connected",
          ].includes(event.method)
        )
          void refresh();
      };
    }
    setLoading(true);
    void refresh();
    // Authentication/login and admission can change without an active Codex thread.
    const poll = async () => {
      try {
        const status = await request<Snapshot["status"]>("/status", undefined, abort.signal);
        if (!abort.signal.aborted) {
          setSnapshot((value) => (value ? { ...value, status } : value));
          // Process exit can release a native writer lock without another history write.
          if (activityKey(status) !== externalActivity) {
            externalActivity = activityKey(status);
            void refresh();
          }
        }
      } catch (cause) {
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) onSessionExpired();
        else if (!abort.signal.aborted) setConnected(false);
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      abort.abort();
      clearTimeout(timer);
      stream?.close();
      boardStream?.close();
    };
  }, [chatId, scope, taskId, draft, revision, onSessionExpired]);
  const act = useCallback(async (action: () => Promise<void>) => {
    setPending(true);
    setError("");
    try {
      await action();
      setRevision((value) => value + 1);
      return true;
    } catch (cause) {
      if (!(cause instanceof ConfirmationCancelled))
        setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  return {
    confirmation,
    chatId,
    snapshot,
    error,
    pending,
    connected,
    loading,
    loadFailed,
    events,
    reload: () => setRevision((value) => value + 1),
    setChatId: (id: string) => {
      if (id !== chatId) {
        setLoading(true);
        setError("");
      }
      selectChat(id);
      retry.current = null;
    },
    create: () => {
      writeDraftLocation(taskId ?? snapshot?.linkedTask?.id);
      return Promise.resolve(true);
    },
    rename: (name: string) =>
      act(async () => {
        await request(`/chats/${chatId}/name`, { name });
      }),
    send: (text: string, files: File[], settings?: ModelSettings) =>
      act(async () => {
        let submission = retry.current;
        const contextTaskId = taskId ?? snapshot?.linkedTask?.id;
        if (
          !submission ||
          (!submission.sent &&
            (submission.text !== text ||
              JSON.stringify(submission.settings) !== JSON.stringify(settings) ||
              files.some((file, i) => file !== submission?.files[i]) ||
              files.length !== submission.files.length))
        ) {
          const target = chatId ?? submission?.target ?? (await createChat(contextTaskId));
          submission = {
            text,
            files,
            target,
            requestId: crypto.randomUUID(),
            attachments: [],
            sent: false,
            settings,
          };
          retry.current = submission;
        }
        for (const file of files.slice(submission.attachments.length)) {
          const response = await fetch(`/api/chats/${submission.target}/files`, {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-File-Name": encodeURIComponent(file.name),
            },
            body: file,
          });
          if (!response.ok)
            throw new Error(((await response.json()) as { error: string }).error);
          submission.attachments.push(((await response.json()) as Attachment).id);
        }
        if (!submission.sent)
          await confirmation.run({
            kind: "message",
            chatId: submission.target,
            input: {
              text,
              requestId: submission.requestId,
              attachments: submission.attachments,
              ...(contextTaskId ? { taskId: contextTaskId } : {}),
              ...(submission.settings ? { settings: submission.settings } : {}),
            },
          });
        submission.sent = true;
        // Publishing a task link and URL happens only after Codex accepts the first input.
        // A failed link write can be retried without sending the message a second time.
        if (taskId && !chatId) await linkTaskChat(taskId, submission.target);
        selectChat(submission.target);
        retry.current = null;
      }),
    respond: (id: string | number, result: unknown) =>
      act(async () => {
        await confirmation.run(
          confirmationActionSchema.parse({ kind: "response", input: { id, result } }),
        );
      }),
    connect: () =>
      act(async () => {
        await confirmation.run({ kind: "login", input: {} });
      }),
    command: (input: AgentCommand) =>
      act(async () => {
        if (!chatId) return;
        await confirmation.run({ kind: "command", chatId, input });
      }),
    stopTerminals: (processId?: string) =>
      act(async () => {
        if (chatId) await request(`/chats/${chatId}/stop`, { target: "terminals", processId });
      }),
    stop: () =>
      act(async () => {
        if (chatId) await request(`/chats/${chatId}/stop`, { target: "turn" });
      }),
  };
};
