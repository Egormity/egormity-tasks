import type { ChatControls } from "@contracts/commands.js";
import { usePreferences } from "@/shared/i18n/preferences";

export const ComposerSettingsSummary = ({
  controls,
  disabled,
  expanded,
  onToggle,
}: {
  controls: ChatControls | null;
  disabled: boolean;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const { copy } = usePreferences();
  const model = controls?.models?.find((value) => value.model === controls.model);
  const effort = controls?.effort ?? model?.defaultReasoningEffort;
  const speed = controls
    ? !controls.serviceTier || controls.serviceTier === "default"
      ? copy.standardSpeed
      : (model?.serviceTiers.find((tier) => tier.id === controls.serviceTier)?.name ??
        controls.serviceTier)
    : null;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={copy.chooseModel}
      aria-expanded={expanded}
      className="text-muted hover:text-ink flex min-w-0 flex-wrap items-center gap-x-1.5 text-left text-xs leading-5 disabled:opacity-40"
      onClick={onToggle}
    >
      <span className="wrap-anywhere">
        {model?.displayName ?? controls?.model ?? copy.model}
      </span>
      {effort && (
        <span className="whitespace-nowrap" title={copy.reasoningEffort}>
          · {effort}
        </span>
      )}
      {speed && (
        <span className="whitespace-nowrap" title={copy.speed}>
          · {speed}
        </span>
      )}
    </button>
  );
};
