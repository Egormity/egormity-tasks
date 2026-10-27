// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { internalTasksPolicy as policy } from "@contracts/policy.js";
import type { User } from "@contracts/auth.js";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { UsersPage } from "./UsersPage";

const admin: User = {
  id: "00000000-0000-5000-8000-000000000001",
  username: "admin",
  role: "admin",
};

let users: User[];

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  localStorage.setItem(
    policy.preferencesStorageKey,
    JSON.stringify({ locale: "en", theme: "light" }),
  );
  users = [admin];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Omit<User, "id">)
          : undefined;
      if (url === "/api/users" && init?.method === "POST" && body) {
        const created = { ...body, id: "22222222-2222-4222-8222-222222222222" };
        users = [...users, created];
        return Promise.resolve(Response.json(created, { status: 201 }));
      }
      const remove = /^\/api\/users\/([^/]+)\/remove$/u.exec(url);
      if (remove?.[1] && init?.method === "POST") {
        const id = remove[1];
        const removed = users.find((user) => user.id === id) ?? null;
        users = users.filter((user) => user.id !== id);
        return Promise.resolve(Response.json(removed));
      }
      if (url.startsWith("/api/users/") && init?.method === "POST" && body) {
        const id = url.slice("/api/users/".length);
        const updated = { ...body, id };
        users = users.map((user) => (user.id === id ? updated : user));
        return Promise.resolve(Response.json(updated));
      }
      return Promise.resolve(Response.json(users));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("lists accounts and creates, edits, and deletes users through the modals", async () => {
  render(
    <PreferencesProvider>
      <UsersPage currentUser={admin} onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );

  const adminRow = await screen.findByRole("row", { name: /admin/u });
  const ownDelete = within(adminRow).getByRole<HTMLButtonElement>("button", { name: "Delete" });
  expect(ownDelete.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add user" }));
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "team-manager" },
  });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "manager" } });
  fireEvent.change(screen.getByLabelText(/Password/u), {
    target: { value: "manager-password-86f92e" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const managerRow = await screen.findByRole("row", { name: /team-manager/u });
  expect(within(managerRow).getByText("Manager")).toBeTruthy();
  fireEvent.click(within(managerRow).getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "project-manager" } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "admin" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByText("project-manager")).toBeTruthy());
  expect(users.find((user) => user.username === "project-manager")?.role).toBe("admin");

  const editedRow = screen.getByRole("row", { name: /project-manager/u });
  fireEvent.click(within(editedRow).getByRole("button", { name: "Delete" }));
  const confirmation = await screen.findByRole("dialog");
  expect(within(confirmation).getByText(/project-manager/u)).toBeTruthy();
  fireEvent.click(within(confirmation).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByText("project-manager")).toBeNull());
  expect(users.map((user) => user.username)).toEqual(["admin"]);
});
