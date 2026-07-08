// The system roles a member can be assigned. `owner` is assignable only by an
// owner (the API enforces it). Shared by the invite + role-change controls.
//
// Lives here (not in lib/api.ts) so the client modals can import it as a value
// without pulling lib/api.ts's server-only Clerk imports into the client bundle.
export const ASSIGNABLE_ROLES: Array<{ key: string; name: string }> = [
  { key: "owner", name: "Owner" },
  { key: "admin", name: "Admin" },
  { key: "manager", name: "Manager" },
  { key: "technician", name: "Technician" },
  { key: "viewer", name: "Viewer" }
];
