import { z } from "zod";
import type { Model } from "./codex/v2/Model.js";
import type { ReasoningEffort } from "./codex/ReasoningEffort.js";

export const modelSettingsSchema = z.object({
  model: z.string().min(1).max(200),
  effort: z.string().min(1).max(100),
  serviceTier: z.string().max(100).nullable(),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export const commandInputSchema = z.discriminatedUnion("command", [
  modelSettingsSchema.extend({ command: z.literal("settings") }),
  z.object({ command: z.literal("compact") }),
]);
export type AgentCommand = z.infer<typeof commandInputSchema>;
export type ChatControls = {
  models: Model[];
  model: string;
  effort: ReasoningEffort | null;
  serviceTier: string | null;
};
export type BackgroundTerminal = {
  processId: string;
  command: string;
  cwd: string;
};
export const stopInputSchema = z.object({
  target: z.enum(["turn", "terminals"]),
  processId: z.string().min(1).max(200).optional(),
});
