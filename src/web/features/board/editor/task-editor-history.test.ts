import { describe, expect, it } from "vitest";

import { formatTrackerEventChange } from "./task-editor-history-format";

describe("task editor history diff text", () => {
  it("renders localized status, text fields and attachment operations", () => {
    expect(
      formatTrackerEventChange({
        field: "status",
        from: "review",
        fromLabel: "Приёмка",
        to: "done",
        toLabel: "Готово",
      }),
    ).toBe("Статус изменён с «Приёмка» на «Готово»");
    expect(
      formatTrackerEventChange({ field: "description", from: "Старое", to: "Новое" }),
    ).toBe("Описание изменено с «Старое» на «Новое»");
    expect(
      formatTrackerEventChange({
        added: [{ id: "new", name: "new.pdf", size: 12 }],
        changed: [
          {
            from: { id: "changed", name: "draft.txt", size: 10 },
            to: { id: "changed", name: "final.txt", size: 20 },
          },
        ],
        field: "attachments",
        removed: [{ id: "old", name: "old.pdf", size: 8 }],
      }),
    ).toBe(
      "Вложения изменены: добавлены «new.pdf», удалены «old.pdf», изменены «draft.txt» → «final.txt»",
    );
  });

  it("uses an explicit empty marker for cleared values", () => {
    expect(formatTrackerEventChange({ field: "title", from: "До", to: "" })).toBe(
      "Название изменено с «До» на «пусто»",
    );
  });
});
