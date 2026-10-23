import { useCallback, useEffect, useState } from "react";

import { AgentPage } from "@/features/agent/AgentPage";
import { Login } from "@/features/auth/Login";
import { request } from "@/shared/http/api";
import { BoardWorkspace } from "@/features/board/BoardWorkspace";
import { UsersPage } from "@/features/users/UsersPage";
import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { navigate, readWorkspaceLocation, workspaceHref } from "./navigation";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

const Workspace = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const [page, setPage] = useState(() => {
    const initial = readWorkspaceLocation().page;
    return initial === "users" && user.role !== "admin" ? "tasks" : initial;
  });
  const [agentHref, setAgentHref] = useState(() =>
    page === "agent" ? workspaceHref() : "/agent",
  );
  useEffect(() => {
    const change = () => {
      const requested = readWorkspaceLocation().page;
      if (requested === "users" && user.role !== "admin") {
        navigate("/tasks", true);
        return;
      }
      const next = requested;
      setPage(next);
      if (next === "agent") setAgentHref(workspaceHref());
    };
    window.addEventListener("popstate", change);
    change();
    return () => window.removeEventListener("popstate", change);
  }, [user.role]);
  return (
    <div className="bg-canvas text-ink flex h-dvh min-w-0 flex-col overflow-hidden md:flex-row">
      <WorkspaceNavigation user={user} page={page} agentHref={agentHref} onLogout={onLogout} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {page === "tasks" ? (
          <BoardWorkspace onSessionExpired={onLogout} />
        ) : page === "agent" ? (
          <AgentPage onSessionExpired={onLogout} />
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
