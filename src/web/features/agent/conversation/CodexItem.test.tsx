// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodexItem } from "./CodexItem";
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

it("omits empty progress events but displays text when a later update supplies it", () => {
  const progress = (summary: string[], content: string[]) => (
    <PreferencesProvider>
      <CodexItem item={{ id: "progress", type: "reasoning", summary, content }} />
    </PreferencesProvider>
  );
  const view = render(progress([], ["  ", "\n"]));
  expect(screen.queryByText("Ход работы Codex")).toBeNull();
  view.rerender(progress(["Проверяю вёрстку"], []));
  expect(screen.getByText("Проверяю вёрстку").closest("details")).toBeTruthy();
  expect(screen.getByText("Ход работы Codex")).toBeTruthy();
});
