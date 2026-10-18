import { z } from "zod";
import { boardTaskContextSchema } from "@contracts/task-context.js";

import { questionRepliesSchema } from "@/features/agent/requests/async-questions";

export const userMessagePresentation = (raw: string) => {
  let text = raw;
  let context: z.infer<typeof boardTaskContextSchema> | undefined;
  const match =
    /^Current board task snapshot[^\n]*\n<amazi_task_context>\n([^\n]*)\n<\/amazi_task_context>\n\n/u.exec(
      text,
    );
  if (match) {
    try {
      const value = boardTaskContextSchema.safeParse(JSON.parse(match[1]!));
      if (value.success) {
        context = value.data;
        text = text.slice(match[0].length);
      }
    } catch {
      /* Preserve malformed native content verbatim. */
    }
  }
  text = text.replace(
    /<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>/gu,
    (original, body: string) => {
      try {
        const parsed = questionRepliesSchema.safeParse(JSON.parse(body));
        if (parsed.success)
          return parsed.data
            .map((value) => `${value.question}\n\n${value.answer}`)
            .join("\n\n");
      } catch {
        /* Preserve unrelated user text. */
      }
      return original;
    },
  );
  return { text, context };
};
