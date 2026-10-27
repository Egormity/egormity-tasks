import { expect, it } from "vitest";

import { boardColumns } from "./board-columns.js";
import { taskInputSchema, taskStatuses } from "./board.js";

it("validates status strings while the board store validates saved column IDs", () => {
  expect(taskStatuses).toEqual(boardColumns.map(({ id }) => id));
  for (const { id } of boardColumns) {
    expect(
      taskInputSchema.shape.status.safeParse(id),
      `column ${id} should be accepted as a task status`,
    ).toHaveProperty("success", true);
  }
  expect(taskInputSchema.shape.status.safeParse("new-user-column").success).toBe(true);
  expect(taskInputSchema.shape.status.safeParse("").success).toBe(false);
});
