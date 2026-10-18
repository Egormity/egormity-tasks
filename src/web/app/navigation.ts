export const readWorkspaceLocation = () => {
  const page = location.pathname === "/agent" ? "agent" : "tasks";
  const parameters = new URLSearchParams(location.search);
  const value = parameters.get("chat");
  const task = parameters.get("task");
  const taskId = page === "tasks" && task && task.length <= 160 ? task : null;
  const scope = parameters.get("scope");
  const chatScope = scope === "general" || scope === "tasks" ? scope : null;
  const chatId =
    (page === "agent" || taskId) &&
    value &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
      ? value
      : null;
  const draft = !chatId && parameters.get("new") === "1";
  return { page, chatId, taskId, chatScope, draft } as const;
};

export const workspaceHref = () => location.pathname + location.search;

export const navigate = (href: string, replace = false) => {
  if (workspaceHref() === href && !location.hash) return;
  if (replace) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export const taskDiscussionHref = (taskId: string, chatId?: string) =>
  `/tasks?${new URLSearchParams({ task: taskId, ...(chatId ? { chat: chatId } : {}) })}`;

export const writeTaskLocation = (taskId: string, chatId?: string, replace = false) =>
  navigate(taskDiscussionHref(taskId, chatId), replace);

export const writeChatLocation = (chatId: string, replace = false) => {
  const current = readWorkspaceLocation();
  if (current.page === "tasks") {
    if (current.taskId) writeTaskLocation(current.taskId, chatId, replace);
    return;
  }
  const query = new URLSearchParams({ chat: chatId });
  if (current.chatScope) query.set("scope", current.chatScope);
  navigate(`/agent?${query}`, replace);
};

export const writeChatScope = (scope: "general" | "tasks") =>
  navigate(`/agent?${new URLSearchParams({ scope })}`);

export const writeDraftLocation = (taskId?: string) =>
  navigate(taskId ? `${taskDiscussionHref(taskId)}&new=1` : "/agent?new=1");

/** Keep existing bookmarks and links in native chat history usable without adding a history entry. */
export const initializeWorkspaceNavigation = () => {
  const normalize = () => {
    if (/^#\/(?:tasks|agent)(?:\?|$)/u.test(location.hash)) {
      history.replaceState(history.state, "", location.hash.slice(1));
      return true;
    }
    if (location.pathname === "/")
      history.replaceState(history.state, "", `/tasks${location.search}${location.hash}`);
    return false;
  };
  const legacyChange = () => {
    if (normalize()) window.dispatchEvent(new PopStateEvent("popstate"));
  };
  normalize();
  window.addEventListener("popstate", normalize);
  window.addEventListener("hashchange", legacyChange);
  return () => {
    window.removeEventListener("popstate", normalize);
    window.removeEventListener("hashchange", legacyChange);
  };
};
