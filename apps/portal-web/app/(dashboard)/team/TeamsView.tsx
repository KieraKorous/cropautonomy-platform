"use client";

import { useState } from "react";
import { PlusIcon, UsersIcon } from "@gaia/ui";
import type {
  Device,
  FarmSummary,
  FieldSummary,
  OrgMember,
  TeamAssignmentCounts,
  TeamSummary
} from "../../../lib/api";
import { TeamDetailModal } from "./TeamDetailModal";
import { TeamFormModal } from "./TeamFormModal";

// Neutral fallback for a team with no accent color.
const NEUTRAL_ACCENT = "#6b7280";

// A compact "3 farms · 2 devices · 5 captures" line from the assignment counts,
// showing only the nonzero types. capture_session covers both live + recordings.
function countSummary(counts: TeamAssignmentCounts): string {
  const parts: string[] = [];
  const add = (n: number, singular: string, plural: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
  };
  add(counts.farm, "farm", "farms");
  add(counts.field, "field", "fields");
  add(counts.device, "device", "devices");
  add(counts.capture_session, "live/recording", "live/recordings");
  add(counts.capture, "capture", "captures");
  return parts.join(" · ");
}

// Teams grid: a card per team, plus the dashed "new team" tile for managers.
// Clicking a card opens the detail modal; the tile opens the form modal in
// create mode. Data is fetched on the server; server actions revalidate /team.
export function TeamsView({
  teams,
  canManage,
  members,
  farms,
  fields,
  devices
}: {
  teams: TeamSummary[];
  canManage: boolean;
  members: OrgMember[];
  farms: FarmSummary[];
  fields: FieldSummary[];
  devices: Device[];
}) {
  // null = closed; "new" = create form; a string = the id of the open team.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  // The team whose detail modal is open (id), separate from the create/edit form.
  const [viewing, setViewing] = useState<string | null>(null);

  const editingTeam =
    editing && editing !== "new" ? teams.find((t) => t.id === editing) ?? null : null;
  const viewingTeam = viewing ? teams.find((t) => t.id === viewing) ?? null : null;

  const detailModal = (
    <TeamDetailModal
      open={viewingTeam !== null}
      team={viewingTeam}
      members={members}
      farms={farms}
      fields={fields}
      devices={devices}
      canManage={canManage}
      onClose={() => setViewing(null)}
      onEdit={() => {
        if (!viewingTeam) return;
        const id = viewingTeam.id;
        setViewing(null);
        setEditing(id);
      }}
    />
  );

  const formModal = (
    <TeamFormModal
      open={editing !== null}
      team={editingTeam}
      onClose={() => setEditing(null)}
    />
  );

  if (teams.length === 0) {
    return (
      <>
        <EmptyState canManage={canManage} onCreate={() => setEditing("new")} />
        {formModal}
        {detailModal}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} onOpen={() => setViewing(team.id)} />
        ))}

        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-base-content/20 bg-base-100 text-base-content/55 transition-colors hover:border-primary/40 hover:bg-base-content/[0.02] hover:text-primary"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/45 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <PlusIcon size={24} />
            </span>
            <span className="text-sm font-medium">New team</span>
          </button>
        ) : null}
      </div>

      {formModal}
      {detailModal}
    </>
  );
}

function TeamCard({ team, onOpen }: { team: TeamSummary; onOpen: () => void }) {
  const accent = team.color ?? NEUTRAL_ACCENT;
  const summary = countSummary(team.assignmentCounts);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[9.5rem] flex-col gap-3 overflow-hidden rounded-xl border border-base-content/10 bg-base-100 p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="truncate text-sm font-semibold text-neutral" title={team.name}>
          {team.name}
        </span>
      </div>

      {team.description ? (
        <p className="line-clamp-2 text-sm text-base-content/65">{team.description}</p>
      ) : (
        <p className="text-sm italic text-base-content/40">No description</p>
      )}

      <div className="mt-auto flex flex-col gap-1.5 border-t border-base-content/10 pt-3 text-xs text-base-content/55">
        <span className="flex items-center gap-1.5">
          <UsersIcon size={13} />
          <span>
            <span className="font-semibold text-neutral">{team.memberCount}</span>{" "}
            {team.memberCount === 1 ? "member" : "members"}
          </span>
        </span>
        {summary ? (
          <span className="truncate" title={summary}>
            {summary}
          </span>
        ) : (
          <span className="text-base-content/40">No assignments</span>
        )}
      </div>
    </button>
  );
}

function EmptyState({
  canManage,
  onCreate
}: {
  canManage: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UsersIcon size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-neutral">No teams yet</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          {canManage
            ? "Create a team to scope who sees which farms, fields, and devices. Members see only their teams' ground; admins see everything."
            : "No teams have been set up for this organization yet. An admin or manager can create the first one."}
        </p>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
        >
          <PlusIcon size={16} />
          Create your first team
        </button>
      ) : null}
    </section>
  );
}
