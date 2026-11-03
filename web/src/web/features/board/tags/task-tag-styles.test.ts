import { describe, expect, it } from "vitest";
import { customTaskTagToneStyle } from "./task-tag-styles";

describe("custom task tag colors", () => {
  it("uses muted, theme-aware colors instead of a solid chip", () => {
    expect(customTaskTagToneStyle("#ff6600")).toEqual({
      backgroundColor: "color-mix(in srgb, #ff6600 16%, var(--color-board-surface))",
      borderColor: "color-mix(in srgb, #ff6600 32%, var(--color-board-surface))",
      color: "color-mix(in srgb, #ff6600 20%, var(--color-board-text))",
    });
  });
  it("leaves presets unchanged", () => {
    expect(customTaskTagToneStyle("green")).toBeUndefined();
  });
});
