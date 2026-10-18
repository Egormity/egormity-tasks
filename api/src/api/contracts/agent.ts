import { z } from "zod";
import type { Thread } from "./codex/v2/Thread.js";
import type { Task } from "./board.js";
import type { ChatScope, TaskChatLink } from "./task-agent.js";
import { modelSettingsSchema } from "./commands.js";
import { taskSelectionSchema } from "./task-context.js";
export type { Thread, ThreadItem, Turn, UserInput } from "./codex-types.js";

export const messageInputSchema = z
  .object({
    requestId: z.uuid(),
    text: z.string().trim().max(32_000),
    attachments: z.array(z.uuid()).max(10).default([]),
    settings: modelSettingsSchema.optional(),
    taskId: taskSelectionSchema.shape.taskId,
  })
  .refine((input) => input.text.length > 0 || input.attachments.length > 0);
export type MessageInput = z.infer<typeof messageInputSchema>;
export const renameInputSchema = z.object({ name: z.string().trim().min(1).max(120) });
export type RpcMessage = {
  id?: string | number;
  sequence?: number;
  method: string;
  params: Record<string, unknown>;
};
export type AgentStatus = {
  authenticated: boolean;
  busy: boolean;
  activeChatId: string | null;
  loginOutput: string;
  loginRunning: boolean;
  externalTurns: ExternalTurn[];
  canStop: boolean;
};
export type ExternalTurn = { threadId: string; turnId: string };
export type Snapshot = {
  linkedTask?: Task | null;
  taskChats?: TaskChatLink[];
  chatScope?: ChatScope;
  chats: Thread[];
  detail: Thread | null;
  cursor: number;
  partial?: boolean;
  status: AgentStatus;
  requests: RpcMessage[];
};
export type Attachment = { id: string; name: string; size: number; mime: string; path: string };
export type SshAccess = {
  id: "main" | "gateway";
  host: string;
  user: string;
  port: number;
  directory: string;
  authentication: "key" | "password" | "agent";
  command: string;
};
export type AgentContext = {
  repository: string;
  cwd: string;
  branch: string | null;
  threadId: string | null;
  codexHome: string;
  model: string | null;
  sandbox: string;
  instructions: { path: string; text: string }[];
  sshTargets: SshAccess[];
};
