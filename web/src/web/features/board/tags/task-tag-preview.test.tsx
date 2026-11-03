// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { TaskTagPreview } from "./task-tag-preview";

afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("shows the typed name with the picked color", () => {
  document.documentElement.lang = "en";
  render(<TaskTagPreview name="  Urgent " tone="#ff6600" />);
  const chip = screen.getByText("Urgent");
  expect(chip.style.backgroundColor).toBe("rgb(255, 102, 0)");
});

it("falls back to a placeholder name when the input is empty", () => {
  document.documentElement.lang = "en";
  render(<TaskTagPreview name="   " tone="green" />);
  expect(screen.getByText("Tag name")).toBeTruthy();
});
