import { z } from "zod";
import { HttpError } from "./auth.js";

const configurationSchema = z.object({
  url: z.url(),
  token: z.string().min(1),
  chatId: z.string().regex(/^-100\d+$/u),
  threadId: z.coerce.number().int().positive(),
});
export type TelegramConfiguration = z.infer<typeof configurationSchema>;
export const parseTelegramConfiguration = (environment: NodeJS.ProcessEnv) => {
  const url = environment.OPERATIONS_AGENT_TELEGRAM_URL;
  const token = environment.OPERATIONS_AGENT_TELEGRAM_TOKEN;
  if (!url && !token) return undefined;
  return configurationSchema.parse({
    url,
    token,
    chatId: environment.OPERATIONS_AGENT_TELEGRAM_CHAT_ID,
    threadId: environment.OPERATIONS_AGENT_TELEGRAM_THREAD_ID,
  });
};

export const telegramTopicUrl = (config: TelegramConfiguration) =>
  `https://t.me/c/${config.chatId.slice(4)}/${config.threadId}`;

/** The configured Gateway owns the bot token; the browser cannot select a destination. */
export const sendTelegramConfirmation = async (config: TelegramConfiguration, text: string) => {
  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        message_thread_id: config.threadId,
        text,
        protect_content: true,
      }),
    });
    const payload = z
      .object({
        ok: z.literal(true),
        result: z.object({
          message_id: z.number().int(),
          message_thread_id: z.number().int(),
          chat: z.object({ id: z.number().int() }),
        }),
      })
      .parse(await response.json());
    if (
      !response.ok ||
      String(payload.result.chat.id) !== config.chatId ||
      payload.result.message_thread_id !== config.threadId
    )
      throw new Error("Telegram destination mismatch");
    return payload.result.message_id;
  } catch {
    // Do not expose Gateway credentials, the code, or Telegram's message echo in errors.
    throw new HttpError(503, "The confirmation code could not be delivered to Telegram.");
  }
};
