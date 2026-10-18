import type { Thread } from "@contracts/agent.js";

/** A partial read includes the last known turn again, followed by any newer turns. */
export const mergeThreadHistory = (previous: Thread | null, incoming: Thread | null) => {
  if (!previous || !incoming || previous.id !== incoming.id || !incoming.turns[0]) return null;
  const anchor = previous.turns.findIndex((turn) => turn.id === incoming.turns[0]!.id);
  if (anchor < 0) return null;
  return { ...incoming, turns: [...previous.turns.slice(0, anchor), ...incoming.turns] };
};
