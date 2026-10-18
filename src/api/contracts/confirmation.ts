import { z } from "zod";
import { messageInputSchema } from "./agent.js";
import { commandInputSchema } from "./commands.js";

export const confirmationActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), chatId: z.uuid(), input: messageInputSchema }),
  z.object({ kind: z.literal("command"), chatId: z.uuid(), input: commandInputSchema }),
  z.object({
    kind: z.literal("response"),
    input: z.object({ id: z.union([z.string().max(256), z.number()]), result: z.json() }),
  }),
  z.object({ kind: z.literal("login"), input: z.object({}) }),
]);
export type ConfirmationAction = z.infer<typeof confirmationActionSchema>;
export const confirmationProofSchema = z.object({
  id: z.uuid(),
  code: z.string().regex(/^\d{6}$/u),
});
export type ConfirmationChallenge = {
  id: string;
  expiresAt: number;
  resendAt: number;
  telegramUrl: string;
};
export type ConfirmationPreparation = ConfirmationChallenge | { confirmed: true };

export const confirmationPath = (action: ConfirmationAction) =>
  action.kind === "message"
    ? `/chats/${action.chatId}/messages`
    : action.kind === "command"
      ? `/chats/${action.chatId}/commands`
      : action.kind === "response"
        ? "/requests/respond"
        : "/codex/login";
