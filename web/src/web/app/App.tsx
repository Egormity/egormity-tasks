import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { Login } from "@/features/auth/Login";
import { request } from "@/shared/http/api";
import { BoardWorkspace } from "@/features/board/BoardWorkspace";
import { UsersPage } from "@/features/users/UsersPage";
import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { navigate, readWorkspaceLocation } from "./navigation";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

type WorkspacePage = "tasks" | "archive" | "users";

const Workspace = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const { copy } = usePreferences();
  const [page, setPage] = useState<WorkspacePage>(() => {
    const initial = readWorkspaceLocation().page;
    return initial === "users" && user.role !== "admin" ? "tasks" : initial;
  });
  useEffect(() => {
    const change = () => {
      const requested = readWorkspaceLocation().page;
      if (requested === "users" && user.role !== "admin") {
        navigate("/tasks", true);
        return;
      }
      setPage(requested);
    };
    window.addEventListener("popstate", change);
    change();
    return () => window.removeEventListener("popstate", change);
  }, [user.role]);
  return (
    <div className="bg-canvas text-ink flex h-dvh min-w-0 flex-col overflow-hidden">
      <WorkspaceNavigation user={user} page={page} onLogout={onLogout} />
      <main
        aria-label={
          page === "users" ? copy.users : page === "archive" ? copy.archive : copy.tasks
        }
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {page === "users" ? (
          <UsersPage currentUser={user} onSessionExpired={onLogout} />
        ) : (
          <BoardWorkspace archived={page === "archive"} onSessionExpired={onLogout} />
        )}
      </main>
    </div>
  );
};

export const App = () => {
  const { copy, theme } = usePreferences();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const logout = useCallback(() => setUser(null), []);
  useEffect(() => {
    void request<User>("/session")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <Toaster theme={theme} richColors closeButton />
      {loading ? (
        <div className="text-muted grid min-h-dvh place-items-center">{copy.loading}</div>
      ) : user ? (
        <Workspace user={user} onLogout={logout} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </>
  );
};
