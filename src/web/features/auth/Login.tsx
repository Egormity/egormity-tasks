import { type FormEvent, useState } from "react";

import { request } from "@/shared/http/api";
import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";

export const Login = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const { copy, errorText } = usePreferences();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      onLogin(
        await request<User>("/login", {
          email: data.get("email"),
          password: data.get("password"),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="bg-canvas flex min-h-dvh items-center justify-center p-6">
      <section className="border-line bg-panel w-full max-w-md rounded-2xl border p-8 shadow-xl">
        <p className="text-accent mb-10 text-sm font-semibold tracking-widest">
          {copy.brand} / {copy.title}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.loginTitle}</h1>
        <p className="text-muted mt-3 text-sm leading-6">{copy.loginDescription}</p>
        <form className="mt-8 grid gap-5" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm">
            {copy.email}
            <input
              className="border-line bg-canvas outline-accent rounded-lg border p-3"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={pending}
            />
          </label>
          <label className="grid gap-2 text-sm">
            {copy.password}
            <input
              className="border-line bg-canvas outline-accent rounded-lg border p-3"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </label>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {errorText(error)}
            </p>
          )}
          <button
            className="bg-accent text-on-accent rounded-lg p-3 font-medium disabled:opacity-50"
            disabled={pending}
          >
            {pending ? copy.signingIn : copy.signIn}
          </button>
        </form>
      </section>
    </main>
  );
};
