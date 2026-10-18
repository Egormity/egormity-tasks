import type { BoardStore } from "../board-store.js";
import type { TaskAttachment } from "../../contracts/board.js";
import type { TaskComment } from "../../contracts/task-comments.js";
import { HttpError } from "../../auth/auth.js";

export class CommentStore {
  constructor(private readonly board: BoardStore) {
    board.db.exec(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY, cardId TEXT NOT NULL REFERENCES task_cards(id), data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_comments_card ON task_comments(cardId);
    `);
  }

  list = (cardId: string): TaskComment[] => {
    this.board.get(cardId);
    return this.board.db
      .prepare("SELECT data FROM task_comments WHERE cardId = ? ORDER BY rowid")
      .all(cardId)
      .map((row) => JSON.parse(String(row.data)) as TaskComment);
  };

  add = (
    input: Omit<TaskComment, "createdAt" | "attachments">,
    files: { attachment: TaskAttachment; bytes: Buffer }[],
  ) =>
    this.board.transaction(() => {
      const card = this.board.get(input.cardId);
      const attachments = files.map((file) => file.attachment);
      const previous = this.board.db
        .prepare("SELECT data FROM task_comments WHERE id = ?")
        .get(input.id);
      if (previous) {
        const comment = JSON.parse(String(previous.data)) as TaskComment;
        if (
          comment.cardId !== input.cardId ||
          comment.author.id !== input.author.id ||
          comment.text !== input.text ||
          JSON.stringify(comment.attachments) !== JSON.stringify(attachments)
        )
          throw new HttpError(409, "This comment request was already used.");
        return comment;
      }
      const comment: TaskComment = {
        ...input,
        attachments,
        createdAt: new Date().toISOString(),
      };
      for (const file of files)
        this.board.db
          .prepare("INSERT OR IGNORE INTO task_files VALUES (?, ?)")
          .run(file.attachment.sha256!, file.bytes);
      this.board.db
        .prepare("INSERT INTO task_comments VALUES (?, ?, ?)")
        .run(comment.id, comment.cardId, JSON.stringify(comment));
      this.board.save({ ...card, revision: card.revision + 1, updatedAt: comment.createdAt });
      this.board.event(card.id, "comment_added", {
        actor: comment.author.name,
        commentId: comment.id,
      });
      return comment;
    });
}
