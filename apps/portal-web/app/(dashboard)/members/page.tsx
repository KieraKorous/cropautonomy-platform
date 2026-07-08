import {
  ApiError,
  listMemberInvitations,
  listMembers,
  listTeams,
  type MemberInvitation,
  type OrgMember,
  type TeamSummary
} from "../../../lib/api";
import { MembersView } from "./MembersView";

// Members — the org's people, their role and status, and the invitation flow.
// The Team page groups people into crews; this page is the roster of the people
// themselves. Owners/admins invite, change roles, suspend, and remove; everyone
// else sees the roster read-only.
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  let members: OrgMember[] = [];
  let invitations: MemberInvitation[] = [];
  let teams: TeamSummary[] = [];
  let canInvite = false;
  let canManageMembers = false;
  let canManageTeams = false;
  let loadError: string | null = null;

  try {
    const [membersResult, teamsResult] = await Promise.all([
      listMembers(),
      // Teams feed the "add to team" picker in the member detail. Tolerate a
      // failure so the roster still renders.
      listTeams().catch(() => ({ teams: [] as TeamSummary[], canManage: false }))
    ]);
    members = membersResult.members ?? [];
    canInvite = membersResult.canInvite ?? false;
    canManageMembers = membersResult.canManageMembers ?? false;
    teams = teamsResult.teams ?? [];
    // team_members.manage isn't in the teams response; managing members (admin/
    // owner) is the same tier that manages team rosters, so reuse that flag.
    canManageTeams = canManageMembers;

    // Pending invitations live in Clerk and only load for members.invite holders;
    // tolerate a failure so the roster still renders for everyone else.
    if (canInvite) {
      const inviteResult = await listMemberInvitations().catch(() => ({
        invitations: [] as MemberInvitation[]
      }));
      invitations = inviteResult.invitations ?? [];
    }
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the members service.";
  }

  const activeCount = members.filter((m) => m.status === "active").length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Members</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Everyone with access to this organization — their role, their status, and the
            teams they work on. Invite new operators, change what they can do, or take away
            access.
          </p>
        </div>
        {!loadError && members.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {activeCount} active {activeCount === 1 ? "member" : "members"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <MembersView
          members={members}
          invitations={invitations}
          teams={teams}
          canInvite={canInvite}
          canManageMembers={canManageMembers}
          canManageTeams={canManageTeams}
        />
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Off the grid
      </span>
      <h2 className="text-base font-semibold text-neutral">Can&apos;t reach your roster.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Members aren&apos;t loading right now. Refresh in a moment — if it keeps happening, make
        sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
