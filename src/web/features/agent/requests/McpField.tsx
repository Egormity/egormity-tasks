import { useId } from "react";
import { Select } from "@/shared/ui/Select";
import { usePreferences } from "@/shared/i18n/preferences";
import { fieldOptions, type McpFieldSchema, type FormValues } from "./mcp-form";

export const McpField = ({
  name,
  field,
  required,
  value,
  onChange,
}: {
  name: string;
  field: McpFieldSchema;
  required: boolean;
  value: FormValues[string] | undefined;
  onChange: (value: FormValues[string]) => void;
}) => {
  const id = useId();
  const { copy } = usePreferences();
  const title = `${field.title ?? name}${required ? " *" : ""}`;
  const choices = fieldOptions(field);
  const style =
    "border-line bg-canvas text-ink focus-visible:border-accent focus-visible:ring-accent w-full min-w-0 rounded-lg border px-3 py-2 outline-none focus-visible:ring-1";
  return (
    <div className="min-w-0 space-y-2">
      {field.type === "array" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">{title}</legend>
          {choices?.map((option) => (
            <label key={option.value} className="flex items-start gap-2 wrap-anywhere">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={Array.isArray(value) && value.includes(option.value)}
                onChange={(event) => {
                  const selected = Array.isArray(value) ? value : [];
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  );
                }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : field.type === "boolean" || choices ? (
        <Select
          label={title}
          className="text-sm"
          value={value === undefined ? "" : String(value)}
          options={[
            { value: "", label: copy.selectAnswer },
            ...(field.type === "boolean"
              ? [
                  { value: "true", label: copy.answerYes },
                  { value: "false", label: copy.answerNo },
                ]
              : (choices ?? [])),
          ]}
          onChange={(next) =>
            onChange(field.type === "boolean" && next !== "" ? next === "true" : next)
          }
        />
      ) : (
        <>
          <label htmlFor={id} className="block font-medium">
            {title}
          </label>
          {field.type === "string" && !field.format ? (
            <textarea
              id={id}
              className={`${style} resize-y`}
              rows={3}
              required={required}
              minLength={field.minLength}
              maxLength={field.maxLength}
              value={typeof value === "string" ? value : ""}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              id={id}
              className={style}
              required={required}
              type={
                field.type === "string"
                  ? field.format === "email"
                    ? "email"
                    : field.format === "uri"
                      ? "url"
                      : field.format === "date"
                        ? "date"
                        : "text"
                  : "number"
              }
              {...(field.type === "number" || field.type === "integer"
                ? {
                    min: field.minimum,
                    max: field.maximum,
                    step: field.type === "integer" ? 1 : "any",
                  }
                : {})}
              value={typeof value === "string" ? value : ""}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </>
      )}
      {field.description && (
        <p className="text-muted text-xs wrap-anywhere">{field.description}</p>
      )}
    </div>
  );
};
