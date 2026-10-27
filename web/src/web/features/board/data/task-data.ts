import { boardColumns } from "@contracts/board-columns.js";

export { boardColumns };
export type TaskStatus = import("@contracts/board.js").Task["status"];

export type TaskTagTone = "violet" | "green" | "amber" | "blue" | "rose";

export type TaskPriority = "low" | "medium" | "high";

export type TaskAttachment = {
  readonly id: string;
  readonly name: string;
  readonly objectId?: string | undefined;
  readonly size: number;
  readonly type?: string | undefined;
};

export type TaskTag = {
  readonly id: string;
  readonly name: string;
  readonly tone: TaskTagTone;
};

export type Task = {
  readonly revision?: number | undefined;
  readonly archivedAt: string | null;
  readonly assignee?: string | undefined;
  readonly attachments: readonly TaskAttachment[];
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly order: number;
  readonly priority: TaskPriority;
  readonly status: TaskStatus | "archived";
  readonly tag?: string | undefined;
  readonly tagTone?: TaskTagTone | undefined;
  readonly tags: readonly TaskTag[];
  readonly title: string;
  readonly updatedAt: string;
};

export type TrackerEventAttachmentChange = {
  readonly from: TaskAttachment;
  readonly to: TaskAttachment;
};

export type TrackerEventChange =
  | {
      readonly field: "status";
      readonly from: string;
      readonly fromLabel?: string | undefined;
      readonly to: string;
      readonly toLabel?: string | undefined;
    }
  | {
      readonly field: "title" | "description" | "priority" | "order";
      readonly from: number | string | null;
      readonly to: number | string | null;
    }
  | {
      readonly added?: readonly TaskAttachment[] | undefined;
      readonly changed?: readonly TrackerEventAttachmentChange[] | undefined;
      readonly field: "attachments";
      readonly removed?: readonly TaskAttachment[] | undefined;
    }
  | {
      readonly added?: readonly string[] | undefined;
      readonly field: "tags";
      readonly removed?: readonly string[] | undefined;
    };

export type TrackerEventPayload = Record<string, unknown> & {
  readonly changes?: readonly TrackerEventChange[] | undefined;
  readonly diff?: { readonly changes?: readonly TrackerEventChange[] | undefined } | undefined;
  readonly fields?: readonly string[] | undefined;
};

export type TrackerEvent = {
  readonly createdAt: string;
  readonly id: string;
  readonly payload: TrackerEventPayload;
  readonly type: string;
};

export type BoardColumn = import("@contracts/board-columns.js").BoardColumn;
