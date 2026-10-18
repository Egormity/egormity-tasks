import { type AsyncZippable, strToU8, zip } from "fflate";

import { boardText } from "@/features/board/i18n/board-copy";
import type { Task, TaskAttachment, TrackerEvent } from "./task-data";
import { getTrackerCardAttachmentBlob } from "./tracker-api";
import { getTaskComments } from "../comments/comment-api";
import type { TaskComment } from "@contracts/task-comments.js";

type AttachmentReader = (cardId: string, attachmentId: string) => Promise<Blob>;

type UnavailableAttachment = {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly size: number;
};

type ExportedAttachment =
  | {
      readonly attachment: TaskAttachment;
      readonly filename: string;
      readonly contents: Uint8Array;
    }
  | {
      readonly attachment: TaskAttachment;
      readonly filename: string;
      readonly unavailable: true;
    };

const sanitizeFilename = (value: string) => {
  const filename = Array.from(value.trim().replace(/[<>:"/\\|?*]/gu, "_"), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "_" : character;
  })
    .join("")
    .replace(/^\.+$/u, "");

  return filename || "attachment";
};

const getUniqueFilename = (value: string, usedFilenames: Set<string>) => {
  const filename = sanitizeFilename(value);
  const extensionIndex = filename.lastIndexOf(".");
  const name = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let candidate = filename;
  let suffix = 2;

  while (usedFilenames.has(candidate.toLowerCase())) {
    candidate = `${name} (${suffix})${extension}`;
    suffix += 1;
  }

  usedFilenames.add(candidate.toLowerCase());
  return candidate;
};

const isAlreadyCompressed = (attachment: TaskAttachment) =>
  /^(?:image|audio|video)\//iu.test(attachment.type ?? "") ||
  /\.(?:avif|gif|jpe?g|m4a|mp3|mp4|pdf|png|rar|webm|webp|woff2?|zip|7z)$/iu.test(
    attachment.name,
  );

const buildTaskExportFiles = async (
  task: Task,
  events: readonly TrackerEvent[],
  readAttachment: AttachmentReader = getTrackerCardAttachmentBlob,
  folder = "",
  unavailableAttachments?: UnavailableAttachment[],
  comments: readonly TaskComment[] = [],
): Promise<AsyncZippable> => {
  const prefix = folder ? `${folder}/` : "";
  const usedFilenames = new Set<string>();
  const files: ExportedAttachment[] = await Promise.all(
    [...task.attachments, ...comments.flatMap((comment) => comment.attachments)].map(
      async (attachment): Promise<ExportedAttachment> => {
        const filename = getUniqueFilename(attachment.name, usedFilenames);
        try {
          const blob = await readAttachment(task.id, attachment.id);
          return {
            attachment,
            filename,
            contents: new Uint8Array(await blob.arrayBuffer()),
          };
        } catch (error) {
          if (unavailableAttachments) {
            unavailableAttachments.push({
              taskId: task.id,
              taskTitle: task.title,
              attachmentId: attachment.id,
              name: attachment.name,
              size: attachment.size,
            });
            return { attachment, filename, unavailable: true as const };
          }
          throw new Error(
            boardText("Не удалось добавить вложение «{0}» в архив.", attachment.name),
            {
              cause: error,
            },
          );
        }
      },
    ),
  );

  const exportedFiles = files.map(({ attachment, filename, ...file }) => ({
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    ...(attachment.type ? { type: attachment.type } : {}),
    ...("unavailable" in file && file.unavailable
      ? { missingFile: true }
      : { archivePath: `${prefix}attachments/${filename}` }),
  }));
  const exportedTask = {
    ...task,
    events,
    attachments: exportedFiles.filter((file) =>
      task.attachments.some((attachment) => attachment.id === file.id),
    ),
    comments: comments.map((comment) => ({
      ...comment,
      attachments: exportedFiles.filter((file) =>
        comment.attachments.some((attachment) => attachment.id === file.id),
      ),
    })),
  };
  const archiveFiles: AsyncZippable = {
    [`${prefix}task.json`]: [strToU8(JSON.stringify(exportedTask, null, 2)), { level: 6 }],
  };

  for (const file of files) {
    if (!("contents" in file)) continue;
    const { attachment, filename, contents } = file;
    archiveFiles[`${prefix}attachments/${filename}`] = [
      contents,
      {
        level: isAlreadyCompressed(attachment) ? 0 : 6,
      },
    ];
  }

  return archiveFiles;
};

const zipArchiveFiles = (archiveFiles: AsyncZippable) =>
  new Promise<Uint8Array>((resolve, reject) => {
    zip(archiveFiles, (error, archive) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(archive);
    });
  });

export const buildTaskExportArchive = async (
  task: Task,
  events: readonly TrackerEvent[],
  readAttachment: AttachmentReader = getTrackerCardAttachmentBlob,
  comments: readonly TaskComment[] = [],
) =>
  zipArchiveFiles(
    await buildTaskExportFiles(task, events, readAttachment, "", undefined, comments),
  );

export type TaskExportItem = {
  readonly task: Task;
  readonly events: readonly TrackerEvent[];
  readonly comments?: readonly TaskComment[];
};

export const buildTaskCollectionExportArchive = async (
  items: readonly TaskExportItem[],
  readAttachment: AttachmentReader = getTrackerCardAttachmentBlob,
) => {
  const archiveFiles: AsyncZippable = {};
  const unavailableAttachments: UnavailableAttachment[] = [];

  for (let index = 0; index < items.length; index += 4) {
    const batch = await Promise.all(
      items
        .slice(index, index + 4)
        .map(({ task, events, comments }) =>
          buildTaskExportFiles(
            task,
            events,
            readAttachment,
            `tasks/${sanitizeFilename(`${task.title}-${task.id}`)}`,
            unavailableAttachments,
            comments,
          ),
        ),
    );
    for (const files of batch) Object.assign(archiveFiles, files);
  }

  archiveFiles["export-report.json"] = [
    strToU8(JSON.stringify({ taskCount: items.length, unavailableAttachments }, null, 2)),
    { level: 6 },
  ];

  return {
    archive: await zipArchiveFiles(archiveFiles),
    unavailableAttachments,
  };
};

const downloadArchive = (archive: Uint8Array, filename: string) => {
  const archiveBytes = new Uint8Array(archive.byteLength);
  archiveBytes.set(archive);
  const archiveUrl = URL.createObjectURL(
    new Blob([archiveBytes.buffer], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = archiveUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(archiveUrl), 60_000);
};

export const downloadTaskExportArchive = async (task: Task, events: readonly TrackerEvent[]) =>
  downloadArchive(
    await buildTaskExportArchive(
      task,
      events,
      getTrackerCardAttachmentBlob,
      await getTaskComments(task.id),
    ),
    `${sanitizeFilename(task.title)}.zip`,
  );

export const downloadTaskCollectionExportArchive = async (
  columnLabel: string,
  items: readonly TaskExportItem[],
) => {
  const withComments: TaskExportItem[] = [];
  for (let index = 0; index < items.length; index += 4) {
    withComments.push(
      ...(await Promise.all(
        items
          .slice(index, index + 4)
          .map(async (item) => ({ ...item, comments: await getTaskComments(item.task.id) })),
      )),
    );
  }
  const result = await buildTaskCollectionExportArchive(withComments);
  downloadArchive(
    result.archive,
    boardText("{0} - все задачи.zip", sanitizeFilename(columnLabel)),
  );
  return result.unavailableAttachments.length;
};
