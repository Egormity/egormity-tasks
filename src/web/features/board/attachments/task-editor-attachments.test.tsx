// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTrackerCardAttachmentBlob } from "@/features/board/data/tracker-api";

import { TaskEditorAttachments } from "./task-editor-attachments";

vi.mock("@/features/board/data/tracker-api", () => ({
  getTrackerCardAttachmentBlob: vi.fn(),
}));

const attachment = {
  id: "image",
  name: "screen.png",
  size: 1200,
  type: "image/png",
  objectId: "stored",
};

const mount = (local = true) => {
  const onRemove = vi.fn();
  const onChooseFiles = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <TaskEditorAttachments
        attachments={[attachment]}
        cardId="card"
        files={
          local
            ? new Map([
                [
                  attachment.id,
                  new File(["image"], attachment.name, {
                    type: attachment.type,
                  }),
                ],
              ])
            : new Map()
        }
        onChooseFiles={onChooseFiles}
        onRemove={onRemove}
      />
    </QueryClientProvider>,
  );
  return { ...view, onChooseFiles, onRemove, client };
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.mocked(getTrackerCardAttachmentBlob).mockResolvedValue(
    new Blob(["image"], { type: "image/png" }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("task attachments", () => {
  it("deletes through confirmation and keeps file picking on its own button", () => {
    const { container, onChooseFiles, onRemove } = mount();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Добавить файлы" }));
    expect(onChooseFiles).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Удалить вложение screen.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onRemove).toHaveBeenCalledWith("image");
    expect(onChooseFiles).toHaveBeenCalledOnce();
  });

  it("opens full preview from a thumbnail and releases object URLs", async () => {
    const { unmount } = mount();
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"),
    );
    expect(screen.queryByRole("button", { name: /^Предпросмотр/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Открыть вложение screen.png" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть просмотр" }));
    unmount();
    expect(vi.mocked(URL).revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("shares the remote image request between thumbnail and preview", async () => {
    mount(false);
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Открыть вложение screen.png" }));
    await screen.findByRole("dialog");
    expect(getTrackerCardAttachmentBlob).toHaveBeenCalledTimes(1);
  });
});
