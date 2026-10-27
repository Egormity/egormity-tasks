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

let stopNavigation: (() => void) | undefined;
beforeEach(() => history.replaceState(null, "", "/tasks"));
afterEach(() => {
  stopNavigation?.();
  stopNavigation = undefined;
  cleanup();
});

it.each([
  ["/#/users", "/users"],
  ["/#/tasks", "/tasks"],
  ["/retired-page", "/tasks"],
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

it("reads direct page URLs and restores the same selection on Back/Forward", async () => {
  history.replaceState(null, "", "/tasks");
  stopNavigation = initializeWorkspaceNavigation();
  const selection = readWorkspaceLocation();
  expect(selection).toEqual({
    page: "tasks",
  });
  navigate("/users");
  expect(readWorkspaceLocation().page).toBe("users");
  history.back();
  await waitFor(() => expect(readWorkspaceLocation()).toEqual(selection));
  history.forward();
  await waitFor(() => expect(workspaceHref()).toBe("/users"));
  expect(location.hash).toBe("");
});

it("recognizes the users route and keeps it navigable with a real URL", () => {
  history.replaceState(null, "", "/tasks");
  render(<AppLink href="/users">Users</AppLink>);
  fireEvent.click(screen.getByRole("link", { name: "Users" }));
  expect(workspaceHref()).toBe("/users");
  expect(readWorkspaceLocation()).toEqual({
    page: "users",
  });
});

it("converts legacy entries reached through browser history before notifying the UI", async () => {
  stopNavigation = initializeWorkspaceNavigation();
  history.pushState(null, "", "/#/users");
  navigate("/tasks");
  const observed: string[] = [];
  const observe = () => observed.push(workspaceHref());
  window.addEventListener("popstate", observe);
  try {
    history.back();
    await waitFor(() => expect(observed).toContain("/users"));
    expect(location.hash).toBe("");
  } finally {
    window.removeEventListener("popstate", observe);
  }
});

it("updates internal links through history without a document navigation", () => {
  const change = vi.fn();
  window.addEventListener("popstate", change);
  try {
    render(<AppLink href={"/users"}>Open users</AppLink>);
    const link = screen.getByRole("link");
    expect(fireEvent.click(link)).toBe(false);
    expect(workspaceHref()).toBe("/users");
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
  [{ href: "https://example.org/users" }, {}],
])(
  "preserves native link behavior for modifiers, new tabs, downloads and external URLs",
  (props, click) => {
    render(
      <AppLink href="/users" {...props}>
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
