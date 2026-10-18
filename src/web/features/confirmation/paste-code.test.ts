import { expect, it } from "vitest";
import { insertPastedCode, pastedConfirmationCode } from "./paste-code";

it("keeps leading zeros and ignores numbers outside the bot's final code line", () => {
  expect(pastedConfirmationCode("\u200e012\u00a0345\u200e")).toBe("012345");
  expect(
    pastedConfirmationCode("Текст:\nКод: 654321\n\nКод: 012345\nВведите за 5 минут."),
  ).toBe("012345");
});

it.each(["1234567", "code 1234567", "Запрос: 123456", "", "12x3456"])(
  "does not guess a confirmation code from invalid clipboard text (%s)",
  (text) => {
    expect(pastedConfirmationCode(text)).toBeNull();
    expect(insertPastedCode(text, "000000", 0, 6)).toBe("000000");
  },
);

it("allows partial paste at the cursor or over a selection without truncating digits", () => {
  expect(insertPastedCode("456", "123", 3, 3)).toBe("123456");
  expect(insertPastedCode("45", "123006", 3, 5)).toBe("123456");
  expect(insertPastedCode("456", "1230", 4, 4)).toBe("1230");
});
