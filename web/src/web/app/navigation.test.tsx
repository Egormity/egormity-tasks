// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppLink } from "./AppLink";
import {
  initializeWorkspaceNavigation,
  navigate,
  readWorkspaceLocation,
  workspaceHref,
} from "./navigation";

const chatId = "11111111-1111-4111-8111-111111111111";
let stopNavigation: (() => void) | undefined;
beforeEach(() => history.replaceState(null, "", "/tasks"));
afterEach(() => {
  stopNavigation?.();
  stopNavigation = undefined;
  cleanup();
});

it.each([
  [`/#/agent?chat=${chatId}&scope=tasks`, `/agent?chat=${chatId}&scope=tasks`],
  [`/#/tasks?task=task-1&chat=${chatId}`, `/tasks?task=task-1&chat=${chatId}`],
  ["/#/tasks?task=task-1&new=1", "/tasks?task=task-1&new=1"],
  ["/", "/tasks"],
])("normalizes existing links before rendering: %s", (oldHref, href) => {
  history.replaceState({ preserved: true }, "", oldHref);
  const length = history.length;
  stopNavigation = initializeWorkspaceNavigation();
  expect(workspaceHref()).toBe(href);
  expect(location.hash).toBe("");
  expect(history.length).toBe(length);
  expect(history.state).toEqual({ preserved: true });
});

it("reads direct task/chat URLs and restores the same selection on Back/Forward", async () => {
  history.replaceState(null, "", `/tasks?task=task-1&chat=${chatId}`);
  stopNavigation = initializeWorkspaceNavigation();
  const selection = readWorkspaceLocation();
  expect(selection).toEqual({
    page: "tasks",
    taskId: "task-1",
    chatId,
    chatScope: null,
    draft: false,
  });
  navigate("/agent?new=1");
  expect(readWorkspaceLocation().draft).toBe(true);
  history.back();
  await waitFor(() => expect(readWorkspaceLocation()).toEqual(selection));
  history.forward();
  await waitFor(() => expect(workspaceHref()).toBe("/agent?new=1"));
  expect(location.hash).toBe("");
});

it("recognizes the users route and keeps it navigable with a real URL", () => {
  history.replaceState(null, "", "/tasks");
  render(<AppLink href="/users">Users</AppLink>);
  fireEvent.click(screen.getByRole("link", { name: "Users" }));
  expect(workspaceHref()).toBe("/users");
  expect(readWorkspaceLocation()).toEqual({
    page: "users",
    chatId: null,
    taskId: null,
    chatScope: null,
    draft: false,
  });
});

it("converts legacy entries reached through browser history before notifying the UI", async () => {
  stopNavigation = initializeWorkspaceNavigation();
  history.pushState(null, "", `/#/agent?chat=${chatId}`);
  navigate("/tasks");
  const observed: string[] = [];
  const observe = () => observed.push(workspaceHref());
  window.addEventListener("popstate", observe);
  try {
    history.back();
    await waitFor(() => expect(observed).toContain(`/agent?chat=${chatId}`));
    expect(location.hash).toBe("");
  } finally {
    window.removeEventListener("popstate", observe);
  }
});

it("updates internal links through history without a document navigation", () => {
  const change = vi.fn();
  window.addEventListener("popstate", change);
  try {
    render(<AppLink href={`/agent?chat=${chatId}`}>Open chat</AppLink>);
    const link = screen.getByRole("link");
    expect(fireEvent.click(link)).toBe(false);
    expect(workspaceHref()).toBe(`/agent?chat=${chatId}`);
    expect(change).toHaveBeenCalledTimes(1);
    const length = history.length;
    fireEvent.click(link);
    expect(history.length).toBe(length);
  } finally {
    window.removeEventListener("popstate", change);
  }
});

it.each([
  [{}, { ctrlKey: true }],
  [{}, { metaKey: true }],
  [{}, { shiftKey: true }],
  [{}, { altKey: true }],
  [{}, { button: 1 }],
  [{ target: "_blank" }, {}],
  [{ download: "" }, {}],
  [{ href: "https://example.org/agent" }, {}],
])(
  "preserves native link behavior for modifiers, new tabs, downloads and external URLs",
  (props, click) => {
    render(
      <AppLink href="/agent" {...props}>
        Open
      </AppLink>,
    );
    let preventedByLink: boolean | undefined;
    const observe = (event: MouseEvent) => {
      preventedByLink = event.defaultPrevented;
      // Avoid jsdom attempting a real document navigation after observing the component.
      event.preventDefault();
    };
    window.addEventListener("click", observe);
    try {
      fireEvent.click(screen.getByRole("link"), click);
      expect(preventedByLink).toBe(false);
      expect(workspaceHref()).toBe("/tasks");
    } finally {
      window.removeEventListener("click", observe);
    }
  },
);
