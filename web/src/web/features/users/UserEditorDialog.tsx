import { type FormEvent, useState } from "react";

import { AppDialog } from "@/shared/ui/AppDialog";
import { Select } from "@/shared/ui/Select";
import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import type { UserInput } from "./users-api";

export const UserEditorDialog = ({
  user,
  pending,
  error,
  onClose,
  onSave,
}: {
  user: User | null;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: UserInput & { password: string }) => void;
}) => {
  const { copy } = usePreferences();
  const [username, setUsername] = useState(user?.username ?? "");
  const [role, setRole] = useState<User["role"]>(user?.role ?? "manager");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ username, role, password });
  };

  return (
    <AppDialog open onClose={onClose} title={user ? copy.editUser : copy.addUser} wide={false}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1 text-xs">
          <span>{copy.username}</span>
          <input
            autoComplete="username"
            className="border-line bg-canvas text-ink focus-visible:border-accent focus-visible:ring-accent rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-1"
            maxLength={120}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
        </label>
        <Select
          label={copy.role}
          onChange={setRole}
          options={[
            { value: "admin", label: copy.adminRole },
            { value: "manager", label: copy.managerRole },
          ]}
          value={role}
        />
        <label className="grid gap-1 text-xs">
          <span>{user ? copy.newPassword : copy.password}</span>
          <input
            autoComplete="new-password"
            className="border-line bg-canvas text-ink focus-visible:border-accent focus-visible:ring-accent rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-1"
            minLength={5}
            onChange={(event) => setPassword(event.target.value)}
            required={!user}
            type="password"
            value={password}
          />
          <span className="text-muted text-xs">
            {user ? copy.passwordOptionalHint : copy.passwordMinimum}
          </span>
        </label>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button
            className="text-muted hover:bg-canvas rounded-lg px-3 py-1.5 text-xs font-medium"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            {copy.cancel}
          </button>
          <button
            className="bg-accent text-on-accent rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? copy.saving : copy.save}
          </button>
        </div>
      </form>
    </AppDialog>
  );
};
