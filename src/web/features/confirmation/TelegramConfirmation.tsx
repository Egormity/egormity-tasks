import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { useConfirmation } from "./useConfirmation";
import { usePreferences } from "@/shared/i18n/preferences";
import { insertPastedCode } from "./paste-code";

export const TelegramConfirmation = ({
  state,
}: {
  state: ReturnType<typeof useConfirmation>;
}) => {
  const { copy, errorText } = usePreferences();
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());
  const challenge = state.challenge;
  useEffect(() => {
    setCode("");
  }, [challenge?.id]);
  useEffect(() => {
    if (!challenge) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  if (!challenge) return null;
  const expired = now >= challenge.expiresAt;
  const seconds = Math.max(0, Math.ceil((challenge.resendAt - now) / 1000));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) state.cancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          className="border-line bg-panel text-ink fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (state.busy) event.preventDefault();
          }}
        >
          <Dialog.Title className="text-lg font-semibold">
            {copy.confirmationTitle}
          </Dialog.Title>
          <Dialog.Description className="text-muted mt-2 text-sm">
            {copy.confirmationDescription}
          </Dialog.Description>
          <p className="text-muted mt-3 text-xs">
            {copy.confirmationReference}: {challenge.id.slice(0, 8)}
          </p>
          <a
            href={challenge.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent mt-2 inline-block text-sm underline"
          >
            {copy.openTelegram}
          </a>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{6}$/u.test(code) && !state.busy && !expired) void state.confirm(code);
            }}
          >
            <label className="block text-sm" htmlFor="confirmation-code">
              {copy.confirmationCode}
            </label>
            <input
              ref={input}
              id="confirmation-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              className="border-line bg-canvas outline-accent mt-2 w-full rounded-lg border p-3 text-center font-mono text-xl tracking-widest"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
              onPaste={(event) => {
                event.preventDefault();
                const field = event.currentTarget;
                setCode(
                  insertPastedCode(
                    event.clipboardData.getData("text/plain"),
                    code,
                    field.selectionStart ?? code.length,
                    field.selectionEnd ?? code.length,
                  ),
                );
              }}
              disabled={state.busy || expired}
            />
            {(state.error || expired) && (
              <p role="alert" className="text-danger mt-3 text-sm">
                {expired ? copy.confirmationExpired : errorText(state.error)}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={state.busy}
                onClick={state.cancel}
                className="border-line rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              >
                {copy.cancel}
              </button>
              <button
                disabled={state.busy || expired || code.length !== 6}
                className="bg-accent text-on-accent rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {copy.confirmationSubmit}
              </button>
            </div>
            <button
              type="button"
              className="text-accent mt-4 text-sm disabled:text-muted"
              disabled={state.busy || seconds > 0}
              onClick={() => void state.resend()}
            >
              {copy.confirmationResend}
              {seconds > 0 ? ` (${seconds})` : ""}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
