// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { TrackerTag } from "@/features/board/data/tracker-api";
import { TaskTagManagerModal } from "./task-tag-manager-modal";

const tags: TrackerTag[] = [{ id: "tag", name: "Platform", tone: "blue", usageCount: 0 }];

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

const renderModal = () => {
  document.documentElement.lang = "en";
  const onUpdateTag = vi.fn().mockResolvedValue(tags[0]);
  const onOpenChange = vi.fn();
  render(
    <TaskTagManagerModal
      onCreateTag={vi.fn()}
      onDeleteTag={vi.fn()}
      onOpenChange={onOpenChange}
      onUpdateTag={onUpdateTag}
      open
      tags={tags}
    />,
  );
  return { onOpenChange, onUpdateTag };
};

it("keeps name edits as drafts until the footer save button is pressed", async () => {
  const { onOpenChange, onUpdateTag } = renderModal();
  const saveButton = screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" });
  expect(saveButton.disabled).toBe(true);

  fireEvent.change(screen.getByDisplayValue("Platform"), { target: { value: "Core" } });
  expect(onUpdateTag).not.toHaveBeenCalled();
  expect(saveButton.disabled).toBe(false);

  fireEvent.click(saveButton);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onUpdateTag).toHaveBeenCalledTimes(1);
  expect(onUpdateTag).toHaveBeenCalledWith("tag", { name: "Core" });
});

it("saves a picked color only from the footer button", async () => {
  const { onUpdateTag } = renderModal();
  fireEvent.change(screen.getByLabelText("Color of tag Platform"), {
    target: { value: "#aabbcc" },
  });
  expect(onUpdateTag).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onUpdateTag).toHaveBeenCalledWith("tag", { tone: "#aabbcc" }));
});

it("blocks saving when a tag name is empty", () => {
  const { onUpdateTag } = renderModal();
  fireEvent.change(screen.getByDisplayValue("Platform"), { target: { value: "  " } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  expect(onUpdateTag).not.toHaveBeenCalled();
});
