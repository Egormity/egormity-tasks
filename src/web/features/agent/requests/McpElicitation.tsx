import { useState } from "react";
import { z } from "zod";
import type { McpServerElicitationRequestResponse } from "@contracts/codex/v2/McpServerElicitationRequestResponse.js";
import { usePreferences } from "@/shared/i18n/preferences";
import { McpField } from "./McpField";
import { formContent, initialValues, type McpRequest } from "./mcp-form";

const toolDetails = z.object({
  tool_description: z.string().optional(),
  tool_params_display: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        display_name: z.string().optional(),
      }),
    )
    .optional(),
});

export const McpElicitation = ({
  request,
  metadata,
  disabled,
  onRespond,
}: {
  request: McpRequest;
  metadata: unknown;
  disabled: boolean;
  onRespond: (result: McpServerElicitationRequestResponse) => Promise<boolean>;
}) => {
  const { copy } = usePreferences();
  const [values, setValues] = useState(() => initialValues(request));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const locked = disabled || submitting;
  const content = formContent(request, values);
  const details = toolDetails.safeParse(metadata);
  const fields =
    request.mode === "form" ? Object.entries(request.requestedSchema.properties) : [];
  const respond = async (action: McpServerElicitationRequestResponse["action"]) => {
    if (locked || (action === "accept" && !content.valid)) return;
    setSubmitting(true);
    setError("");
    try {
      await onRespond({
        action,
        content: action === "accept" && content.valid ? content.content : null,
        _meta: null,
      });
    } catch {
      setError(copy.requestResponseFailed);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void respond("accept");
      }}
    >
      <p className="text-muted text-xs wrap-anywhere">MCP · {request.serverName}</p>
      <p className="text-base leading-relaxed whitespace-pre-wrap wrap-anywhere">
        {request.message}
      </p>
      {details.success &&
      (details.data.tool_description || details.data.tool_params_display?.length) ? (
        <div className="border-line bg-canvas min-w-0 space-y-2 rounded-lg border p-3">
          {details.data.tool_description && (
            <p className="font-medium wrap-anywhere">{details.data.tool_description}</p>
          )}
          {details.data.tool_params_display?.map((param, index) => (
            <div key={`${param.name}-${index}`} className="min-w-0">
              <p className="text-muted text-xs">{param.display_name ?? param.name}</p>
              <p className="mt-1 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
                {param.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {request.mode === "url" && (
        <a
          href={request.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent block underline wrap-anywhere"
        >
          {copy.openRequestLink}: {request.url}
        </a>
      )}
      {fields.length > 0 && (
        <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
          {fields.map(([name, field]) => (
            <McpField
              key={name}
              name={name}
              field={field}
              required={
                request.mode === "form" && !!request.requestedSchema.required?.includes(name)
              }
              value={values[name]}
              onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
            />
          ))}
        </fieldset>
      )}
      {fields.length > 0 && !content.valid && (
        <p className="text-muted text-xs">{copy.completeRequestFields}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={locked || !content.valid}
          className="bg-accent text-on-accent rounded-lg px-4 py-2 disabled:opacity-40"
        >
          {request.mode === "url"
            ? copy.requestCompleted
            : fields.length
              ? copy.sendAnswer
              : copy.approve}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => void respond("decline")}
          className="border-line rounded-lg border px-4 py-2 disabled:opacity-40"
        >
          {copy.decline}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => void respond("cancel")}
          className="text-muted rounded-lg px-4 py-2 disabled:opacity-40"
        >
          {copy.cancel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
};
