// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { TaskComment } from "@contracts/task-comments.js";
import { CommentItem } from "./comment-item";

afterEach(cleanup);

it("shows author initials, a timestamp and formatted comment text", () => {
  document.documentElement.lang = "en";
  const comment: TaskComment = {
    id: "comment",
    cardId: "task",
    text: "**Important** note with `code`.",
    createdAt: "2026-10-28T19:39:00.000Z",
    author: { id: "admin", name: "Egor Amazi" },
    attachments: [],
  };

  const { container } = render(<CommentItem cardId="task" comment={comment} />);

  expect(screen.getByText("EA")).toBeTruthy();
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(comment.createdAt);
  expect(screen.getByText("Important").tagName).toBe("STRONG");
  expect(screen.getByText("code").tagName).toBe("CODE");
});
