// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CreateDividerDialog } from "./create-divider-dialog";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("creates a titled divider in the selected board column", () => {
  document.documentElement.lang = "en";
  const onCreate = vi.fn();
  render(
    <CreateDividerDialog
      open
      columns={[
        { id: "queue", label: "Queue", accent: "var(--color-board-queue)" },
        { id: "review", label: "Review", accent: "var(--color-board-review)" },
      ]}
      initialTitle="Section 1"
      initialColumnId="queue"
      busy={false}
      onOpenChange={vi.fn()}
      onCreate={onCreate}
    />,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Section title" }), {
    target: { value: "  Ready for release  " },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Column" }), {
    target: { value: "review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create divider" }));

  expect(onCreate).toHaveBeenCalledExactlyOnceWith({
    title: "Ready for release",
    columnId: "review",
  });
});
