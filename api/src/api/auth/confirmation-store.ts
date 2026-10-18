import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { ConfirmationAction, ConfirmationChallenge } from "../contracts/confirmation.js";
import { HttpError } from "./auth.js";
import {
  sendTelegramConfirmation,
  telegramTopicUrl,
  type TelegramConfiguration,
} from "./telegram.js";

export const confirmationPolicy = {
  lifetime: 5 * 60_000,
  cooldown: 30_000,
  attempts: 5,
  verificationWindow: 15 * 60_000,
  userWindow: 60 * 60_000,
  userLimit: 120,
  globalWindow: 60_000,
  globalLimit: 10,
} as const;
export type ConfirmationOwner = {
  session: string;
  id: string;
  name: string;
  email: string | null;
};
type Challenge = {
  owner: string;
  account: string;
  digest: string;
  code: Buffer;
  expiresAt: number;
  attempts: number;
  delivered: boolean;
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const ownerKey = (owner: ConfirmationOwner) => digest(`${owner.id}:${owner.session}`);

/** Only expiring hashes are held in memory. No pending messages or chat history are stored. */
export class Confirmations {
  private secret = randomBytes(32);
  private challenges = new Map<string, Challenge>();
  private cooldowns = new Map<string, number>();
  private rates = new Map<string, { count: number; reset: number }>();
  constructor(private readonly telegram?: TelegramConfiguration) {}
  private codeHash = (id: string, code: string) =>
    createHmac("sha256", this.secret).update(`${id}:${code}`).digest();
  private prune = () => {
    const now = Date.now();
    for (const [id, value] of this.challenges)
      if (value.expiresAt <= now) this.challenges.delete(id);
    for (const [id, value] of this.cooldowns) if (value <= now) this.cooldowns.delete(id);
    for (const [id, value] of this.rates) if (value.reset <= now) this.rates.delete(id);
  };
  private rate = (key: string, limit: number, window: number) => {
    const value = this.rates.get(key) ?? { count: 0, reset: Date.now() + window };
    if (value.count >= limit)
      throw new HttpError(429, "Too many confirmation requests. Try again later.");
    value.count += 1;
    this.rates.set(key, value);
  };
  private checkVerificationLimit = (account: string) => {
    if ((this.rates.get(`verify:${account}`)?.count ?? 0) >= confirmationPolicy.attempts)
      throw new HttpError(
        429,
        "Too many incorrect confirmation attempts. Try again in 15 minutes.",
      );
  };
  create = async (
    owner: ConfirmationOwner,
    action: ConfirmationAction,
  ): Promise<ConfirmationChallenge> => {
    if (!this.telegram)
      throw new HttpError(
        503,
        "Telegram confirmation is not configured. Agent actions are blocked.",
      );
    this.prune();
    this.checkVerificationLimit(owner.id);
    if (this.cooldowns.has(owner.id))
      throw new HttpError(429, "Wait 30 seconds before requesting another code.");
    this.rate("global", confirmationPolicy.globalLimit, confirmationPolicy.globalWindow);
    this.rate(owner.id, confirmationPolicy.userLimit, confirmationPolicy.userWindow);
    const now = Date.now();
    const id = randomUUID();
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    const actionDigest = digest(canonical(action));
    const expiresAt = now + confirmationPolicy.lifetime;
    const resendAt = now + confirmationPolicy.cooldown;
    this.cooldowns.set(owner.id, resendAt);
    for (const [oldId, old] of this.challenges)
      if (old.account === owner.id) this.challenges.delete(oldId);
    const challenge: Challenge = {
      owner: ownerKey(owner),
      account: owner.id,
      digest: actionDigest,
      code: this.codeHash(id, code),
      expiresAt,
      attempts: 0,
      delivered: false,
    };
    this.challenges.set(id, challenge);
    const description =
      action.kind === "message"
        ? `Сообщение агенту\nЧат: ${action.chatId}\nВложений: ${action.input.attachments.length}\nТекст: ${action.input.text.slice(0, 700)}`
        : action.kind === "command"
          ? `Команда Codex\nЧат: ${action.chatId}\n${canonical(action.input)}`
          : action.kind === "response"
            ? `Ответ запросу Codex ${action.input.id}\n${canonical(action.input.result).slice(0, 700)}`
            : "Подключение аккаунта Codex";
    try {
      await sendTelegramConfirmation(
        this.telegram,
        `Amazi Agent — подтверждение\nЗапрос: ${id.slice(0, 8)}\nПользователь: ${(owner.email ?? owner.name).slice(0, 200)}\n${description}\n\nКод: ${code}\nВведите в течение 5 минут, если запрос отправили вы. ${action.kind === "login" ? "Только для подключения аккаунта Codex." : "Подтверждает эту сессию на время работы задач и ещё 5 минут после завершения."}`,
      );
      challenge.delivered = true;
      return { id, expiresAt, resendAt, telegramUrl: telegramTopicUrl(this.telegram) };
    } catch (error) {
      this.challenges.delete(id);
      throw error;
    }
  };
  consume = (
    owner: ConfirmationOwner,
    action: ConfirmationAction,
    proof: { id: string; code: string },
  ) => {
    this.prune();
    this.checkVerificationLimit(owner.id);
    const challenge = this.challenges.get(proof.id);
    if (
      !challenge ||
      !challenge.delivered ||
      challenge.owner !== ownerKey(owner) ||
      challenge.digest !== digest(canonical(action))
    )
      throw new HttpError(
        403,
        "The confirmation expired or does not match this request. Request a new code.",
      );
    challenge.attempts += 1;
    const matches = timingSafeEqual(challenge.code, this.codeHash(proof.id, proof.code));
    if (challenge.attempts >= confirmationPolicy.attempts || matches)
      this.challenges.delete(proof.id);
    if (!matches) {
      const key = `verify:${owner.id}`;
      const failures = this.rates.get(key) ?? {
        count: 0,
        reset: Date.now() + confirmationPolicy.verificationWindow,
      };
      failures.count += 1;
      if (failures.count >= confirmationPolicy.attempts)
        failures.reset = Date.now() + confirmationPolicy.verificationWindow;
      this.rates.set(key, failures);
      this.checkVerificationLimit(owner.id);
      throw new HttpError(
        403,
        challenge.attempts >= confirmationPolicy.attempts
          ? "Too many incorrect codes. Request a new code."
          : "Incorrect confirmation code.",
      );
    }
    // Consume synchronously before any upstream I/O, including concurrent duplicate requests.
    this.cooldowns.delete(owner.id);
    this.rates.delete(`verify:${owner.id}`);
  };
  cancel = (owner: ConfirmationOwner, id: string) => {
    if (this.challenges.get(id)?.owner === ownerKey(owner)) this.challenges.delete(id);
  };
}
