import type { Task } from "@contracts/board.js";
import type { Copy } from "@/shared/i18n/copy";
import { taskDiscussionHref } from "@/app/navigation";

export const taskUrl = (taskId: string) =>
  new URL(taskDiscussionHref(taskId), `${window.location.origin}${window.location.pathname}`)
    .href;

export const taskContextText = (task: Task, copy: Copy) =>
  [`${copy.linkedTask}: ${task.title}`, `ID: ${task.id}`, `URL: ${taskUrl(task.id)}`].join(
    "\n",
  );
