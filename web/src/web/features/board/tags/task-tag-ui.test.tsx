// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TaskTagColorPicker } from "./task-tag-ui";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("allows a tag to use a custom picked color", () => {
  document.documentElement.lang = "en";
  const onChange = vi.fn();
  render(<TaskTagColorPicker compact label="Tag color" onChange={onChange} value="green" />);
  const picker = screen.getByLabelText<HTMLInputElement>("Tag color");
  expect(picker.type).toBe("color");
  fireEvent.change(picker, { target: { value: "#aabbcc" } });
  expect(onChange).toHaveBeenCalledWith("#aabbcc");
});
