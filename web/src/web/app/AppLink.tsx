import type { ComponentProps } from "react";
import { navigate } from "./navigation";

/** Internal links use browser history; modified clicks retain native new-tab behavior. */
export const AppLink = ({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string }) => (
  <a
    {...props}
    href={href}
    onClick={(event) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (props.target && props.target !== "_self") ||
        event.currentTarget.hasAttribute("download")
      )
        return;
      const url = new URL(href, location.href);
      if (
        url.origin !== location.origin ||
        !["/tasks", "/archive", "/users"].includes(url.pathname) ||
        url.hash
      )
        return;
      event.preventDefault();
      navigate(url.pathname + url.search);
    }}
  />
);
