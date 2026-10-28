import type { Task, TaskEvent, TaskTag } from "../contracts/board.js";
import type { TaskComment } from "../contracts/task-comments.js";
import type { QueryExecutor } from "../database/database.js";

export class BoardRepository {
  constructor(private readonly executor: QueryExecutor) {}

  setting = async <Value>(key: string, fallback: Value): Promise<Value> => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM board_settings WHERE key = $1",
      [key],
    );
    return rows[0] ? (JSON.parse(rows[0].data) as Value) : fallback;
  };

  saveSetting = async (key: string, value: unknown) => {
    await this.executor.query(
      `INSERT INTO board_settings (key, data) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
      [key, JSON.stringify(value)],
    );
  };

  cards = async () => {
    const rows = await this.executor.query<{ data: string }>("SELECT data FROM task_cards");
    return rows.map(({ data }) => JSON.parse(data) as Task);
  };

  tags = async () => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM task_tags ORDER BY name",
    );
    return rows.map(({ data }) => JSON.parse(data) as TaskTag);
  };

  card = async (id: string) => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM task_cards WHERE id = $1",
      [id],
    );
    return rows[0] ? (JSON.parse(rows[0].data) as Task) : null;
  };

  saveCard = async (card: Task) => {
    await this.executor.query(
      `INSERT INTO task_cards (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [card.id, JSON.stringify(card)],
    );
  };

  event = async (event: TaskEvent) => {
    await this.executor.query(
      "INSERT INTO task_events (id, card_id, data) VALUES ($1, $2, $3)",
      [event.id, event.cardId, JSON.stringify(event)],
    );
  };

  events = async (cardId: string) => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM task_events WHERE card_id = $1 ORDER BY sequence",
      [cardId],
    );
    return rows.map(({ data }) => JSON.parse(data) as TaskEvent);
  };

  saveTag = async (tag: TaskTag) => {
    await this.executor.query(
      `INSERT INTO task_tags (id, name, data) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data`,
      [tag.id, tag.name, JSON.stringify(tag)],
    );
  };

  deleteTag = async (id: string) => {
    await this.executor.query("DELETE FROM task_tags WHERE id = $1", [id]);
  };

  fileBytes = async (sha256: string) => {
    const rows = await this.executor.query<{ encoded: string }>(
      "SELECT encode(bytes, 'hex') AS encoded FROM task_files WHERE sha256 = $1",
      [sha256],
    );
    return rows[0] ? Buffer.from(rows[0].encoded, "hex") : undefined;
  };

  insertFile = async (sha256: string, bytes: Buffer) => {
    await this.executor.query(
      "INSERT INTO task_files (sha256, bytes) VALUES ($1, decode($2, 'hex')) ON CONFLICT (sha256) DO NOTHING",
      [sha256, bytes.toString("hex")],
    );
  };

  comment = async (id: string) => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM task_comments WHERE id = $1",
      [id],
    );
    return rows[0] ? (JSON.parse(rows[0].data) as TaskComment) : null;
  };

  comments = async (cardId: string) => {
    const rows = await this.executor.query<{ data: string }>(
      "SELECT data FROM task_comments WHERE card_id = $1 ORDER BY sequence",
      [cardId],
    );
    return rows.map(({ data }) => JSON.parse(data) as TaskComment);
  };

  insertComment = async (comment: TaskComment) => {
    await this.executor.query(
      "INSERT INTO task_comments (id, card_id, data) VALUES ($1, $2, $3)",
      [comment.id, comment.cardId, JSON.stringify(comment)],
    );
  };
}
