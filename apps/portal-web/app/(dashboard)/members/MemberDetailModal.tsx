"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@gaia/ui";
import type { OrgMember, TeamSummary } from "../../../lib/api";
import { initials, RoleBadge, StatusBadge } from "./MembersView";
import {
  addMemberToTeamAction,
  removeMemberAction,
  removeMemberFromTeamAction,
  updateMemberAction,
  updateMemberTeamRoleAction
} from "./actions";
import { ASSIGNABLE_ROLES, TEAM_ROLES } from "./roles";

type ActionResult = { ok: true } | { ok: false; error: string };

// Member detail: profile, org role/status/removal, and per-team roles. Roles are
// assigned per team — a member can be an Agronomist on one team and a Field Scout
// on another; their effective permissions are the union. Org-level actions close
// the modal; team edits keep it open and router.refresh() so the updated roster
// (and this member's teams) flow back in. Guards (self, last owner, owner-only)
// are enforced by the API and surfaced here.
export function MemberDetailModal({
  open,
  member,
  teams,
  canManageMembers,
  canManageTeams,
  onClose
}: {
  open: boolean;
  member: OrgMember | null;
  teams: TeamSummary[];
  canManageMembers: boolean;
  canManageTeams: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [role, setRole] = useState<string>("");
  const [addTeamId, setAddTeamId] = useState<string>("");
  const [addTeamRole, setAddTeamRole] = useState<string>("technician");

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
    setAddTeamId("");
    setAddTeamRole("technician");
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
  const memberTeams = member.teams;
  const onTeamIds = new Set(memberTeams.map((t) => t.id));
  const availableTeams = teams.filter((t) => !onTeamIds.has(t.id));

  // Org-level action: close the modal + refresh the roster behind it.
  // The catch matters: a server action can *reject* (an RSC/network failure
  // invoking it, or an unexpected server throw) instead of returning
  // {ok:false}. Without it, `busy` never clears and the button sticks on
  // "Saving…" forever with no feedback. finally guarantees the reset.
  async function run(fn: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Team-level edit: stay open, refresh so this member's teams update in place.
  async function runStay(fn: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
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

          {manageable ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-base-content/65" htmlFor="member-role">
                Base role <span className="text-base-content/40">(org-wide)</span>
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

          {/* Teams + per-team role */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-base-content/65">Teams &amp; roles</span>

            {memberTeams.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {memberTeams.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-base-content/10 px-2.5 py-1.5"
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: t.color ?? "#6b7280" }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral" title={t.name}>
                      {t.name}
                    </span>
                    {canManageTeams ? (
                      <>
                        <select
                          value={t.roleKey ?? ""}
                          onChange={(e) =>
                            runStay(() =>
                              updateMemberTeamRoleAction(member.userId, t.id, e.target.value)
                            )
                          }
                          disabled={busy}
                          className="rounded-md border border-base-content/15 bg-base-100 px-2 py-1 text-xs text-neutral outline-none transition-colors focus:border-primary/50"
                        >
                          {t.roleKey ? null : <option value="">No role</option>}
                          {TEAM_ROLES.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            runStay(() => removeMemberFromTeamAction(member.userId, t.id))
                          }
                          disabled={busy}
                          aria-label={`Remove from ${t.name}`}
                          className="rounded-md p-1 text-base-content/45 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </>
                    ) : (
                      <span className="rounded-full bg-base-content/[0.06] px-2 py-0.5 text-xs text-base-content/70">
                        {t.roleName ?? "No role"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm italic text-base-content/40">On no teams</span>
            )}

            {canManageTeams && availableTeams.length > 0 ? (
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={addTeamId}
                  onChange={(e) => setAddTeamId(e.target.value)}
                  disabled={busy}
                  className="min-w-0 flex-1 rounded-md border border-base-content/15 bg-base-100 px-2 py-1.5 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
                >
                  <option value="">Add to team…</option>
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={addTeamRole}
                  onChange={(e) => setAddTeamRole(e.target.value)}
                  disabled={busy || !addTeamId}
                  className="rounded-md border border-base-content/15 bg-base-100 px-2 py-1.5 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!addTeamId) return;
                    const teamId = addTeamId;
                    setAddTeamId("");
                    void runStay(() =>
                      addMemberToTeamAction(member.userId, teamId, addTeamRole)
                    );
                  }}
                  disabled={busy || !addTeamId}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>

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
