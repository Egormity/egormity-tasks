import { useState } from "react";
import type { ThreadItem } from "@contracts/agent.js";
import { usePreferences } from "@/shared/i18n/preferences";
import { questionId, questionReply } from "./async-questions";

export const AsyncQuestions = ({
  item,
  answered,
  disabled,
  onSend,
}: {
  item: Extract<ThreadItem, { type: "agentMessage" }>;
  answered: Set<string>;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
}) => {
  const { copy } = usePreferences();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const questions = item.questions ?? [];
  const hasAnswer = (index: number) => answered.has(questionId(item.id, index));
  const missingAnswer = questions.some(
    (_, index) => !hasAnswer(index) && !answers[index]?.trim(),
  );
  const complete = sent || questions.every((_, index) => hasAnswer(index));
  return (
    <form
      className="border-accent/50 bg-panel space-y-4 rounded-xl border p-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || sending || complete || missingAnswer) return;
        setSending(true);
        void onSend(
          questionReply(
            item.id,
            questions,
            questions.map((_, i) => (hasAnswer(i) ? "" : (answers[i] ?? ""))),
          ),
        )
          .then((ok) => {
            if (ok) setSent(true);
          })
          .finally(() => setSending(false));
      }}
    >
      <h3 className="text-accent font-semibold">
        {complete ? copy.questionAnswered : copy.agentRequest}
      </h3>
      {questions.map((question, index) => (
        <fieldset
          key={index}
          disabled={disabled || sending || complete || hasAnswer(index)}
          className="min-w-0 space-y-2"
        >
          <legend className="mb-2 font-medium whitespace-pre-wrap wrap-anywhere">
            {question.title}
          </legend>
          {!complete && hasAnswer(index) && (
            <p className="text-muted">{copy.questionAnswered}</p>
          )}
          {!complete && !hasAnswer(index) && (
            <>
              {question.options?.map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${answers[index] === option ? "border-accent bg-accent/10" : "border-line"}`}
                >
                  <input
                    className="mt-1 shrink-0"
                    type="radio"
                    name={`${item.id}-${index}`}
                    checked={answers[index] === option}
                    onChange={() => setAnswers((value) => ({ ...value, [index]: option }))}
                  />
                  <span className="min-w-0 whitespace-pre-wrap wrap-anywhere">{option}</span>
                </label>
              ))}
              <label className="text-muted block">
                {copy.customAnswer}
                <textarea
                  aria-label={question.title}
                  className="border-line bg-canvas mt-1 block w-full rounded-lg border p-3 text-ink"
                  rows={2}
                  maxLength={8000}
                  value={answers[index] ?? ""}
                  onChange={(event) =>
                    setAnswers((value) => ({ ...value, [index]: event.target.value }))
                  }
                />
              </label>
            </>
          )}
        </fieldset>
      ))}
      {!complete && (
        <button
          disabled={disabled || sending || missingAnswer}
          className="bg-accent text-on-accent rounded-lg px-4 py-2 disabled:opacity-40"
        >
          {copy.sendAnswer}
        </button>
      )}
    </form>
  );
};
