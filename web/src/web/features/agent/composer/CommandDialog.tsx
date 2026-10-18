import { useId, useState, type RefObject } from "react";
import { Search } from "lucide-react";
import { AppDialog } from "@/shared/ui/AppDialog";
import { usePreferences } from "@/shared/i18n/preferences";
import { composerCommands, type ComposerCommand } from "./composer-commands";

export const CommandDialog = ({
  onClose,
  onChoose,
  isDisabled,
  initialQuery,
  returnFocus,
}: {
  onClose: () => void;
  onChoose: (command: ComposerCommand) => void;
  isDisabled: (command: ComposerCommand) => boolean;
  initialQuery: string;
  returnFocus: RefObject<HTMLTextAreaElement | null>;
}) => {
  const { copy } = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const id = useId();
  const commands = composerCommands(copy).filter((command) =>
    `${command.id} ${command.label}`
      .toLowerCase()
      .includes(query.replace(/^\//u, "").toLowerCase()),
  );
  return (
    <AppDialog open onClose={onClose} title={copy.commands} returnFocus={returnFocus}>
      <div className="border-line bg-canvas mb-3 flex items-center gap-2 rounded-xl border px-3">
        <Search size={18} className="text-muted" />
        <input
          aria-label={copy.searchCommands}
          role="combobox"
          aria-expanded
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={commands.length ? `${id}-${selected}` : undefined}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
          value={query}
          placeholder={copy.searchCommands}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (commands.length)
                setSelected(
                  (value) =>
                    (value + (event.key === "ArrowDown" ? 1 : commands.length - 1)) %
                    commands.length,
                );
            }
            if (
              (event.key === "Enter" || event.key === "Tab") &&
              !event.shiftKey &&
              commands[selected]
            ) {
              event.preventDefault();
              onChoose(commands[selected].id);
            }
          }}
        />
      </div>
      <div id={id} role="listbox" aria-label={copy.commands} className="space-y-1">
        {commands.map((command, index) => (
          <button
            key={command.id}
            id={`${id}-${index}`}
            role="option"
            aria-selected={selected === index}
            type="button"
            disabled={isDisabled(command.id)}
            onClick={() => onChoose(command.id)}
            className={`flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-sm disabled:opacity-40 ${selected === index ? "bg-accent/15" : "hover:bg-accent/10"}`}
          >
            <span className="text-accent w-20 shrink-0 font-mono">/{command.id}</span>
            <span>{command.label}</span>
          </button>
        ))}
        {!commands.length && <p className="text-muted p-3 text-sm">{copy.noCommands}</p>}
      </div>
    </AppDialog>
  );
};
