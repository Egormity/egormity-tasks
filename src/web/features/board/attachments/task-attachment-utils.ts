import type { TaskAttachment } from "@/features/board/data/task-data";

const makeAttachmentId = (file: File) =>
  `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;

export const getClipboardFiles = (clipboardData: DataTransfer | null | undefined): File[] => {
  const clipboardItems = clipboardData?.items ? Array.from(clipboardData.items) : [];
  const clipboardFiles = clipboardItems
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return clipboardFiles.length ? clipboardFiles : Array.from(clipboardData?.files ?? []);
};

export const createTaskAttachments = (files: readonly File[]): readonly TaskAttachment[] =>
  files.map((file) => ({
    id: makeAttachmentId(file),
    name: file.name,
    size: file.size,
    type: file.type,
  }));
