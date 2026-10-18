import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { request } from "@/shared/http/api";
import { PreferenceControls, usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { AppLink } from "./AppLink";

type NavigationProps = {
  user: User;
  page: "tasks" | "agent";
  agentHref: string;
  onLogout: () => void;
};

const NavigationContent = ({
  user,
  page,
  agentHref,
  onLogout,
  onNavigate,
  closeControl,
}: NavigationProps & { onNavigate?: () => void; closeControl?: ReactNode }) => {
  const { copy } = usePreferences();
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-semibold tracking-tight">{copy.brand}</p>
          <p className="text-muted mt-1 text-xs">{copy.subtitle}</p>
        </div>
        {closeControl}
      </div>
      <nav aria-label={copy.navigation} className="mt-5 flex flex-col gap-2">
        {(["tasks", "agent"] as const).map((item) => (
          <AppLink
            key={item}
            href={item === "agent" ? agentHref : "/tasks"}
            aria-current={page === item ? "page" : undefined}
            onClick={onNavigate}
            className={`rounded-lg px-4 py-3 text-sm font-medium ${page === item ? "bg-selected text-accent" : "text-muted hover:bg-canvas"}`}
          >
            {copy[item]}
          </AppLink>
        ))}
      </nav>
      <div className="mt-auto pt-6">
        <PreferenceControls />
        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{user.name}</p>
            <p className="text-muted mt-1 text-xs">{copy.shared}</p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink shrink-0 text-xs leading-5 underline underline-offset-4"
            onClick={() => void request("/logout", {}).then(onLogout, onLogout)}
          >
            {copy.signOut}
          </button>
        </div>
      </div>
    </>
  );
};

export const WorkspaceNavigation = (props: NavigationProps) => {
  const { copy } = usePreferences();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => setOpen(false);
    const resize = () => {
      if (desktop.matches) close();
    };
    desktop.addEventListener?.("change", resize);
    window.addEventListener("popstate", close);
    return () => {
      desktop.removeEventListener?.("change", resize);
      window.removeEventListener("popstate", close);
    };
  }, []);
  return (
    <>
      <aside className="scroll-area border-line bg-panel hidden min-h-0 w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4 md:flex">
        <NavigationContent {...props} />
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <header className="border-line bg-panel flex h-14 shrink-0 items-center gap-3 border-b px-3 md:hidden">
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={copy.openMenu}
              className="hover:bg-canvas flex size-11 shrink-0 items-center justify-center rounded-lg"
            >
              <Menu aria-hidden="true" size={22} />
            </button>
          </Dialog.Trigger>
          <p className="text-lg font-semibold tracking-tight">{copy.brand}</p>
          <p className="text-muted ml-auto truncate text-sm">{copy[props.page]}</p>
        </header>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-overlay fixed inset-0 z-40 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="scroll-area border-line bg-panel text-ink fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,calc(100%-2rem))] flex-col gap-4 overflow-y-auto overscroll-contain border-r p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:hidden"
          >
            <Dialog.Title className="sr-only">{copy.navigation}</Dialog.Title>
            <NavigationContent
              {...props}
              onNavigate={() => setOpen(false)}
              closeControl={
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={copy.closeMenu}
                    className="text-muted hover:bg-canvas hover:text-ink flex size-11 shrink-0 items-center justify-center rounded-lg"
                  >
                    <X aria-hidden="true" size={20} />
                  </button>
                </Dialog.Close>
              }
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
