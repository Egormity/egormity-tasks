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
  const onUpdateTags = vi.fn().mockResolvedValue(true);
  const onOpenChange = vi.fn();
  render(
    <TaskTagManagerModal
      onCreateTag={vi.fn()}
      onDeleteTag={vi.fn()}
      onOpenChange={onOpenChange}
      onUpdateTags={onUpdateTags}
      open
      tags={tags}
    />,
  );
  return { onOpenChange, onUpdateTags };
};

it("keeps name edits as drafts until the footer save button is pressed", async () => {
  const { onOpenChange, onUpdateTags } = renderModal();
  const saveButton = screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" });
  expect(saveButton.disabled).toBe(true);

  fireEvent.change(screen.getByDisplayValue("Platform"), { target: { value: "Core" } });
  expect(onUpdateTags).not.toHaveBeenCalled();
  expect(saveButton.disabled).toBe(false);

  fireEvent.click(saveButton);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onUpdateTags).toHaveBeenCalledTimes(1);
  expect(onUpdateTags).toHaveBeenCalledWith([{ id: "tag", name: "Core" }]);
});

it("saves a picked color only from the footer button", async () => {
  const { onUpdateTags } = renderModal();
  fireEvent.change(screen.getByLabelText("Color of tag Platform"), {
    target: { value: "#aabbcc" },
  });
  expect(onUpdateTags).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(onUpdateTags).toHaveBeenCalledWith([{ id: "tag", tone: "#aabbcc" }]),
  );
});

it("blocks saving when a tag name is empty", () => {
  const { onUpdateTags } = renderModal();
  fireEvent.change(screen.getByDisplayValue("Platform"), { target: { value: "  " } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  expect(onUpdateTags).not.toHaveBeenCalled();
});

it("sends all edits together and keeps drafts available after a failed save", async () => {
  document.documentElement.lang = "en";
  const onUpdateTags = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const onOpenChange = vi.fn();
  render(
    <TaskTagManagerModal
      onCreateTag={vi.fn()}
      onDeleteTag={vi.fn()}
      onOpenChange={onOpenChange}
      onUpdateTags={onUpdateTags}
      open
      tags={[
        { id: "first", name: "First", tone: "blue", usageCount: 0 },
        { id: "second", name: "Second", tone: "green", usageCount: 1 },
      ]}
    />,
  );
  fireEvent.change(screen.getByDisplayValue("First"), { target: { value: "Renamed" } });
  fireEvent.change(screen.getByLabelText("Color of tag Second"), {
    target: { value: "#aabbcc" },
  });
  const save = screen.getByRole("button", { name: "Save changes" });
  fireEvent.click(save);
  await waitFor(() => expect(onUpdateTags).toHaveBeenCalledTimes(1));
  expect(onUpdateTags).toHaveBeenCalledWith([
    { id: "first", name: "Renamed" },
    { id: "second", tone: "#aabbcc" },
  ]);
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Renamed")).toBeTruthy();
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onUpdateTags).toHaveBeenCalledTimes(2);
});
