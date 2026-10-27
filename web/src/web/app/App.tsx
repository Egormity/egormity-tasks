import { useCallback, useEffect, useState } from "react";

import { Login } from "@/features/auth/Login";
import { request } from "@/shared/http/api";
import { BoardWorkspace } from "@/features/board/BoardWorkspace";
import { UsersPage } from "@/features/users/UsersPage";
import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { navigate, readWorkspaceLocation } from "./navigation";
import { WorkspaceHeader } from "./WorkspaceHeader";

const Workspace = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const [page, setPage] = useState(() => {
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
      const next = requested;
      setPage(next);
    };
    window.addEventListener("popstate", change);
    change();
    return () => window.removeEventListener("popstate", change);
  }, [user.role]);
  return (
    <div className="bg-canvas text-ink flex h-dvh min-w-0 flex-col overflow-hidden">
      <WorkspaceHeader user={user} page={page} onLogout={onLogout} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {page === "tasks" ? (
          <BoardWorkspace onSessionExpired={onLogout} />
        ) : (
          <UsersPage currentUser={user} onSessionExpired={onLogout} />
        )}
      </main>
    </div>
  );
};

export const App = () => {
  const { copy } = usePreferences();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const logout = useCallback(() => setUser(null), []);
  useEffect(() => {
    void request<User>("/session")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return <div className="text-muted grid min-h-dvh place-items-center">{copy.loading}</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={logout} />;
};
