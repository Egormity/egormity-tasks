// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";

beforeEach(() => {
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "ru", theme: "light" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const mount = (role: "admin" | "manager" = "admin", onLogout = vi.fn()) =>
  render(
    <PreferencesProvider>
      <WorkspaceHeader
        user={{
          id: "00000000-0000-5000-8000-000000000001",
          name: "Егор",
          email: "admin@example",
          role,
        }}
        page="tasks"
        onLogout={onLogout}
      />
    </PreferencesProvider>,
  );

it("shows the users destination only for admins", () => {
  mount("admin");
  expect(screen.getByRole("link", { name: "Пользователи" }).getAttribute("href")).toBe(
    "/users",
  );
  cleanup();
  mount("manager");
  expect(screen.queryByRole("link", { name: "Пользователи" })).toBeNull();
});

it("keeps navigation, preferences and account controls accessible in the header", () => {
  mount();
  const header = within(screen.getByRole("banner"));
  expect(header.getByRole("link", { name: "Задачи" }).getAttribute("aria-current")).toBe(
    "page",
  );
  expect(header.getByText("Егор")).toBeTruthy();
  expect(header.getByText("Администратор")).toBeTruthy();
  expect(header.getByRole("button", { name: "Выйти" })).toBeTruthy();
  expect(screen.queryByRole("complementary")).toBeNull();
  fireEvent.change(header.getByRole("combobox", { name: "Язык" }), { target: { value: "en" } });
  fireEvent.change(header.getByRole("combobox", { name: "Theme" }), {
    target: { value: "dark" },
  });
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(header.getByRole("link", { name: "Tasks" })).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(internalTasksPolicy.preferencesStorageKey)!)).toEqual({
    locale: "en",
    theme: "dark",
  });
});

it("signs out through the header account control", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  const onLogout = vi.fn();
  mount("admin", onLogout);
  fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
  await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith(
    "/api/logout",
    expect.objectContaining({ method: "POST", credentials: "same-origin" }),
  );
});
