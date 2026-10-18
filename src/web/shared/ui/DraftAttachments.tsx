import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";

export const DraftAttachments = ({
  files,
  disabled,
  onRemove,
  removeLabel,
}: {
  files: File[];
  disabled: boolean;
  onRemove: (index: number) => void;
  removeLabel: string;
}) => {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) =>
      file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    );
    setPreviews(urls);
    return () =>
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
  }, [files]);
  if (!files.length) return null;
  return (
    <ul className="scroll-area flex gap-2 overflow-x-auto p-3 pb-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="border-line bg-panel flex max-w-full shrink-0 items-center gap-2 rounded-xl border p-2 text-xs"
        >
          {previews[index] ? (
            <img
              src={previews[index]}
              alt={file.name}
              className="size-10 rounded-lg object-cover"
            />
          ) : (
            <FileText className="text-muted size-6 shrink-0" />
          )}
          <span className="max-w-40 truncate" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            aria-label={`${removeLabel}: ${file.name}`}
            disabled={disabled}
            className="text-muted hover:text-ink p-1"
            onClick={() => onRemove(index)}
          >
            <X size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
};
