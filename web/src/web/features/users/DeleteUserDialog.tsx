import { usePreferences } from "@/shared/i18n/preferences";
import { AppDialog } from "@/shared/ui/AppDialog";
import type { User } from "@contracts/auth.js";

export const DeleteUserDialog = ({
  user,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  user: User;
  pending: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const { copy } = usePreferences();

  return (
    <AppDialog open onClose={onClose} title={copy.deleteUserTitle}>
      <div className="grid gap-3 text-xs">
        <p className="leading-5">
          {copy.deleteUserDescription.replace("{username}", user.username)}
        </p>
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
            className="bg-danger text-panel rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? copy.deleting : copy.delete}
          </button>
        </div>
      </div>
    </AppDialog>
  );
};
