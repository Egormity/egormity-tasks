export const classNames = (...values: Array<false | null | string | undefined>) =>
  values.filter(Boolean).join(" ");
