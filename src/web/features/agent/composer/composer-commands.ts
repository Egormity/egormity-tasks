import type { Copy } from "@/shared/i18n/copy";
export type ComposerCommand = "model" | "fast" | "compact" | "ps" | "stop" | "new" | "status";
export const composerCommands = (copy: Copy): { id: ComposerCommand; label: string }[] => [
  { id: "model", label: copy.chooseModel },
  { id: "fast", label: copy.chooseSpeed },
  { id: "compact", label: copy.compactContext },
  { id: "ps", label: copy.backgroundTerminals },
  { id: "stop", label: copy.stop },
  { id: "new", label: copy.newChat },
  { id: "status", label: copy.codexStatus },
];
