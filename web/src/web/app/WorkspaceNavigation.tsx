import { LogOut } from "lucide-react";

import { request } from "@/shared/http/api";
import { PreferenceControls, usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { AppLink } from "./AppLink";

type WorkspacePage = "tasks" | "archive" | "users";

export const WorkspaceNavigation = ({
  user,
  page,
  onLogout,
}: {
  user: User;
  page: WorkspacePage;
  onLogout: () => void;
}) => {
  const { copy } = usePreferences();
  const pages =
    user.role === "admin"
      ? (["tasks", "archive", "users"] as const)
      : (["tasks", "archive"] as const);

  return (
    <div className="border-line bg-panel flex min-h-10 shrink-0 items-center gap-2 border-b px-3 py-1">
      <nav aria-label={copy.navigation} className="flex min-w-0 flex-1 items-center gap-1">
        {pages.map((item) => (
          <AppLink
            key={item}
            href={`/${item}`}
            aria-current={page === item ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${page === item ? "bg-selected text-accent" : "text-muted hover:bg-canvas hover:text-ink"}`}
          >
            {copy[item]}
          </AppLink>
        ))}
      </nav>
      <PreferenceControls />
      <button
        type="button"
        aria-label={copy.signOut}
        title={copy.signOut}
        className="text-muted hover:bg-canvas hover:text-ink focus-visible:ring-accent grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-1"
        onClick={() => void request("/logout", {}).then(onLogout, onLogout)}
      >
        <LogOut aria-hidden="true" size={16} />
      </button>
    </div>
  );
};
