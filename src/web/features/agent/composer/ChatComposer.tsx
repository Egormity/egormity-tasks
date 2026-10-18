import { useRef, useState } from "react";
import { Paperclip, Slash, ArrowUp, Square } from "lucide-react";
import { usePreferences } from "@/shared/i18n/preferences";
import { composerCommands, type ComposerCommand } from "./composer-commands";
import { useComposerTools, type ComposerActions } from "./useComposerTools";
import { ComposerTools } from "./ComposerTools";
import { ComposerSettingsSummary } from "./ComposerSettingsSummary";
import type { Task } from "@contracts/board.js";
import { TaskContextBar } from "@/features/board/discussion/TaskContextBar";
import { taskContextText } from "@/features/board/discussion/task-context";
import type { ModelSettings } from "@contracts/commands.js";
import { CommandDialog } from "./CommandDialog";
import { DraftAttachments } from "@/shared/ui/DraftAttachments";
import { useAutosizeTextarea } from "@/shared/ui/useAutosizeTextarea";

export const ChatComposer = ({
  disabled,
  busy,
  canStop,
  onSend,
  onStop,
  chatId,
  task,
  ...actions
}: {
  disabled: boolean;
  busy: boolean;
  canStop: boolean;
  onSend: (text: string, files: File[], settings?: ModelSettings) => Promise<boolean>;
  chatId: string | null;
  task?: Task | undefined;
} & ComposerActions) => {
  const { copy } = usePreferences();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const textarea = useAutosizeTextarea(draft);
  const tools = useComposerTools(chatId, { ...actions, onStop }, !disabled);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const locked = disabled || submitting;
  const commandDisabled = (id: ComposerCommand) =>
    locked || (!chatId && ["compact", "stop", "ps"].includes(id));
  const choose = (id: ComposerCommand) => {
    if (commandDisabled(id)) return;
    setMenu(false);
    if (/^\/\w*$/u.test(draft)) setDraft("");
    tools.execute(id);
  };
  const add = (incoming: File[]) => {
    if (locked) return false;
    const next = [...files, ...incoming];
    if (next.some((file) => !file.size || file.size > 20 * 1024 * 1024)) {
      setError(copy.fileTooLarge);
      return false;
    }
    if (next.length > 10 || next.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
      setError(copy.chatFileLimits);
      return false;
    }
    setError("");
    setFiles(next);
    return true;
  };
  const submit = async () => {
    if (locked || sending.current) return;
    const command = composerCommands(copy).find((value) => `/${value.id}` === draft.trim());
    if (command) {
      choose(command.id);
      return;
    }
    const text = task ? `${taskContextText(task, copy)}\n\n${draft.trim()}` : draft;
    if (text.length > 32000) {
      setError(copy.taskContextTooLong);
      return;
    }
    const send = () =>
      tools.draftSettings && !chatId
        ? onSend(text, files, tools.draftSettings)
        : onSend(text, files);
    if (!draft.trim() && !files.length) return;
    sending.current = true;
    setSubmitting(true);
    try {
      if (await send()) {
        setDraft("");
        setFiles([]);
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };
  return (
    <form
      className="border-line bg-panel min-w-0 shrink-0 border-t px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-3 sm:pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          if (!locked) setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        add(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="relative min-w-0">
        {task && <TaskContextBar task={task} />}
        <ComposerTools tools={tools} disabled={locked} returnFocus={textarea} />
        {menu && (
          <CommandDialog
            onClose={() => setMenu(false)}
            onChoose={choose}
            isDisabled={commandDisabled}
            initialQuery={/^\/\w*$/u.test(draft) ? draft : ""}
            returnFocus={textarea}
          />
        )}
        <div
          className={`bg-canvas relative rounded-2xl border shadow-sm transition focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 ${dragging ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
        >
          {dragging && (
            <div className="bg-canvas/95 text-accent pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl text-sm">
              {copy.dropFiles}
            </div>
          )}
          <DraftAttachments
            removeLabel={copy.remove}
            files={files}
            disabled={locked}
            onRemove={(index) => setFiles((value) => value.filter((_, i) => i !== index))}
          />
          <textarea
            ref={textarea}
            className="scroll-area block max-h-[min(16rem,30dvh)] min-h-16 w-full resize-none bg-transparent px-4 py-3 text-base leading-6 outline-none disabled:opacity-60 sm:text-sm"
            aria-label={copy.composerLabel}
            placeholder={busy ? copy.steerPlaceholder : copy.composerPlaceholder}
            value={draft}
            maxLength={32000}
            rows={2}
            disabled={locked}
            onChange={(event) => {
              setDraft(event.target.value);
              setMenu(/^\/\w*$/u.test(event.target.value));
            }}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length) {
                event.preventDefault();
                add(pasted);
              }
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                event.key === "Enter" &&
                (!event.shiftKey || event.ctrlKey || event.metaKey)
              ) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  add(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label={copy.addAttachment}
                title={copy.addAttachment}
                disabled={locked}
                onClick={() => picker.current?.click()}
                className="text-muted hover:text-ink flex size-11 items-center justify-center disabled:opacity-40 sm:size-9"
              >
                <Paperclip size={20} />
              </button>
              <button
                type="button"
                aria-label={copy.commands}
                title={copy.commands}
                aria-expanded={menu}
                disabled={locked}
                className="text-muted hover:text-ink p-2 disabled:opacity-40"
                onClick={() => {
                  setMenu(!menu);
                }}
              >
                <Slash size={18} />
              </button>
              <ComposerSettingsSummary
                controls={tools.controls}
                disabled={locked}
                expanded={tools.panel === "settings"}
                onToggle={tools.toggleSettings}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {busy && canStop && (
                <button
                  type="button"
                  className="border-line flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm disabled:opacity-50 sm:min-h-0"
                  aria-label={copy.stop}
                  disabled={locked}
                  onClick={() => void onStop()}
                >
                  <Square size={16} />
                </button>
              )}
              <button
                type="submit"
                title={copy.send}
                className="bg-accent text-on-accent grid size-10 place-items-center rounded-xl transition hover:brightness-110 disabled:opacity-40"
                aria-label={copy.send}
                disabled={locked || (!draft.trim() && !files.length)}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        </div>
        <p className="text-muted mt-1 hidden text-xs sm:block">
          {copy.hint} · / {copy.commands.toLowerCase()}
        </p>
      </div>
    </form>
  );
};
