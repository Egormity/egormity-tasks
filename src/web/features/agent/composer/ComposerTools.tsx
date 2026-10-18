import { useState, type RefObject } from "react";
import { AppDialog } from "@/shared/ui/AppDialog";
import type { AgentCommand, ChatControls } from "@contracts/commands.js";
import { Select } from "@/shared/ui/Select";
import { usePreferences } from "@/shared/i18n/preferences";
import type { useComposerTools } from "./useComposerTools";
import { CodexStatus } from "./CodexStatus";

const ModelSettings = ({
  controls,
  disabled,
  save,
}: {
  controls: ChatControls;
  disabled: boolean;
  save: (input: AgentCommand) => Promise<void>;
}) => {
  const { copy } = usePreferences();
  const [modelId, setModel] = useState(controls.model);
  const model = controls.models.find((value) => value.model === modelId);
  const [effort, setEffort] = useState(
    controls.effort ?? model?.defaultReasoningEffort ?? "medium",
  );
  const [tier, setTier] = useState(
    model?.serviceTiers.some((value) => value.id === controls.serviceTier)
      ? controls.serviceTier!
      : "",
  );
  return (
    <div className="space-y-3">
      <p className="text-muted text-xs">{copy.settingsNextTurn}</p>
      <Select
        label={copy.model}
        value={modelId}
        disabled={disabled}
        options={[
          ...(!model ? [{ value: modelId, label: modelId }] : []),
          ...controls.models.map((value) => ({ value: value.model, label: value.displayName })),
        ]}
        onChange={(id) => {
          const next = controls.models.find((value) => value.model === id)!;
          setModel(id);
          setEffort(next.defaultReasoningEffort);
          setTier(next.defaultServiceTier ?? "");
        }}
      />
      {model && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={copy.reasoningEffort}
              value={effort}
              disabled={disabled}
              options={model.supportedReasoningEfforts.map((value) => ({
                value: value.reasoningEffort,
                label: value.reasoningEffort,
              }))}
              onChange={setEffort}
            />
            <Select
              label={copy.speed}
              value={tier}
              disabled={disabled}
              options={[
                { value: "", label: copy.standardSpeed },
                ...model.serviceTiers.map((value) => ({ value: value.id, label: value.name })),
              ]}
              onChange={setTier}
            />
          </div>
          {tier && <p className="text-muted text-xs">{copy.fastUsage}</p>}
          <button
            type="button"
            disabled={disabled}
            className="bg-accent text-on-accent rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            onClick={() =>
              void save({
                command: "settings",
                model: modelId,
                effort,
                serviceTier: tier || null,
              })
            }
          >
            {copy.save}
          </button>
        </>
      )}
    </div>
  );
};

export const ComposerTools = ({
  tools,
  disabled,
  returnFocus,
}: {
  tools: ReturnType<typeof useComposerTools>;
  disabled: boolean;
  returnFocus: RefObject<HTMLTextAreaElement | null>;
}) => {
  const { copy, errorText } = usePreferences();
  if (!tools.panel) return null;
  const title =
    tools.panel === "status"
      ? copy.codexStatus
      : tools.panel === "settings"
        ? copy.chooseModel
        : copy.backgroundTerminals;
  return (
    <AppDialog
      open
      title={title}
      onClose={() => tools.setPanel(null)}
      returnFocus={returnFocus}
    >
      {tools.loading ? (
        <p role="status" className="text-muted text-sm">
          {copy.loading}
        </p>
      ) : tools.error ? (
        <div className="space-y-3 text-sm">
          <p role="alert" className="text-danger">
            {errorText(tools.error)}
          </p>
          <button type="button" onClick={tools.refresh}>
            {copy.refresh}
          </button>
        </div>
      ) : tools.panel === "status" ? (
        tools.status && <CodexStatus status={tools.status} refresh={tools.refresh} />
      ) : tools.panel === "settings" && tools.controls ? (
        <ModelSettings
          key={`${tools.controls.model}:${tools.controls.effort}:${tools.controls.serviceTier}`}
          controls={tools.controls}
          disabled={disabled}
          save={tools.save}
        />
      ) : (
        <div className="space-y-3">
          {!tools.terminals.length && <p className="text-muted text-sm">{copy.noTerminals}</p>}
          {tools.terminals.map((terminal) => (
            <div
              key={terminal.processId}
              className="border-line flex items-start gap-3 border-b pb-3"
            >
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-mono wrap-anywhere">{terminal.command}</p>
                <p className="text-muted mt-1 wrap-anywhere">{terminal.cwd}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                className="text-danger shrink-0 text-sm disabled:opacity-50"
                onClick={() => void tools.stopTerminals(terminal.processId)}
              >
                {copy.stopProcess}
              </button>
            </div>
          ))}
          <div className="flex gap-4 text-sm">
            <button type="button" disabled={disabled} onClick={tools.refresh}>
              {copy.refresh}
            </button>
            {tools.terminals.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                className="text-danger"
                onClick={() => void tools.stopTerminals()}
              >
                {copy.stopAllProcesses}
              </button>
            )}
          </div>
        </div>
      )}
    </AppDialog>
  );
};
