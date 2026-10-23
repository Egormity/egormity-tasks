// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";

const agentHref = "/agent?chat=11111111-1111-4111-8111-111111111111";
let desktop: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "ru", theme: "light" }),
  );
  desktop = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => desktop);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const mount = (role: "admin" | "manager" = "admin") =>
  render(
    <PreferencesProvider>
      <WorkspaceNavigation
        user={{
          id: "00000000-0000-5000-8000-000000000001",
          name: "Администратор",
          email: "admin@example",
          role,
        }}
        page="agent"
        agentHref={agentHref}
        onLogout={vi.fn()}
      />
      <textarea aria-label="Черновик" defaultValue="Не потерять сообщение" />
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

it("opens the localized menu, retains the chat link and draft, and restores focus after Escape", async () => {
  mount();
  const trigger = screen.getByRole("button", { name: "Открыть меню" });
  trigger.focus();
  fireEvent.click(trigger);
  const menu = screen.getByRole("dialog", { name: "Страницы" });
  expect(menu.contains(document.activeElement)).toBe(true);
  expect(within(menu).getByRole("link", { name: "Amazi Агент" }).getAttribute("href")).toBe(
    agentHref,
  );
  expect(within(menu).getByRole("combobox", { name: "Язык" })).toBeTruthy();
  expect(within(menu).getByRole("combobox", { name: "Тема" })).toBeTruthy();
  expect(within(menu).getAllByText("Администратор")).toHaveLength(2);
  expect(within(menu).getByRole("button", { name: "Выйти" })).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Черновик" }).value).toBe(
    "Не потерять сообщение",
  );
});

it("closes after selecting even the current page and updates settings through the shared provider", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
  const menu = screen.getByRole("dialog");
  fireEvent.change(within(menu).getByRole("combobox", { name: "Язык" }), {
    target: { value: "en" },
  });
  fireEvent.change(within(menu).getByRole("combobox", { name: "Theme" }), {
    target: { value: "dark" },
  });
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(within(menu).getByRole("link", { name: "Amazi Agent" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("closes with the close button, on URL navigation and when the desktop sidebar takes over", async () => {
  mount();
  const trigger = screen.getByRole("button", { name: "Открыть меню" });
  fireEvent.click(trigger);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Закрыть меню" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(trigger);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(trigger);
  act(() => {
    desktop.matches = true;
    const change = desktop.addEventListener.mock.calls[0]![1] as () => void;
    change();
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
