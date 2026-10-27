import { Settings2, Tag as TagIcon } from "lucide-react";

import { TrackerCheckbox } from "@/features/board/components/checkbox";
import type { TrackerTag } from "@/features/board/data/tracker-api";

import { boardText } from "@/features/board/i18n/board-copy";
import { taskTagToneStyles } from "./task-tag-styles";

type TaskEditorTagsProps = {
  readonly onConfigure?: (() => void) | undefined;
  readonly onToggleTag?: ((id: string) => void) | undefined;
  readonly readOnly?: boolean | undefined;
  readonly selectedTagIds: readonly string[];
  readonly tags: readonly TrackerTag[];
};

export const TaskEditorTags = ({
  onConfigure,
  onToggleTag,
  readOnly = false,
  selectedTagIds,
  tags,
}: TaskEditorTagsProps) => {
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  return (
    <section aria-labelledby="task-tags-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TagIcon aria-hidden="true" className="text-board-icon size-4" />
          <h2 className="text-board-text text-xs font-medium" id="task-tags-heading">
            {boardText("Теги")}
          </h2>
        </div>
        {!readOnly && onConfigure && (
          <button
            aria-label={boardText("Настроить справочник тегов")}
            className="text-board-icon hover:bg-board-selected hover:text-board-accent-hover focus-visible:ring-board-accent inline-flex min-h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            onClick={onConfigure}
            type="button"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            {boardText("Настроить")}
          </button>
        )}
      </div>

      <div className="border-board-modal-border bg-board-canvas rounded-md border p-2.5">
        {readOnly ? (
          selectedTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${taskTagToneStyles[tag.tone]}`}
                  key={tag.id}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-board-subtle text-xs">
              {boardText("К этой карточке пока не применены теги.")}
            </p>
          )
        ) : tags.length > 0 ? (
          <div className="space-y-2">
            <p className="text-board-summary mb-2 text-[11px]">
              {boardText("Выберите один или несколько тегов для этой карточки.")}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);

                return (
                  <label
                    className={`flex min-w-0 items-center justify-between gap-2 rounded-sm border px-2 py-1 text-left transition-colors ${selected ? "border-board-accent-border bg-board-toolbar-hover" : "border-board-modal-border bg-board-surface"}`}
                    key={tag.id}
                  >
                    <TrackerCheckbox
                      aria-label={boardText("Выбрать тег {0}", tag.name)}
                      checked={selected}
                      onChange={() => onToggleTag?.(tag.id)}
                    />
                    <span
                      className={`max-w-full min-w-0 truncate rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${taskTagToneStyles[tag.tone]}`}
                    >
                      {tag.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-board-subtle text-xs">
            {boardText("Тегов пока нет. Настройте справочник, чтобы добавить первый тег.")}
          </p>
        )}
      </div>
    </section>
  );
};
