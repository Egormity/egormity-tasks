export const formatBoardTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(document.documentElement.lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};
