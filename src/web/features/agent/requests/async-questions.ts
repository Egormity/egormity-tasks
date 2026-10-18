import type { Thread } from "@contracts/agent.js";
import { z } from "zod";

export const questionRepliesSchema = z.array(
  z.object({ question: z.string(), answer: z.string(), questionItemId: z.string() }),
);

export const questionId = (itemId: string, index: number) =>
  JSON.stringify(["request_user_input_async", itemId, index]);

export const questionReply = (
  itemId: string,
  questions: { title: string }[],
  answers: string[],
) =>
  `<send_user_message_question_reply>\n${JSON.stringify(
    questions.flatMap((question, index) =>
      answers[index]?.trim()
        ? [
            {
              answer: answers[index]?.trim() ?? "",
              question: question.title,
              questionItemId: questionId(itemId, index),
            },
          ]
        : [],
    ),
  )}\n</send_user_message_question_reply>`;

export const answeredQuestions = (thread: Thread | null) => {
  const answered = new Set<string>();
  for (const turn of thread?.turns ?? [])
    for (const item of turn.items) {
      if (item.type !== "userMessage") continue;
      for (const part of item.content) {
        if (part.type !== "text") continue;
        for (const match of part.text.matchAll(
          /<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>/gu,
        )) {
          try {
            const value = questionRepliesSchema.safeParse(JSON.parse(match[1]!));
            if (value.success)
              for (const reply of value.data) {
                if (reply.answer.trim()) answered.add(reply.questionItemId);
              }
          } catch {
            /* An ordinary message may contain an incomplete example. */
          }
        }
      }
    }
  return answered;
};
