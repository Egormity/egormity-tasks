import { expect, it } from "vitest";
import { applyMarkdownFormat } from "./markdown-format";

it("wraps a selected word with bold markers and keeps it selected", () => {
  expect(applyMarkdownFormat("hello world", 0, 5, "bold")).toEqual({
    value: "**hello** world",
    selectionStart: 2,
    selectionEnd: 7,
  });
});

it("places the caret between empty italic markers", () => {
  expect(applyMarkdownFormat("abc", 3, 3, "italic")).toEqual({
    value: "abc**",
    selectionStart: 4,
    selectionEnd: 4,
  });
});

it("fences inline code that already contains a backtick", () => {
  expect(applyMarkdownFormat("a`b", 0, 3, "code")).toEqual({
    value: "```\na`b\n```",
    selectionStart: 4,
    selectionEnd: 7,
  });
});

it("inserts a link and selects its URL placeholder", () => {
  expect(applyMarkdownFormat("docs rule", 0, 4, "link")).toEqual({
    value: "[docs](url) rule",
    selectionStart: 7,
    selectionEnd: 10,
  });
});

it("puts the caret inside empty link brackets", () => {
  expect(applyMarkdownFormat("hi", 0, 0, "link")).toEqual({
    value: "[](url)hi",
    selectionStart: 1,
    selectionEnd: 1,
  });
});

it("prefixes every selected line as a bullet without repeating existing bullets", () => {
  expect(applyMarkdownFormat("one\ntwo", 0, 7, "list")).toEqual({
    value: "- one\n- two",
    selectionStart: 0,
    selectionEnd: 11,
  });
  expect(applyMarkdownFormat("- one\ntwo", 0, 9, "list")).toEqual({
    value: "- one\n- two",
    selectionStart: 0,
    selectionEnd: 11,
  });
});

it("starts a bullet on an empty line", () => {
  expect(applyMarkdownFormat("a\n\nb", 2, 2, "list")).toEqual({
    value: "a\n- \nb",
    selectionStart: 4,
    selectionEnd: 4,
  });
});
