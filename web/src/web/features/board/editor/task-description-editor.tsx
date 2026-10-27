import { EditorContent, type EditorOptions, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { boardText } from "@/features/board/i18n/board-copy";

type TaskDescriptionEditorProps = {
  readonly initialValue: string;
  readonly maxLength?: number | undefined;
  readonly onChange: (value: string) => void;
};

type ToolbarButtonProps = {
  readonly active?: boolean | undefined;
  readonly children: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly label: string;
  readonly onClick: () => void;
};

const ToolbarButton = ({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: ToolbarButtonProps) => (
  <button
    aria-label={label}
    aria-pressed={active}
    className={`text-board-icon hover:bg-board-toolbar-hover hover:text-board-accent-hover focus-visible:ring-board-accent grid size-7 place-items-center rounded-lg transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-board-button-selected text-board-accent" : ""}`}
    disabled={disabled}
    onClick={onClick}
    title={label}
    type="button"
  >
    {children}
  </button>
);

const getDocumentText = (
  view: Parameters<NonNullable<EditorOptions["editorProps"]["handleTextInput"]>>[0],
) => view.state.doc.textBetween(0, view.state.doc.content.size, "\n");

const createPlainTextDocument = (value: string) => ({
  content: value.split("\n").map((line) => ({
    content: line ? [{ text: line, type: "text" }] : [],
    type: "paragraph",
  })),
  type: "doc",
});

export const TaskDescriptionEditor = ({
  initialValue,
  maxLength = 8000,
  onChange,
}: TaskDescriptionEditorProps) => {
  const [isEmpty, setIsEmpty] = useState(initialValue.length === 0);

  const editor = useEditor({
    content: createPlainTextDocument(initialValue.slice(0, maxLength)),
    editorProps: {
      attributes: {
        "aria-label": boardText("Описание задачи"),
        class:
          "min-h-[140px] max-h-[360px] overflow-y-auto px-3 py-2 text-xs leading-5 text-board-input-text outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5",
        id: "task-description-editor",
      },
      handlePaste: (view, event, slice) => {
        const currentText = getDocumentText(view);
        const selectedText = view.state.doc.textBetween(
          view.state.selection.from,
          view.state.selection.to,
          "\n",
        );
        const availableLength = maxLength - (currentText.length - selectedText.length);
        const pastedText =
          event.clipboardData?.getData("text/plain") ??
          slice.content.textBetween(0, slice.content.size, "\n");

        if (pastedText.length <= availableLength) return false;

        const nextText = pastedText.slice(0, Math.max(0, availableLength));
        view.dispatch(
          view.state.tr.insertText(
            nextText,
            view.state.selection.from,
            view.state.selection.to,
          ),
        );
        return true;
      },
      handleTextInput: (view, from, to, text) => {
        const currentText = getDocumentText(view);
        const selectedText = view.state.doc.textBetween(from, to, "\n");
        const availableLength = maxLength - (currentText.length - selectedText.length);

        if (text.length <= availableLength) return false;

        view.dispatch(
          view.state.tr.insertText(text.slice(0, Math.max(0, availableLength)), from, to),
        );
        return true;
      },
    },
    extensions: [StarterKit],
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      const currentValue = currentEditor.getText({ blockSeparator: "\n" });
      const nextValue = currentValue.slice(0, maxLength);
      if (currentValue.length > maxLength) {
        currentEditor.commands.setContent(createPlainTextDocument(nextValue), {
          emitUpdate: false,
        });
      }
      setIsEmpty(currentEditor.isEmpty);
      onChange(nextValue);
    },
  });

  return (
    <div className="border-board-input-border bg-board-input-surface focus-within:border-board-accent focus-within:ring-board-accent/15 mt-1.5 overflow-hidden rounded-md border transition focus-within:ring-2">
      <div
        aria-label={boardText("Инструменты форматирования")}
        className="border-board-section-border bg-board-canvas flex items-center gap-1 border-b px-1.5 py-1"
        role="toolbar"
      >
        <ToolbarButton
          active={editor?.isActive("bold")}
          label={boardText("Жирный")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("italic")}
          label={boardText("Курсив")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" className="size-4" />
        </ToolbarButton>
        <span aria-hidden="true" className="bg-board-toolbar-divider mx-1 h-5 w-px" />
        <ToolbarButton
          active={editor?.isActive("bulletList")}
          label={boardText("Маркированный список")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List aria-hidden="true" className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("orderedList")}
          label={boardText("Нумерованный список")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden="true" className="size-4" />
        </ToolbarButton>
        <span aria-hidden="true" className="bg-board-toolbar-divider mx-1 h-5 w-px" />
        <ToolbarButton
          disabled={!editor?.can().chain().focus().undo().run()}
          label={boardText("Отменить")}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 aria-hidden="true" className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor?.can().chain().focus().redo().run()}
          label={boardText("Повторить")}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 aria-hidden="true" className="size-4" />
        </ToolbarButton>
      </div>
      <div className="relative">
        {isEmpty && (
          <span className="text-board-placeholder pointer-events-none absolute top-2 left-3 z-10 text-xs leading-5">
            {boardText("Что нужно сделать и какой результат ожидается?")}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
