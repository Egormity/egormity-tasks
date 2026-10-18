import { boardText } from "@/features/board/i18n/board-copy";

export const formatFileSize = (size: number) => {
  if (size < 1024) return boardText("{0} Б", size);
  if (size < 1024 * 1024) return boardText("{0} КБ", Math.round(size / 1024));
  return boardText("{0} МБ", (size / (1024 * 1024)).toFixed(1));
};

const imageExtensions = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);

const textExtensions = new Set([
  "c",
  "cfg",
  "css",
  "csv",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "log",
  "md",
  "py",
  "txt",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

type PreviewKind = "image" | "text" | null;

export const getPreviewKind = (name: string, type?: string): PreviewKind => {
  const extension = name.split(".").pop()?.toLowerCase();
  if (type?.startsWith("image/") || (extension && imageExtensions.has(extension))) {
    return "image";
  }
  if (type?.startsWith("text/") || (extension && textExtensions.has(extension))) {
    return "text";
  }
  return null;
};
