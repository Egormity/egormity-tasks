import { describe, expect, it } from "vitest";

import { customTaskTagInk, customTaskTagToneStyle } from "./task-tag-styles";

const luminanceOf = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastAgainst = (background: string, ink: string) => {
  const first = luminanceOf(background);
  const second = luminanceOf(ink);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

describe("custom task tag colors", () => {
  it("renders a picked color at full strength as the chip background", () => {
    expect(customTaskTagToneStyle("#ff6600")).toMatchObject({
      backgroundColor: "#ff6600",
      borderColor: "#ff6600",
    });
  });

  it("uses dark ink on light colors and white ink on dark colors", () => {
    expect(customTaskTagInk("#ffe066")).toBe("#000000");
    expect(customTaskTagInk("#1e3a8a")).toBe("#ffffff");
  });

  it("keeps text readable across a range of picked colors", () => {
    for (const hex of ["#ffe066", "#ff6600", "#2b9d5a", "#3878d9", "#1e3a8a", "#808080"]) {
      expect(contrastAgainst(hex, customTaskTagInk(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ignores preset tone names", () => {
    expect(customTaskTagToneStyle("green")).toBeUndefined();
  });
});
