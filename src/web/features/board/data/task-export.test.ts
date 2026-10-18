import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "./task-data";
import { buildTaskCollectionExportArchive, buildTaskExportArchive } from "./task-export";

const createTask = (attachments: Task["attachments"]): Task => ({
  archivedAt: null,
  attachments,
  createdAt: "2026-09-25T00:00:00.000Z",
  description: "Task description",
  id: "task-1",
  order: 0,
  priority: "medium",
  status: "queue",
  tags: [{ id: "tag-1", name: "Важное", tone: "green" }],
  title: "Тестовая задача",
  updatedAt: "2026-09-25T00:00:00.000Z",
});

describe("task export archive", () => {
  it("includes comment text, author and downloadable reference bytes in the archive", async () => {
    const comments = [
      {
        id: "comment",
        cardId: "task-1",
        text: "Use this design",
        author: { id: "admin", name: "Admin" },
        createdAt: "2026-10-13T00:00:00Z",
        attachments: [{ id: "reference", name: "design.txt", size: 9, type: "text/plain" }],
      },
    ];
    const archive = await buildTaskExportArchive(
      createTask([]),
      [],
      () => Promise.resolve(new Blob(["reference"])),
      comments,
    );
    const files = unzipSync(archive);
    const exported = JSON.parse(strFromU8(files["task.json"]!)) as {
      attachments: unknown[];
      comments: unknown[];
    };
    expect(exported.attachments).toEqual([]);
    expect(exported.comments[0]).toMatchObject({
      text: "Use this design",
      author: { name: "Admin" },
      attachments: [{ archivePath: "attachments/design.txt" }],
    });
    expect(strFromU8(files["attachments/design.txt"]!)).toBe("reference");
  });
  it("includes task JSON, safe attachment paths, and original file contents", async () => {
    const task = createTask([
      {
        id: "attachment-1",
        name: "../report.txt",
        objectId: "internal-storage-id",
        size: 7,
        type: "text/plain",
      },
      {
        id: "attachment-2",
        name: "..\\report.txt",
        size: 8,
        type: "text/plain",
      },
    ]);
    const readAttachment = vi
      .fn(() => Promise.resolve(new Blob()))
      .mockResolvedValueOnce(new Blob(["first file"]))
      .mockResolvedValueOnce(new Blob(["second file"]));

    const events = [
      {
        createdAt: "2026-09-25T01:00:00.000Z",
        id: "event-1",
        payload: { changes: [{ field: "title", from: "Old", to: "New" }] },
        type: "content_changed",
      },
    ] as const;
    const archive = await buildTaskExportArchive(task, events, readAttachment);
    const files = unzipSync(archive);
    const exportedTask = JSON.parse(strFromU8(files["task.json"]!)) as {
      attachments: { archivePath: string; name: string; objectId?: string }[];
      events: typeof events;
      id: string;
    };

    expect(Object.keys(files).sort()).toEqual([
      "attachments/.._report (2).txt",
      "attachments/.._report.txt",
      "task.json",
    ]);
    expect(strFromU8(files["attachments/.._report.txt"]!)).toBe("first file");
    expect(strFromU8(files["attachments/.._report (2).txt"]!)).toBe("second file");
    expect(exportedTask.id).toBe(task.id);
    expect(exportedTask.events).toEqual(events);
    expect(exportedTask.attachments.map(({ archivePath }) => archivePath)).toEqual([
      "attachments/.._report.txt",
      "attachments/.._report (2).txt",
    ]);
    expect(exportedTask.attachments[0]?.objectId).toBeUndefined();
    expect(readAttachment).toHaveBeenNthCalledWith(1, task.id, "attachment-1");
    expect(readAttachment).toHaveBeenNthCalledWith(2, task.id, "attachment-2");
  });

  it("fails the export rather than silently omitting an attachment", async () => {
    const task = createTask([{ id: "missing-file", name: "missing.pdf", size: 12 }]);

    await expect(
      buildTaskExportArchive(task, [], vi.fn().mockRejectedValue(new Error("Not found"))),
    ).rejects.toThrow("Не удалось добавить вложение «missing.pdf» в архив.");
  });

  it("exports a column into one archive with isolated task data and attachments", async () => {
    const firstTask = createTask([{ id: "attachment-1", name: "first.txt", size: 5 }]);
    const secondTask = {
      ...createTask([{ id: "attachment-2", name: "second.txt", size: 6 }]),
      id: "task-2",
    };
    const readAttachment = vi.fn((cardId: string) =>
      Promise.resolve(new Blob([cardId === firstTask.id ? "first" : "second"])),
    );

    const result = await buildTaskCollectionExportArchive(
      [
        { task: firstTask, events: [] },
        { task: secondTask, events: [] },
      ],
      readAttachment,
    );
    const files = unzipSync(result.archive);
    const firstPath = `tasks/${firstTask.title}-${firstTask.id}`;
    const secondPath = `tasks/${secondTask.title}-${secondTask.id}`;

    expect(Object.keys(files).sort()).toEqual(
      [
        `${firstPath}/attachments/first.txt`,
        `${firstPath}/task.json`,
        `${secondPath}/attachments/second.txt`,
        `${secondPath}/task.json`,
        "export-report.json",
      ].sort(),
    );
    expect(strFromU8(files[`${firstPath}/attachments/first.txt`]!)).toBe("first");
    expect(strFromU8(files[`${secondPath}/attachments/second.txt`]!)).toBe("second");
    expect(JSON.parse(strFromU8(files["export-report.json"]!))).toEqual({
      taskCount: 2,
      unavailableAttachments: [],
    });
    expect(readAttachment).toHaveBeenNthCalledWith(1, firstTask.id, "attachment-1");
    expect(readAttachment).toHaveBeenNthCalledWith(2, secondTask.id, "attachment-2");
  });

  it("keeps the column export and reports attachments missing from storage", async () => {
    const task = createTask([
      { id: "available", name: "available.txt", size: 9 },
      { id: "missing", name: "missing.png", size: 123 },
    ]);
    const readAttachment = vi.fn((_cardId: string, attachmentId: string) => {
      if (attachmentId === "missing") return Promise.reject(new Error("Not found"));
      return Promise.resolve(new Blob(["available"]));
    });

    const result = await buildTaskCollectionExportArchive(
      [{ task, events: [] }],
      readAttachment,
    );
    const files = unzipSync(result.archive);
    const folder = `tasks/${task.title}-${task.id}`;
    const exportedTask = JSON.parse(strFromU8(files[`${folder}/task.json`]!)) as {
      attachments: { archivePath?: string; missingFile?: boolean }[];
    };
    const report = JSON.parse(strFromU8(files["export-report.json"]!)) as {
      taskCount: number;
      unavailableAttachments: { attachmentId: string; name: string }[];
    };

    expect(Object.keys(files).sort()).toEqual(
      [
        `${folder}/attachments/available.txt`,
        `${folder}/task.json`,
        "export-report.json",
      ].sort(),
    );
    expect(exportedTask.attachments).toEqual([
      {
        archivePath: `${folder}/attachments/available.txt`,
        id: "available",
        name: "available.txt",
        size: 9,
      },
      { id: "missing", missingFile: true, name: "missing.png", size: 123 },
    ]);
    expect(report).toEqual({
      taskCount: 1,
      unavailableAttachments: [
        {
          taskId: task.id,
          taskTitle: task.title,
          attachmentId: "missing",
          name: "missing.png",
          size: 123,
        },
      ],
    });
  });
});
