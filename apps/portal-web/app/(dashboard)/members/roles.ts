// The system roles a member can be assigned. `owner` is assignable only by an
// owner (the API enforces it). Shared by the invite + role-change controls.
// Names are agriculture-flavored; keys stay stable (see migration 0029). Keep
// these labels in sync with public.roles.name.
//
// Lives here (not in lib/api.ts) so the client modals can import it as a value
// without pulling lib/api.ts's server-only Clerk imports into the client bundle.
export const ASSIGNABLE_ROLES: Array<{ key: string; name: string }> = [
  { key: "owner", name: "Owner" },
  { key: "admin", name: "Farm Manager" },
  { key: "manager", name: "Agronomist" },
  { key: "technician", name: "Field Scout" },
  { key: "viewer", name: "Observer" }
];

// Roles assignable on a team. Owner is an org-level concept (billing, deleting
// the org), so it's not offered as a per-team role.
export const TEAM_ROLES = ASSIGNABLE_ROLES.filter((r) => r.key !== "owner");
