// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TaskDescriptionEditor } from "./task-description-editor";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("wraps the selected description text as bold markdown", () => {
  document.documentElement.lang = "en";
  const onChange = vi.fn();
  render(<TaskDescriptionEditor initialValue="hello world" onChange={onChange} />);

  const input = screen.getByLabelText<HTMLTextAreaElement>("Task description");
  input.setSelectionRange(0, 5);
  fireEvent.click(screen.getByRole("button", { name: "Bold" }));

  expect(onChange).toHaveBeenLastCalledWith("**hello** world");
  expect(input.value).toBe("**hello** world");
});
