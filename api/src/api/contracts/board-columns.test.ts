import { expect, it } from "vitest";

import { boardColumns } from "./board-columns.js";
import { taskInputSchema, taskStatuses } from "./board.js";

it("derives task status validation from the shared board column array", () => {
  expect(taskStatuses).toEqual(boardColumns.map(({ id }) => id));
  for (const { id } of boardColumns) {
    expect(
      taskInputSchema.shape.status.safeParse(id),
      `column ${id} should be accepted as a task status`,
    ).toHaveProperty("success", true);
  }
  expect(taskInputSchema.shape.status.safeParse("not-a-board-column").success).toBe(false);
});
