import { boardEnglish } from "./board-copy.catalog";

export const translateBoardText = (
  locale: string,
  text: string,
  values: readonly (string | number | undefined)[] = [],
) =>
  (locale.startsWith("en") ? (boardEnglish[text] ?? text) : text).replace(
    /\{(\d+)\}/gu,
    (_, index: string) => String(values[Number(index)] ?? ""),
  );

// The app shell rerenders this copied component tree whenever its preference context changes.
export const boardText = (text: string, ...values: readonly (string | number | undefined)[]) =>
  translateBoardText(
    typeof document === "undefined" ? "ru" : document.documentElement.lang,
    text,
    values,
  );
