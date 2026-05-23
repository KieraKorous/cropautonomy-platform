# Authentication and Tenancy

## Decision

Use Clerk for authentication identity. Use CropAutonomy-owned database tables for organization membership, roles, and application authorization.

Do not use Supabase Auth.

Do not treat Clerk embedded organization objects as the source of truth for portal membership.

## Identity vs Membership

Identity answers:

- Who is this person?
- Has this person authenticated?
- What verified email or identity provider is associated with them?

Membership answers:

- Which organizations can this person access?
- What role do they have?
- Which farms, fields, devices, or scans can they interact with?
- Who invited them?
- Is their membership active, pending, suspended, or removed?

Clerk should solve identity. CropAutonomy should solve membership.

## Initial Domain Model

Recommended entities:

- `users`
- `organizations`
- `organization_memberships`
- `organization_invitations`
- `roles`
- `permissions`
- `farms`
- `fields`
- `devices`
- `crop_scans`
- `analysis_jobs`
- `telemetry_events`

## Initial Roles

- `owner`
- `admin`
- `manager`
- `technician`
- `viewer`

## Tenancy Rules

- Every farm belongs to one organization.
- Every field belongs to one farm.
- Every scan belongs to one organization and should usually belong to a field.
- Every device belongs to one organization.
- Every telemetry event belongs to one device and organization.
- Every query that reads tenant-owned data must be scoped to organization access.

## Authorization Requirements

The app should centralize authorization checks.

Examples:

- owners can manage billing and delete organizations when that exists
- admins can invite users and manage farms
- managers can edit fields and assign work
- technicians can create scans and view assigned field data
- viewers can read data but not mutate operational records

## Open Design Questions

- Will users be allowed to create organizations freely, or will early accounts be invite-only?
- Will organizations support sub-teams or locations?
- Will research partners need special cross-organization access?
- Will external collaborators need time-limited access to scans or reports?

