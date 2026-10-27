import { useEffect, useState } from "react";

import { usePreferences } from "@/shared/i18n/preferences";
import type { User } from "@contracts/auth.js";
import { UserEditorDialog } from "./UserEditorDialog";
import { createUser, getUsers, updateUser, type UserInput } from "./users-api";

type EditorState = { user: User | null };

export const UsersPage = ({
  currentUser,
  onSessionExpired,
}: {
  currentUser: User;
  onSessionExpired: () => void;
}) => {
  const { copy, errorText } = usePreferences();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setUsers(await getUsers());
    } catch (error) {
      setLoadError(errorText(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const save = async (input: UserInput & { password: string }) => {
    if (!editor) return;
    setSaving(true);
    setSaveError("");
    try {
      const { password, ...fields } = input;
      const saved = editor.user
        ? await updateUser(editor.user.id, {
            ...fields,
            ...(password ? { password } : {}),
          })
        : await createUser({ ...fields, password });
      setUsers((current) =>
        editor.user
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved].sort((left, right) => left.name.localeCompare(right.name)),
      );
      const ownPasswordChanged = editor.user?.id === currentUser.id && Boolean(password);
      setEditor(null);
      if (ownPasswordChanged) onSessionExpired();
    } catch (error) {
      setSaveError(errorText(error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const openEditor = (user: User | null) => {
    setSaveError("");
    setEditor({ user });
  };

  return (
    <section className="scroll-area min-h-0 flex-1 overflow-y-auto p-3">
      <div className="w-full">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{copy.userManagementTitle}</h1>
            <p className="text-muted mt-1 max-w-2xl text-xs leading-5">
              {copy.userManagementDescription}
            </p>
          </div>
          <button
            className="bg-accent text-on-accent rounded-sm px-2.5 py-1.5 text-xs font-medium"
            onClick={() => openEditor(null)}
            type="button"
          >
            {copy.addUser}
          </button>
        </div>

        <div className="border-line bg-panel overflow-hidden rounded-sm border">
          {loading ? (
            <p className="text-muted p-6 text-sm">{copy.loading}</p>
          ) : loadError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-6">
              <p role="alert" className="text-danger text-sm">
                {loadError}
              </p>
              <button
                className="text-accent text-sm font-medium underline underline-offset-4"
                onClick={() => void loadUsers()}
                type="button"
              >
                {copy.retry}
              </button>
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted p-8 text-center text-sm">{copy.emptyUsers}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <caption className="sr-only">{copy.userManagementTitle}</caption>
                <thead className="border-line text-muted border-b text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 font-medium" scope="col">
                      {copy.name}
                    </th>
                    <th className="px-3 py-2 font-medium" scope="col">
                      {copy.email}
                    </th>
                    <th className="px-3 py-2 font-medium" scope="col">
                      {copy.role}
                    </th>
                    <th className="px-3 py-2 text-right font-medium" scope="col">
                      {copy.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {users.map((user) => (
                    <tr className="hover:bg-canvas/70" key={user.id}>
                      <td className="px-3 py-2 font-medium">{user.name}</td>
                      <td className="text-muted px-3 py-2">{user.email}</td>
                      <td className="px-3 py-2">
                        <span className="border-line bg-canvas rounded-sm border px-1.5 py-0.5 text-[10px] font-medium">
                          {user.role === "admin" ? copy.adminRole : copy.managerRole}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="text-accent font-medium underline underline-offset-4"
                          onClick={() => openEditor(user)}
                          type="button"
                        >
                          {copy.edit}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editor && (
        <UserEditorDialog
          error={saveError}
          onClose={() => setEditor(null)}
          onSave={(input) => void save(input)}
          pending={saving}
          user={editor.user}
        />
      )}
    </section>
  );
};
