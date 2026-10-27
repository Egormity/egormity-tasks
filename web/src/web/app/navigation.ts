export const readWorkspaceLocation = () => ({
  page: location.pathname === "/users" ? ("users" as const) : ("tasks" as const),
});

export const workspaceHref = () => location.pathname + location.search;

export const navigate = (href: string, replace = false) => {
  if (workspaceHref() === href && !location.hash) return;
  if (replace) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/** Normalize bookmarks before the UI observes browser navigation. */
export const initializeWorkspaceNavigation = () => {
  const normalize = () => {
    if (/^#\/(?:tasks|users)(?:\?|$)/u.test(location.hash)) {
      history.replaceState(history.state, "", location.hash.slice(1));
      return true;
    }
    if (!["/tasks", "/users"].includes(location.pathname))
      history.replaceState(history.state, "", "/tasks");
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
