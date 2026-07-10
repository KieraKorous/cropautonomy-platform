"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon } from "@gaia/ui";
import type {
  Device,
  FarmSummary,
  FieldSummary,
  OrgMember,
  TeamAssignments,
  TeamDetail,
  TeamMember,
  TeamResourceType,
  TeamSummary
} from "../../../lib/api";
import {
  addTeamMemberAction,
  assignEntitiesAction,
  getTeamAction,
  removeTeamMemberAction,
  unassignEntitiesAction
} from "./actions";

const EMPTY_ASSIGNMENTS: TeamAssignments = {
  farm: [],
  field: [],
  device: [],
  capture_session: [],
  capture: [],
  scout_task: []
};

// Two-word initials for the avatar fallback.
function initials(member: { displayName: string | null; email: string | null }): string {
  const source = member.displayName?.trim() || member.email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// Team detail: roster + assignment management. Opened for a selected team; on
// open it fetches the full TeamDetail (members + assignments) via a server
// action, and re-fetches after every mutation so the view stays in sync with
// the revalidated grid behind it.
export function TeamDetailModal({
  open,
  team,
  members,
  farms,
  fields,
  devices,
  canManage,
  onClose,
  onEdit
}: {
  open: boolean;
  team: TeamSummary | null;
  members: OrgMember[];
  farms: FarmSummary[];
  fields: FieldSummary[];
  devices: Device[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"members" | "assignments">("members");
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const teamId = team?.id;

  // Load (and reload) the team detail. Kept as a callable so mutations can
  // refresh without a full close/reopen.
  async function refresh() {
    if (!teamId) return;
    try {
      const next = await getTeamAction(teamId);
      setDetail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the team.");
    }
  }

  useEffect(() => {
    if (!open || !teamId) return;
    setTab("members");
    setDetail(null);
    setError(null);
    setBusy(false);
    setLoading(true);
    getTeamAction(teamId)
      .then((next) => setDetail(next))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Couldn't load the team.")
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId]);

  if (!team) {
    return (
      <dialog
        ref={ref}
        onClose={onClose}
        className="m-auto w-full max-w-2xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
      />
    );
  }

  const assignments = detail?.assignments ?? EMPTY_ASSIGNMENTS;
  const roster = detail?.members ?? [];

  // Run a mutation, then refresh the detail. Guards double-submits.
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const accent = team.color ?? "#6b7280";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-2xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="relative flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <div className="flex min-w-0 flex-col">
              <h2 className="truncate text-lg font-semibold text-neutral" title={team.name}>
                {team.name}
              </h2>
              {team.description ? (
                <p className="truncate text-xs text-base-content/55">{team.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {canManage ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-base-content/65 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" className="tabs tabs-bordered gap-1 px-6 pt-3">
          <button
            role="tab"
            type="button"
            onClick={() => setTab("members")}
            className={`tab ${tab === "members" ? "tab-active font-semibold text-neutral" : "text-base-content/60"}`}
          >
            Members
          </button>
          <button
            role="tab"
            type="button"
            onClick={() => setTab("assignments")}
            className={`tab ${tab === "assignments" ? "tab-active font-semibold text-neutral" : "text-base-content/60"}`}
          >
            Assignments
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          {detail?.createdBy ? (
            <p className="text-xs text-base-content/55">
              Created by{" "}
              <span className="font-medium text-neutral">
                {detail.createdBy.displayName ?? detail.createdBy.email ?? "Unknown"}
              </span>
            </p>
          ) : null}
          {loading ? (
            <p className="py-6 text-center text-sm text-base-content/55">Loading…</p>
          ) : tab === "members" ? (
            <MembersTab
              roster={roster}
              orgMembers={members}
              canManage={canManage}
              busy={busy}
              onAdd={(userId) => run(() => addTeamMemberAction(team.id, userId))}
              onRemove={(userId) => run(() => removeTeamMemberAction(team.id, userId))}
            />
          ) : (
            <AssignmentsTab
              team={team}
              assignments={assignments}
              farms={farms}
              fields={fields}
              devices={devices}
              canManage={canManage}
              busy={busy}
              onAssign={(type, id, cascade) =>
                run(() =>
                  assignEntitiesAction(
                    team.id,
                    [{ resourceType: type, resourceId: id }],
                    cascade
                  )
                )
              }
              onUnassign={(type, id) =>
                run(() =>
                  unassignEntitiesAction(team.id, [{ resourceType: type, resourceId: id }])
                )
              }
            />
          )}

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
      </div>
    </dialog>
  );
}

// --- Members tab ----------------------------------------------------------

function MembersTab({
  roster,
  orgMembers,
  canManage,
  busy,
  onAdd,
  onRemove
}: {
  roster: TeamMember[];
  orgMembers: OrgMember[];
  canManage: boolean;
  busy: boolean;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [pick, setPick] = useState("");
  const onTeam = new Set(roster.map((m) => m.userId));
  const available = orgMembers.filter((m) => !onTeam.has(m.userId));

  return (
    <div className="flex flex-col gap-4">
      {roster.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-content/20 bg-base-content/[0.02] px-4 py-6 text-center text-sm text-base-content/55">
          No members on this team yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-base-content/8">
          {roster.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(m)
                )}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-neutral">
                  {m.displayName ?? m.email ?? "Unknown"}
                </span>
                {m.email ? (
                  <span className="truncate text-xs text-base-content/55">{m.email}</span>
                ) : null}
              </div>
              <span className="ml-auto flex-shrink-0 rounded-full bg-base-content/[0.06] px-2 py-0.5 text-xs text-base-content/70">
                {m.roleName ?? "No role"}
              </span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onRemove(m.userId)}
                  disabled={busy}
                  aria-label={`Remove ${m.displayName ?? m.email ?? "member"}`}
                  className="rounded-md p-1.5 text-base-content/45 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  <TrashIcon size={15} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="flex items-center gap-2 border-t border-base-content/10 pt-4">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={busy || available.length === 0}
            className="min-w-0 flex-1 rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50 disabled:opacity-50"
          >
            <option value="">
              {available.length === 0 ? "Everyone's on the team" : "Add a member…"}
            </option>
            {available.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.email ?? m.userId}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !pick}
            onClick={() => {
              if (!pick) return;
              onAdd(pick);
              setPick("");
            }}
            className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

// --- Assignments tab ------------------------------------------------------

function AssignmentsTab({
  team,
  assignments,
  farms,
  fields,
  devices,
  canManage,
  busy,
  onAssign,
  onUnassign
}: {
  team: TeamSummary;
  assignments: TeamAssignments;
  farms: FarmSummary[];
  fields: FieldSummary[];
  devices: Device[];
  canManage: boolean;
  busy: boolean;
  onAssign: (
    type: TeamResourceType,
    id: string,
    cascade?: "farm_descendants"
  ) => void;
  onUnassign: (type: TeamResourceType, id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AssignSection
        title="Farms"
        type="farm"
        assignedIds={assignments.farm}
        options={farms.map((f) => ({ id: f.id, name: f.name }))}
        canManage={canManage}
        busy={busy}
        onAssign={onAssign}
        onUnassign={onUnassign}
        cascade
      />
      <AssignSection
        title="Fields"
        type="field"
        assignedIds={assignments.field}
        options={fields.map((f) => ({ id: f.id, name: f.name }))}
        canManage={canManage}
        busy={busy}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />
      <AssignSection
        title="Devices"
        type="device"
        assignedIds={assignments.device}
        options={devices.map((d) => ({
          id: d.id,
          name: d.displayName ?? d.nickname ?? d.serialNumber
        }))}
        canManage={canManage}
        busy={busy}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />

      {/* Captures + Live/Recordings are filed from the field app or pulled in by
          a farm cascade — no picker, just the read-only rollup. */}
      <div className="flex flex-col gap-2 border-t border-base-content/10 pt-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-base-content/70">
            <span className="font-semibold text-neutral">
              {team.assignmentCounts.capture}
            </span>{" "}
            captures
          </span>
          <span className="text-base-content/70">
            <span className="font-semibold text-neutral">
              {team.assignmentCounts.capture_session}
            </span>{" "}
            live / recordings
          </span>
        </div>
        <p className="text-xs text-base-content/50">
          Captures and live sessions are filed to a team from the field app or by
          assigning a farm with cascade — no picker needed here.
        </p>
      </div>
    </div>
  );
}

function AssignSection({
  title,
  type,
  assignedIds,
  options,
  canManage,
  busy,
  onAssign,
  onUnassign,
  cascade
}: {
  title: string;
  type: TeamResourceType;
  assignedIds: string[];
  options: { id: string; name: string }[];
  canManage: boolean;
  busy: boolean;
  onAssign: (type: TeamResourceType, id: string, cascade?: "farm_descendants") => void;
  onUnassign: (type: TeamResourceType, id: string) => void;
  cascade?: boolean;
}) {
  const [pick, setPick] = useState("");
  const [withDescendants, setWithDescendants] = useState(false);

  const nameById = new Map(options.map((o) => [o.id, o.name]));
  const assignedSet = new Set(assignedIds);
  const available = options.filter((o) => !assignedSet.has(o.id));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
        {title}
      </span>

      {assignedIds.length === 0 ? (
        <p className="text-sm text-base-content/50">None assigned.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-full border border-base-content/40 bg-base-content/[0.03] py-1 pl-2.5 pr-1.5 text-xs text-neutral"
            >
              <span className="max-w-[10rem] truncate">{nameById.get(id) ?? id}</span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onUnassign(type, id)}
                  disabled={busy}
                  aria-label={`Unassign ${nameById.get(id) ?? id}`}
                  className="rounded-full p-0.5 text-base-content/45 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}

      {canManage ? (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={busy || available.length === 0}
              className="min-w-0 flex-1 rounded-md border border-base-content/15 bg-base-100 px-3 py-1.5 text-sm text-neutral outline-none transition-colors focus:border-primary/50 disabled:opacity-50"
            >
              <option value="">
                {available.length === 0 ? `All ${title.toLowerCase()} assigned` : "Assign…"}
              </option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !pick}
              onClick={() => {
                if (!pick) return;
                onAssign(type, pick, cascade && withDescendants ? "farm_descendants" : undefined);
                setPick("");
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Assign
            </button>
          </div>
          {cascade ? (
            <label className="flex items-center gap-2 text-xs text-base-content/65">
              <input
                type="checkbox"
                checked={withDescendants}
                onChange={(e) => setWithDescendants(e.target.checked)}
                className="checkbox checkbox-xs"
              />
              Also assign this farm&apos;s fields, sessions and captures
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
