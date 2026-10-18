import { vi } from "vitest";

if (typeof document !== "undefined") {
  document.documentElement.lang = "ru";
  globalThis.ResizeObserver = class implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}
