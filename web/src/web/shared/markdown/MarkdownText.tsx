import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import "./markdown-text.css";

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

type MarkdownTextProps = {
  readonly className?: string | undefined;
  readonly text: string;
};

export const MarkdownText = ({ className, text }: MarkdownTextProps) => (
  <div className={className ? `markdown-text ${className}` : "markdown-text"}>
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml components={components}>
      {text}
    </Markdown>
  </div>
);
