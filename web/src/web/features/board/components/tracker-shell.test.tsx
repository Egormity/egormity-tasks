// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TrackerShell } from "./tracker-shell";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("places divider creation beside task and column creation in the board toolbar", () => {
  document.documentElement.lang = "en";
  const onCreateTask = vi.fn();
  const onCreateDivider = vi.fn();
  const onAddColumn = vi.fn();
  render(
    <TrackerShell
      onCreateTask={onCreateTask}
      onCreateDivider={onCreateDivider}
      onAddColumn={onAddColumn}
    >
      <div>Board</div>
    </TrackerShell>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  fireEvent.click(screen.getByRole("button", { name: "Add divider" }));
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));

  expect(onCreateTask).toHaveBeenCalledOnce();
  expect(onCreateDivider).toHaveBeenCalledOnce();
  expect(onAddColumn).toHaveBeenCalledOnce();
});
