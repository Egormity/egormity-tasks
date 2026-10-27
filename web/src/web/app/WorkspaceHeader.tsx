import { LogOut } from "lucide-react";

import { request } from "@/shared/http/api";
import { PreferenceControls, usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { AppLink } from "./AppLink";

type HeaderProps = {
  user: User;
  page: "tasks" | "users";
  onLogout: () => void;
};

export const WorkspaceHeader = ({ user, page, onLogout }: HeaderProps) => {
  const { copy } = usePreferences();
  const pages = user.role === "admin" ? (["tasks", "users"] as const) : (["tasks"] as const);
  const role = user.role === "admin" ? copy.adminRole : copy.managerRole;
  return (
    <header className="border-line bg-panel flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 sm:flex-nowrap sm:py-0">
      <p className="text-ink text-sm font-bold tracking-tight">{copy.brand}</p>
      <nav aria-label={copy.navigation} className="flex h-8 items-stretch gap-0.5 sm:h-11">
        {pages.map((item) => (
          <AppLink
            key={item}
            href={item === "users" ? "/users" : "/tasks"}
            aria-current={page === item ? "page" : undefined}
            className={`flex items-center border-b-2 px-2.5 text-xs font-medium transition-colors ${page === item ? "border-accent text-accent" : "text-muted hover:text-ink border-transparent"}`}
          >
            {copy[item]}
          </AppLink>
        ))}
      </nav>
      <div className="border-line flex w-full min-w-0 items-center gap-2 border-t pt-1.5 sm:ml-auto sm:w-auto sm:gap-3 sm:border-0 sm:pt-0">
        <PreferenceControls />
        <div
          className="ml-auto min-w-0 text-right leading-tight sm:ml-0"
          title={`${user.name} · ${role}`}
        >
          <p className="max-w-36 truncate text-xs font-medium">{user.name}</p>
          <p className="text-muted truncate text-[12px]">{role}</p>
        </div>
        <button
          type="button"
          aria-label={copy.signOut}
          title={copy.signOut}
          className="text-muted hover:bg-canvas hover:text-ink focus-visible:ring-accent grid size-7 shrink-0 place-items-center rounded-sm outline-none focus-visible:ring-1"
          onClick={() => void request("/logout", {}).then(onLogout, onLogout)}
        >
          <LogOut aria-hidden="true" size={18} />
        </button>
      </div>
    </header>
  );
};
