export type CommentFormat = "bold" | "italic" | "code" | "link" | "list";

export type CommentEdit = {
  readonly value: string;
  readonly selectionEnd: number;
  readonly selectionStart: number;
};

const replaceSelection = (
  value: string,
  start: number,
  end: number,
  insertion: string,
  selectionOffset: number,
  selectionLength: number,
): CommentEdit => ({
  value: value.slice(0, start) + insertion + value.slice(end),
  selectionStart: start + selectionOffset,
  selectionEnd: start + selectionOffset + selectionLength,
});

const wrapSelection = (
  value: string,
  start: number,
  end: number,
  marker: string,
): CommentEdit => {
  const selected = value.slice(start, end);
  return replaceSelection(
    value,
    start,
    end,
    `${marker}${selected}${marker}`,
    marker.length,
    selected.length,
  );
};

const prefixList = (value: string, start: number, end: number): CommentEdit => {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineBreak = value.indexOf("\n", end);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
    .join("\n");
  const valueNext = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return block.length === 0
    ? { value: valueNext, selectionStart: lineStart + 2, selectionEnd: lineStart + 2 }
    : {
        value: valueNext,
        selectionStart: lineStart,
        selectionEnd: lineStart + prefixed.length,
      };
};

/**
 * Applies a Markdown command to a textarea value and returns the next value plus
 * the range that should stay selected. Pure so the composer stays presentational.
 */
export const applyCommentFormat = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  format: CommentFormat,
): CommentEdit => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end);

  if (format === "list") return prefixList(value, start, end);

  if (format === "link") {
    if (!selected) return replaceSelection(value, start, end, "[](url)", 1, 0);
    return replaceSelection(value, start, end, `[${selected}](url)`, selected.length + 3, 3);
  }

  if (format === "code") {
    if (!selected) return replaceSelection(value, start, end, "``", 1, 0);
    if (selected.includes("`") || selected.includes("\n")) {
      return replaceSelection(
        value,
        start,
        end,
        `\`\`\`\n${selected}\n\`\`\``,
        4,
        selected.length,
      );
    }
    return wrapSelection(value, start, end, "`");
  }

  return wrapSelection(value, start, end, format === "bold" ? "**" : "*");
};
