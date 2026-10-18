import { useLayoutEffect, useRef } from "react";

export const useAutosizeTextarea = (value: string) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [value]);
  return ref;
};
