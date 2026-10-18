import { useEffect, useRef, useState } from "react";
import {
  confirmationPath,
  type ConfirmationAction,
  type ConfirmationChallenge,
  type ConfirmationPreparation,
} from "@contracts/confirmation.js";
import { ApiError, request } from "@/shared/http/api";

export class ConfirmationCancelled extends Error {}
type Pending = {
  action: ConfirmationAction;
  challenge: ConfirmationChallenge;
  resolve: () => void;
  reject: (error: Error) => void;
};

export const useConfirmation = () => {
  const [challenge, setChallenge] = useState<ConfirmationChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Pending | null>(null);
  const executing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = pending.current;
      if (current) {
        void request(`/confirmations/${current.challenge.id}/cancel`, {}).catch(() => {});
        current.reject(new ConfirmationCancelled());
      }
      pending.current = null;
    };
  }, []);

  const run = async (action: ConfirmationAction) => {
    if (executing.current || pending.current)
      throw new Error("A confirmation is already pending.");
    executing.current = true;
    try {
      let value = await request<ConfirmationPreparation>("/confirmations", action);
      if ("confirmed" in value) {
        if (!mounted.current) throw new ConfirmationCancelled();
        try {
          await request(confirmationPath(action), action.input);
          return;
        } catch (cause) {
          // Only this explicit pre-relay rejection is safe to follow with a new code.
          // A network/upstream failure never automatically replays an action.
          if (
            !(cause instanceof ApiError) ||
            cause.status !== 403 ||
            cause.message !== "Confirm this action with a Telegram code."
          )
            throw cause;
          value = await request<ConfirmationPreparation>("/confirmations", action);
          if ("confirmed" in value) throw cause;
        }
      }
      if (!mounted.current) {
        void request(`/confirmations/${value.id}/cancel`, {}).catch(() => {});
        throw new ConfirmationCancelled();
      }
      setError("");
      setChallenge(value);
      return await new Promise<void>((resolve, reject) => {
        pending.current = { action, challenge: value, resolve, reject };
        executing.current = false;
      });
    } finally {
      executing.current = false;
    }
  };
  const perform = async (operation: (current: Pending) => Promise<void>) => {
    const current = pending.current;
    if (!current || executing.current) return;
    executing.current = true;
    setBusy(true);
    setError("");
    try {
      await operation(current);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      executing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return {
    challenge,
    busy,
    error,
    run,
    confirm: (code: string) =>
      perform(async (current) => {
        await request(confirmationPath(current.action), {
          ...current.action.input,
          confirmation: { id: current.challenge.id, code },
        });
        pending.current = null;
        setChallenge(null);
        current.resolve();
      }),
    resend: () =>
      perform(async (current) => {
        const next = await request<ConfirmationPreparation>("/confirmations", current.action);
        if ("confirmed" in next) {
          if (!mounted.current || pending.current !== current) return;
          await request(confirmationPath(current.action), current.action.input);
          pending.current = null;
          setChallenge(null);
          current.resolve();
          return;
        }
        if (!mounted.current || pending.current !== current) {
          void request(`/confirmations/${next.id}/cancel`, {}).catch(() => {});
          return;
        }
        current.challenge = next;
        setChallenge(next);
      }),
    cancel: () => {
      const current = pending.current;
      if (!current || executing.current) return;
      pending.current = null;
      setChallenge(null);
      void request(`/confirmations/${current.challenge.id}/cancel`, {}).catch(() => {});
      current.reject(new ConfirmationCancelled());
    },
  };
};
