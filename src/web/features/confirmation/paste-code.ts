const stripFormatting = (text: string) =>
  text.replace(/[\s\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff-]/gu, "");

/** Prefer the bot's final code line over request IDs, dates or digits in its preview. */
export const pastedConfirmationCode = (text: string) => {
  const lines = [...text.matchAll(/(?:^|\n)[^\S\n]*(?:код|code):[^\S\n]*([^\r\n]+)/giu)];
  const value = stripFormatting(lines.at(-1)?.[1] ?? text);
  return /^\d{6}$/u.test(value) ? value : null;
};

export const insertPastedCode = (text: string, current: string, start: number, end: number) => {
  const complete = pastedConfirmationCode(text);
  if (complete) return complete;
  const part = stripFormatting(text);
  if (!/^\d{1,5}$/u.test(part)) return current;
  const next = current.slice(0, start) + part + current.slice(end);
  return next.length <= 6 ? next : current;
};
