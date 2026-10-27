const hexColorPattern = /^#[0-9a-f]{6}$/iu;

export const colorInputValue = (value: string, fallback = "#36b878"): string => {
  if (hexColorPattern.test(value)) return value;
  if (typeof document === "undefined") return fallback;

  const variable = /^var\((--[a-zA-Z0-9_-]+)\)$/u.exec(value)?.[1];
  const resolved = variable
    ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    : value;
  if (hexColorPattern.test(resolved)) return resolved;

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu.exec(resolved);
  if (!rgb) return fallback;
  return `#${rgb
    .slice(1, 4)
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
};
