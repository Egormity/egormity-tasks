import type { TaskAttachment } from "../../contracts/board.js";
import type { TaskComment } from "../../contracts/task-comments.js";
import { PostgresDatabase } from "../../database/database.js";
import { HttpError } from "../../http-error.js";
import { BoardRepository } from "../board-repository.js";
import type { BoardStore } from "../board-store.js";

export class CommentStore {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly board: BoardStore,
  ) {}

  list = async (cardId: string): Promise<TaskComment[]> => {
    await this.board.get(cardId);
    return this.board.listComments(cardId);
  };

  add = (
    input: Omit<TaskComment, "createdAt" | "attachments">,
    files: { attachment: TaskAttachment; bytes: Buffer }[],
  ) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const card = await this.board.get(input.cardId, executor);
      const attachments = files.map((file) => file.attachment);
      const previous = await repository.comment(input.id);
      if (previous) {
        if (
          previous.cardId !== input.cardId ||
          previous.author.id !== input.author.id ||
          previous.text !== input.text ||
          JSON.stringify(previous.attachments) !== JSON.stringify(attachments)
        )
          throw new HttpError(409, "This comment request was already used.");
        return previous;
      }
      const comment: TaskComment = {
        ...input,
        attachments,
        createdAt: new Date().toISOString(),
      };
      for (const file of files)
        await repository.insertFile(file.attachment.sha256!, file.bytes);
      await repository.insertComment(comment);
      await this.board.save(
        { ...card, revision: card.revision + 1, updatedAt: comment.createdAt },
        executor,
      );
      await this.board.event(
        card.id,
        "comment_added",
        { actor: comment.author.name, commentId: comment.id },
        executor,
      );
      return comment;
    });
}
