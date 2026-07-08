"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon, UsersIcon } from "@gaia/ui";
import type { MemberInvitation, OrgMember, TeamSummary } from "../../../lib/api";
import { MemberDetailModal } from "./MemberDetailModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { revokeInvitationAction } from "./actions";

// Deterministic avatar tint from a stable id, so a member keeps the same color.
const AVATAR_COLORS = [
  "#5a7d3a",
  "#2f6f8f",
  "#b45309",
  "#9333ea",
  "#0d9488",
  "#be123c"
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initials(m: { displayName: string | null; email: string | null }): string {
  const source = m.displayName?.trim() || m.email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// Roster grid: a card per member, a Pending invitations strip, and an Invite
// control for members.invite holders. Clicking a card opens the detail modal
// where role / status / removal are managed. Data is fetched on the server;
// server actions revalidate /members.
export function MembersView({
  members,
  invitations,
  teams,
  canInvite,
  canManageMembers,
  canManageTeams
}: {
  members: OrgMember[];
  invitations: MemberInvitation[];
  teams: TeamSummary[];
  canInvite: boolean;
  canManageMembers: boolean;
  canManageTeams: boolean;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const viewingMember = viewing ? members.find((m) => m.userId === viewing) ?? null : null;

  // Owners first, then active before suspended, then by name — a stable, useful
  // reading order for the roster.
  const sorted = [...members].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? -1 : 1;
    const an = a.displayName ?? a.email ?? "";
    const bn = b.displayName ?? b.email ?? "";
    return an.localeCompare(bn);
  });

  return (
    <div className="flex flex-col gap-7">
      {canInvite ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
          >
            <PlusIcon size={16} />
            Invite member
          </button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((member) => (
            <MemberCard
              key={member.userId}
              member={member}
              onOpen={() => setViewing(member.userId)}
            />
          ))}
        </div>
      )}

      {invitations.length > 0 ? (
        <PendingInvitations invitations={invitations} canInvite={canInvite} />
      ) : null}

      <MemberDetailModal
        open={viewingMember !== null}
        member={viewingMember}
        teams={teams}
        canManageMembers={canManageMembers}
        canManageTeams={canManageTeams}
        onClose={() => setViewing(null)}
      />

      <InviteMemberModal open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function MemberCard({ member, onOpen }: { member: OrgMember; onOpen: () => void }) {
  const suspended = member.status === "suspended";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[9.5rem] flex-col gap-3 overflow-hidden rounded-xl border border-base-content/10 bg-base-100 p-4 text-left transition-colors hover:border-primary/40 ${
        suspended ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: avatarColor(member.userId) }}
        >
          {initials(member)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-neutral" title={member.displayName ?? undefined}>
            {member.displayName ?? member.email ?? "Unknown"}
            {member.isSelf ? <span className="ml-1 text-xs font-normal text-base-content/45">(you)</span> : null}
          </span>
          {member.email ? (
            <span className="truncate text-xs text-base-content/55" title={member.email}>
              {member.email}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-base-content/10 pt-3">
        <RoleBadge roleName={member.roleName} isOwner={member.isOwner} />
        <StatusBadge status={member.status} />
      </div>
    </button>
  );
}

export function RoleBadge({ roleName, isOwner }: { roleName: string | null; isOwner: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isOwner ? "bg-primary/12 text-primary" : "bg-base-content/[0.06] text-base-content/70"
      }`}
    >
      {roleName ?? "No role"}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "suspended") {
    return (
      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
        Suspended
      </span>
    );
  }
  return (
    <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
      Active
    </span>
  );
}

function PendingInvitations({
  invitations,
  canInvite
}: {
  invitations: MemberInvitation[];
  canInvite: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral">
        Pending invitations
        <span className="ml-2 font-normal text-base-content/45">{invitations.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-base-content/10 overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
        {invitations.map((inv) => (
          <InvitationRow key={inv.id} invitation={inv} canInvite={canInvite} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({
  invitation,
  canInvite
}: {
  invitation: MemberInvitation;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await revokeInvitationAction(invitation.id);
    if (result.ok) {
      router.refresh();
    } else {
      setBusy(false);
      setError(result.error);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-neutral" title={invitation.email}>
          {invitation.email}
        </span>
        <span className="text-xs text-base-content/50">
          Invited as {invitation.roleKey ?? "member"}
          {error ? <span className="ml-2 text-error">{error}</span> : null}
        </span>
      </div>
      {canInvite ? (
        <button
          type="button"
          onClick={revoke}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
        >
          <TrashIcon size={13} />
          {busy ? "Revoking…" : "Revoke"}
        </button>
      ) : null}
    </li>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UsersIcon size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-neutral">No members yet</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          Invite operators, managers, and admins to give them access to this organization.
        </p>
      </div>
    </section>
  );
}
