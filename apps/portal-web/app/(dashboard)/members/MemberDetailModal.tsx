"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgMember } from "../../../lib/api";
import { initials, RoleBadge, StatusBadge } from "./MembersView";
import { removeMemberAction, updateMemberAction } from "./actions";
import { ASSIGNABLE_ROLES } from "./roles";

// Member detail: profile + role/status controls + removal. Opened for a selected
// member; on a successful mutation we close and router.refresh() so the roster
// behind the modal updates. Guards (can't touch yourself, keep one owner) are
// enforced by the API — the modal surfaces those errors and also hides the
// controls for your own row.
export function MemberDetailModal({
  open,
  member,
  canManageMembers,
  onClose
}: {
  open: boolean;
  member: OrgMember | null;
  canManageMembers: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const memberId = member?.userId;
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
    setConfirmingRemove(false);
    setRole(member?.roleKey ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId]);

  if (!member) {
    return (
      <dialog
        ref={ref}
        onClose={onClose}
        className="m-auto w-full max-w-lg rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
      />
    );
  }

  // Own row: you can view but not manage yourself here (prevents self-lockout).
  const manageable = canManageMembers && !member.isSelf;
  const suspended = member.status === "suspended";

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await fn();
    if (result.ok) {
      onClose();
      router.refresh();
    } else {
      setBusy(false);
      setError(result.error);
    }
  }

  async function saveRole() {
    if (!member || role === member.roleKey || !role) return;
    await run(() => updateMemberAction(member.userId, { roleKey: role }));
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
      className="m-auto w-full max-w-lg rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
              {initials(member)}
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 className="truncate text-lg font-semibold text-neutral">
                {member.displayName ?? member.email ?? "Unknown"}
              </h2>
              {member.email ? (
                <span className="truncate text-sm text-base-content/55">{member.email}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2">
            <RoleBadge roleName={member.roleName} isOwner={member.isOwner} />
            <StatusBadge status={member.status} />
            {member.isSelf ? (
              <span className="text-xs text-base-content/45">This is you</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-base-content/65">Teams</span>
            {member.teams.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {member.teams.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-base-content/10 px-2 py-0.5 text-xs text-base-content/70"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.color ?? "#6b7280" }}
                    />
                    {t.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm italic text-base-content/40">On no teams</span>
            )}
          </div>

          {manageable ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-base-content/65" htmlFor="member-role">
                Role
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="member-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                  className="flex-1 rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={saveRole}
                  disabled={busy || role === member.roleKey || !role}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        {manageable ? (
          <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
            {confirmingRemove ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/65">Remove from org?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  disabled={busy}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => run(() => removeMemberAction(member.userId))}
                  disabled={busy}
                  className="rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
                >
                  {busy ? "Removing…" : "Remove"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
              >
                Remove member
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                run(() =>
                  updateMemberAction(member.userId, {
                    status: suspended ? "active" : "suspended"
                  })
                )
              }
              disabled={busy}
              className="rounded-md border border-base-content/15 px-3.5 py-2 text-sm font-medium text-base-content/75 transition-colors hover:bg-base-content/[0.04] hover:text-neutral disabled:opacity-50"
            >
              {suspended ? "Reactivate" : "Suspend"}
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
