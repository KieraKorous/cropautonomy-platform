import { currentUser } from "@clerk/nextjs/server";

import { getMe, listMembers, listMyOrganizations } from "../../../lib/api";
import { initialsFrom } from "../../../lib/initials";
import { ProfileView, type ProfileTeam } from "./ProfileView";

// The signed-in user's own account page, reached from the top-right pill.
// Identity (email/name/avatar) comes from Clerk; the org name + base role come
// from /v1/me; the per-team roles are read off the caller's own row in
// /v1/members (its `teams[]` carries the accurate per-team role — the row's
// top-level roleName is display-forced to Owner and is NOT used here).
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [clerkUser, me, membersResult, orgsResult] = await Promise.all([
    currentUser(),
    getMe().catch(() => null),
    listMembers().catch(() => null),
    listMyOrganizations().catch(() => null)
  ]);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? me?.user.email ?? null;
  const fullName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    me?.user.displayName ||
    "";
  const avatarUrl = clerkUser?.imageUrl ?? me?.user.avatarUrl ?? null;

  const self = membersResult?.members.find((m) => m.isSelf) ?? null;
  const teams: ProfileTeam[] = (self?.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    roleName: t.roleName
  }));

  return (
    <ProfileView
      initialName={fullName}
      email={email}
      initials={initialsFrom(fullName, email)}
      avatarUrl={avatarUrl}
      orgRoleName={me?.role.name ?? null}
      teams={teams}
      organizations={orgsResult?.organizations ?? []}
      activeOrgId={orgsResult?.activeOrgId ?? null}
    />
  );
}
