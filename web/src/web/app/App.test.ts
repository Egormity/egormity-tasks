// @vitest-environment jsdom
import { internalTasksPolicy as policy } from "@contracts/policy.js";
import { act, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "./App";
import {
  PreferencesProvider,
  initializePreferences,
  resolvePreferences,
} from "@/shared/i18n/preferences";

let root: Root;

let host: HTMLDivElement;

let paths: string[];

let sessionRole: "admin" | "manager";

const settle = async (action: () => void) => {
  await act(async () => {
    action();
    await Promise.resolve();
  });
};

beforeEach(() => {
  paths = [];
  sessionRole = "admin";
  localStorage.clear();
  history.replaceState(null, "", "/tasks");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => {
      paths.push(path);
      let body: unknown = {};
      if (path === "/api/session")
        body = {
          id: "admin",
          name: "Administrator",
          email: "admin@example.test",
          role: sessionRole,
        };
      if (path === "/api/board") body = { cards: [], tags: [] };
      if (path === "/api/users") body = [];
      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
      );
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await settle(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = async () => {
  initializePreferences();
  await settle(() => {
    root.render(createElement(PreferencesProvider, null, createElement(App)));
  });
};

it("renders the localized board and users pages and persists preferences", async () => {
  localStorage.setItem(
    policy.preferencesStorageKey,
    JSON.stringify({ locale: "ru", theme: "light" }),
  );
  await render();
  expect(host.querySelector('a[href="/tasks"]')?.textContent).toBe("Задачи");
  expect(host.querySelectorAll("nav a")).toHaveLength(3);
  expect(host.querySelector("main")?.getAttribute("aria-label")).toBe("Задачи");
  expect(paths).toContain("/api/board");
  const language = host.querySelectorAll("select")[0]!;
  const theme = host.querySelectorAll("select")[1]!;
  await settle(() => {
    language.value = "en";
    language.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(() => {
    theme.value = "dark";
    theme.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelector('a[href="/tasks"][aria-current="page"]')?.textContent).toBe(
    "Tasks",
  );
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(JSON.parse(localStorage.getItem(policy.preferencesStorageKey)!)).toEqual({
    locale: "en",
    theme: "dark",
  });
  await settle(() => {
    host.querySelector<HTMLAnchorElement>('a[href="/users"]')!.click();
  });
  expect(location.pathname).toBe("/users");
  expect(location.hash).toBe("");
  expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe("Users");
  expect(host.querySelector("h1")?.textContent).toBe("Users");
  await settle(() => host.querySelector<HTMLAnchorElement>('a[href="/archive"]')!.click());
  expect(location.pathname).toBe("/archive");
  expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe("Archive");
  expect(host.querySelector("main")?.getAttribute("aria-label")).toBe("Archive");
  await settle(() => root.unmount());
  root = createRoot(host);
  await render();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(host.querySelector('a[href="/tasks"]')?.textContent).toBe("Tasks");
});

it("uses system preferences only until explicit valid choices are saved", () => {
  expect(resolvePreferences(null, "ru-RU", true)).toEqual({ locale: "ru", theme: "dark" });
  expect(resolvePreferences({ locale: "en", theme: "light" }, "ru", true)).toEqual({
    locale: "en",
    theme: "light",
  });
  expect(resolvePreferences({ locale: "invalid", theme: "invalid" }, "en-US", false)).toEqual({
    locale: "en",
    theme: "light",
  });
});

it("keeps language and appearance settings out of the sign-in screen", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 }),
  );
  await render();
  expect(host.querySelector('input[name="email"]')).not.toBeNull();
  expect(host.querySelector('input[name="password"]')).not.toBeNull();
  expect(host.querySelectorAll("select")).toHaveLength(0);
});

it("opens the direct users URL for admins and sends managers away from it", async () => {
  history.replaceState(null, "", "/users");
  await render();
  expect(host.querySelector("h1")?.textContent).toBe("Users");
  expect(host.querySelector('a[href="/users"]')?.getAttribute("aria-current")).toBe("page");

  await settle(() => root.unmount());
  root = createRoot(host);
  sessionRole = "manager";
  history.replaceState(null, "", "/users");
  await render();
  expect(location.pathname).toBe("/tasks");
  expect(host.querySelector('a[href="/users"]')).toBeNull();
  expect(host.querySelector("h1")?.textContent).not.toBe("Users");
});

it("opens the archive as a separate direct page", async () => {
  history.replaceState(null, "", "/archive");
  await render();
  expect(host.querySelector("main")?.getAttribute("aria-label")).toBe("Archive");
  expect(host.querySelector('a[href="/archive"]')?.getAttribute("aria-current")).toBe("page");
  expect(paths).toContain("/api/board");
});

it.each(["/agent", "/tasks?task=former-discussion&new=1"])(
  "shows the board for a retired workspace URL: %s",
  async (href) => {
    history.replaceState(null, "", href);
    await render();
    expect(host.querySelector("main")?.getAttribute("aria-label")).toBe("Tasks");
    expect(paths.every((path) => ["/api/session", "/api/board"].includes(path))).toBe(true);
    expect(
      Array.from(host.querySelectorAll("nav a"), (link) => link.getAttribute("href")),
    ).toEqual(["/tasks", "/archive", "/users"]);
  },
);
