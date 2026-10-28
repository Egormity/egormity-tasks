// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CommentMarkdown } from "./comment-markdown";

afterEach(cleanup);

it("renders GFM markdown as formatted content", () => {
  const { container } = render(
    <CommentMarkdown
      text={[
        "**Bold** and *italic* with `inline` code.",
        "",
        "1. First",
        "2. Second",
        "",
        "- [x] Done",
        "- [ ] Open",
        "",
        "> Quoted",
        "",
        "[Docs](https://example.com)",
      ].join("\n")}
    />,
  );

  expect(screen.getByText("Bold").tagName).toBe("STRONG");
  expect(screen.getByText("italic").tagName).toBe("EM");
  expect(screen.getByText("inline").tagName).toBe("CODE");
  expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  expect(container.querySelectorAll("blockquote")).toHaveLength(1);
  expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
    "https://example.com",
  );
  expect(screen.getByRole("link", { name: "Docs" }).getAttribute("target")).toBe("_blank");
});

it("keeps raw HTML and unsafe links inert", () => {
  const { container } = render(
    <CommentMarkdown
      text={
        "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))"
      }
    />,
  );

  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href") ?? "").toBe("");
});
