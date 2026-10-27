// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { BoardColumnSettingsModal } from "./board-column-settings-modal";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("keeps column settings compact, lets the user pick a color, reorder sideways, and export", () => {
  document.documentElement.lang = "en";
  const onMove = vi.fn();
  const onExport = vi.fn();
  const onSave = vi.fn();
  render(
    <BoardColumnSettingsModal
      open
      column={{ id: "queue", label: "Queue", accent: "var(--color-board-queue)" }}
      columnIndex={1}
      columnCount={3}
      taskCount={2}
      busy={false}
      exporting={false}
      onOpenChange={vi.fn()}
      onMove={onMove}
      onExport={onExport}
      onDelete={vi.fn()}
      onSave={onSave}
    />,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog.style.maxWidth).toBe("420px");
  const color = screen.getByLabelText<HTMLInputElement>("Column color");
  expect(color.type).toBe("color");
  fireEvent.change(color, { target: { value: "#123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Move column left" }));
  fireEvent.click(screen.getByRole("button", { name: "Move column right" }));
  fireEvent.click(screen.getByRole("button", { name: "Download column tasks (2)" }));
  expect(onMove.mock.calls).toEqual([[-1], [1]]);
  expect(onExport).toHaveBeenCalledOnce();

  fireEvent.change(screen.getByRole("textbox", { name: "Column name" }), {
    target: { value: "Custom review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ label: "Custom review", accent: "#123456" });
});
