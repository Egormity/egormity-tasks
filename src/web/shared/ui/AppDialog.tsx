import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { usePreferences } from "@/shared/i18n/preferences";

export const AppDialog = ({
  open,
  onClose,
  title,
  children,
  returnFocus,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
  wide?: boolean;
}) => {
  const { copy } = usePreferences();
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`border-line bg-panel text-ink fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none ${wide ? "max-w-3xl" : "max-w-xl"}`}
          onOpenAutoFocus={() => {
            previousFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (returnFocus?.current ?? previousFocus.current)?.focus();
          }}
          onSubmit={(event) => event.stopPropagation()}
        >
          <header className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={copy.close}
              className="text-muted hover:bg-accent/10 grid size-9 shrink-0 place-items-center rounded-lg"
            >
              <X size={18} />
            </Dialog.Close>
          </header>
          <div className="scroll-area min-h-0 overflow-y-auto overscroll-contain p-5">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
