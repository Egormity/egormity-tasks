import { useState } from "react";
import type { RpcMessage } from "@contracts/agent.js";
import { usePreferences } from "@/shared/i18n/preferences";
import { McpElicitation } from "./McpElicitation";
import { mcpRequestSchema } from "./mcp-form";

type Question = {
  id: string;
  header: string;
  question: string;
  options?: { label: string; description: string }[] | null;
};

const CodexRequest = ({
  event,
  disabled,
  onRespond,
}: {
  event: RpcMessage;
  disabled: boolean;
  onRespond: (id: string | number, result: unknown) => Promise<boolean>;
}) => {
  const { copy } = usePreferences();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("{}");
  const [error, setError] = useState("");
  if (event.id === undefined) return null;
  const id = event.id;
  const elicitation =
    event.method === "mcpServer/elicitation/request"
      ? mcpRequestSchema.safeParse(event.params)
      : null;
  const questions =
    event.method === "item/tool/requestUserInput"
      ? (event.params.questions as Question[])
      : null;
  const approval =
    event.method === "item/commandExecution/requestApproval" ||
    event.method === "item/fileChange/requestApproval";
  return (
    <section className="border-accent bg-panel space-y-3 rounded-xl border p-4 text-sm">
      <h3 className="font-semibold">{copy.agentRequest}</h3>
      {elicitation?.success ? (
        <McpElicitation
          request={elicitation.data}
          metadata={event.params._meta}
          disabled={disabled}
          onRespond={(result) => onRespond(id, result)}
        />
      ) : questions ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onRespond(id, {
              answers: Object.fromEntries(
                questions.map((question) => [
                  question.id,
                  { answers: [answers[question.id] ?? ""] },
                ]),
              ),
            });
          }}
        >
          {questions.map((question) => (
            <fieldset key={question.id} className="mb-4 space-y-2">
              <legend>{question.question}</legend>
              {question.options?.map((option) => (
                <label key={option.label} className="block">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option.label}
                    onChange={() =>
                      setAnswers((value) => ({ ...value, [question.id]: option.label }))
                    }
                  />{" "}
                  {option.label}
                  <span className="text-muted ml-2">{option.description}</span>
                </label>
              ))}
              <input
                className="border-line bg-canvas w-full rounded border p-2"
                aria-label={question.question}
                value={answers[question.id] ?? ""}
                onChange={(event) =>
                  setAnswers((value) => ({ ...value, [question.id]: event.target.value }))
                }
              />
            </fieldset>
          ))}
          <button
            disabled={disabled || questions.some((question) => !answers[question.id]?.trim())}
            className="bg-accent text-on-accent rounded px-4 py-2 disabled:opacity-40"
          >
            {copy.send}
          </button>
        </form>
      ) : (
        <>
          {typeof event.params.message === "string" && (
            <p className="whitespace-pre-wrap wrap-anywhere">{event.params.message}</p>
          )}
          <details className="border-line rounded-lg border text-xs">
            <summary className="cursor-pointer p-3 font-mono">{event.method}</summary>
            <pre className="bg-code p-3 whitespace-pre-wrap">
              {JSON.stringify(event.params, null, 2)}
            </pre>
          </details>
          {approval ? (
            <div className="flex gap-3">
              <button
                disabled={disabled}
                className="bg-accent text-on-accent rounded px-4 py-2"
                onClick={() => void onRespond(id, { decision: "accept" })}
              >
                {copy.approve}
              </button>
              <button
                disabled={disabled}
                className="border-line rounded border px-4 py-2"
                onClick={() => void onRespond(id, { decision: "decline" })}
              >
                {copy.decline}
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const result: unknown = JSON.parse(raw);
                  void onRespond(id, result);
                  setError("");
                } catch {
                  setError(copy.invalidJson);
                }
              }}
            >
              <label>
                {copy.protocolResponse}
                <textarea
                  className="border-line bg-canvas mt-2 w-full rounded border p-3 font-mono"
                  value={raw}
                  onChange={(event) => setRaw(event.target.value)}
                />
              </label>
              <button
                disabled={disabled}
                className="bg-accent text-on-accent rounded px-4 py-2"
              >
                {copy.send}
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
};

export const CodexRequests = ({
  events,
  disabled,
  onRespond,
}: {
  events: RpcMessage[];
  disabled: boolean;
  onRespond: (id: string | number, result: unknown) => Promise<boolean>;
}) => (
  <>
    {events.map((event) => (
      <CodexRequest key={event.id} event={event} disabled={disabled} onRespond={onRespond} />
    ))}
  </>
);
