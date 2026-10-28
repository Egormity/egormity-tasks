import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import "./comment-markdown.css";

const components: Components = {
  a: ({ children, href, title }) => (
    <a href={href} rel="noreferrer noopener" target="_blank" title={title}>
      {children}
    </a>
  ),
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input
        aria-hidden="true"
        checked={checked}
        disabled
        readOnly
        tabIndex={-1}
        type="checkbox"
      />
    ) : null,
  img: ({ alt, src, title }) => <img alt={alt ?? ""} loading="lazy" src={src} title={title} />,
};

export const CommentMarkdown = ({ text }: { text: string }) => (
  <div className="comment-markdown text-xs">
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml components={components}>
      {text}
    </Markdown>
  </div>
);
