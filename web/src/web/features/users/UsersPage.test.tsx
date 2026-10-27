// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { internalTasksPolicy as policy } from "@contracts/policy.js";
import type { User } from "@contracts/auth.js";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { UsersPage } from "./UsersPage";

const admin: User = {
  id: "00000000-0000-5000-8000-000000000001",
  name: "Administrator",
  email: "admin@example.test",
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

it("lists accounts and creates and edits users through the modal", async () => {
  render(
    <PreferencesProvider>
      <UsersPage currentUser={admin} onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );

  expect(await screen.findByText("admin@example.test")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add user" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Team Manager" } });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "manager@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "manager" } });
  fireEvent.change(screen.getByLabelText(/Password/u), {
    target: { value: "manager-password-86f92e" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const managerRow = await screen.findByRole("row", { name: /manager@example\.test/u });
  expect(within(managerRow).getByText("Manager")).toBeTruthy();
  fireEvent.click(within(managerRow).getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Project Manager" } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "admin" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByText("Project Manager")).toBeTruthy());
  expect(users.find((user) => user.email === "manager@example.test")?.role).toBe("admin");
});
