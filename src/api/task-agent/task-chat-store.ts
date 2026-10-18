import type { DatabaseSync } from "node:sqlite";
import type { Task } from "../contracts/board.js";
import type { TaskChatLink } from "../contracts/task-agent.js";
import { HttpError } from "../auth/auth.js";

/** Board relationships only. Messages and native thread metadata remain in Codex. */
export class TaskChatStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS task_chat_links (
      taskId TEXT PRIMARY KEY REFERENCES task_cards(id),
      chatId TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL
    );`);
  }

  list = (): TaskChatLink[] =>
    this.db
      .prepare(
        `
    SELECT c.chatId, c.taskId, c.createdAt, t.data FROM task_chat_links c
    JOIN task_cards t ON t.id = c.taskId ORDER BY c.rowid DESC
  `,
      )
      .all()
      .map((row) => ({
        chatId: String(row.chatId),
        taskId: String(row.taskId),
        createdAt: String(row.createdAt),
        taskTitle: (JSON.parse(String(row.data)) as Task).title,
      }));

  link = (taskId: string, chatId: string) => {
    const previous = this.list().find((link) => link.chatId === chatId);
    if (previous && previous.taskId !== taskId)
      throw new HttpError(409, "This conversation is already linked to another task.");
    if (previous) return previous;
    this.db
      .prepare(
        `INSERT INTO task_chat_links VALUES (?, ?, ?)
        ON CONFLICT(taskId) DO UPDATE SET chatId = excluded.chatId, createdAt = excluded.createdAt`,
      )
      .run(taskId, chatId, new Date().toISOString());
    return this.list().find((link) => link.chatId === chatId)!;
  };
}
