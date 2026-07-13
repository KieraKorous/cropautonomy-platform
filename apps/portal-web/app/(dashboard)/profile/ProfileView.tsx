"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { MyOrganization } from "../../../lib/api";
import { createOrganizationAction, setActiveOrganizationAction } from "./actions";

// A team the signed-in user belongs to, with the role they hold on it.
export interface ProfileTeam {
  id: string;
  name: string;
  color: string | null;
  roleName: string | null;
}

export interface ProfileViewProps {
  initialName: string;
  email: string | null;
  initials: string;
  avatarUrl: string | null;
  orgRoleName: string | null;
  teams: ProfileTeam[];
  organizations: MyOrganization[];
  activeOrgId: string | null;
}

// Names may contain letters (any script) and spaces only — no digits or symbols.
const NAME_RE = /^[\p{L} ]+$/u;

const inputClass =
  "w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50";

// Clerk surfaces field-level problems on err.errors[]; prefer its longMessage.
function clerkErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "errors" in err) {
    const arr = (err as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    if (arr && arr.length > 0) return arr[0].longMessage ?? arr[0].message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export function ProfileView({
  initialName,
  email,
  initials,
  avatarUrl,
  orgRoleName,
  teams,
  organizations,
  activeOrgId
}: ProfileViewProps) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="flex max-w-3xl flex-col gap-7">
      <ProfileHeader
        initialName={initialName}
        email={email}
        initials={initials}
        avatarUrl={avatarUrl}
      />

      <NameSection initialName={initialName} />

      <EmailSection email={email} />

      <PasswordSection passwordEnabled={user?.passwordEnabled ?? false} />

      <OrgSection
        orgRoleName={orgRoleName}
        teams={teams}
        organizations={organizations}
        activeOrgId={activeOrgId}
      />

      <LabsSection />

      <section className="flex flex-col gap-3 rounded-xl border border-base-content/10 bg-base-100 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Sign out</h2>
          <p className="text-sm text-base-content/65">
            End your session on this device.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => void signOut({ redirectUrl: "/sign-in" })}
            className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

// Temporary home for the Virtual Field simulator. It lives in the
// @gaia/virtual-field package and is kept out of the operator sidebar until it
// moves to its permanent surface; this card is the interim way in. The
// /virtual-field route stays directly navigable regardless.
function LabsSection() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-neutral">Labs</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
            Experimental
          </span>
        </div>
        <p className="text-sm text-base-content/65">
          Early tools that aren&apos;t part of the main console yet.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border border-base-content/10 px-3.5 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-neutral">Virtual Field</span>
          <span className="text-xs text-base-content/55">
            Browser-based digital-twin simulator — field, robot, and sensors.
          </span>
        </div>
        <Link
          href="/virtual-field"
          className="flex-shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
        >
          Open
        </Link>
      </div>
    </section>
  );
}

function ProfileHeader({
  initialName,
  email,
  initials,
  avatarUrl
}: {
  initialName: string;
  email: string | null;
  initials: string;
  avatarUrl: string | null;
}) {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Use initials" is an explicit choice, stored in Clerk unsafeMetadata, so a
  // user who doesn't want a photo still counts as having set up their avatar.
  const useInitials = Boolean(user?.unsafeMetadata?.useInitials);
  // Show the photo only when a custom one is set AND initials aren't chosen.
  // Before the client user loads, fall back to the server-provided url to
  // avoid a flash to initials.
  const showPhoto = isLoaded && user ? user.hasImage && !useInitials : Boolean(avatarUrl);
  const imageUrl = isLoaded && user ? user.imageUrl : avatarUrl;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await user.setProfileImage({ file });
      // Uploading a photo overrides a prior "use initials" choice.
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, useInitials: false } });
      router.refresh(); // shell/header read the avatar from Clerk
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not update your photo."));
    } finally {
      setBusy(false);
    }
  }

  async function chooseInitials() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (user.hasImage) await user.setProfileImage({ file: null });
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, useInitials: true } });
      router.refresh();
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not update your avatar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex flex-col gap-4 border-b border-base-content/10 pb-6">
      <div className="flex items-center gap-4">
        {showPhoto && imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-secondary-content">
            {initials}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-neutral">
            {initialName || "Your profile"}
          </h1>
          {email ? (
            <span className="truncate text-sm text-base-content/60">{email}</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-base-content/15 px-3 py-1.5 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05] disabled:opacity-40"
        >
          {busy ? "Working…" : showPhoto ? "Change photo" : "Add photo"}
        </button>
        {useInitials ? (
          <span className="text-xs text-base-content/45">Using your initials.</span>
        ) : (
          <button
            type="button"
            onClick={() => void chooseInitials()}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-base-content/60 transition-colors hover:bg-base-content/[0.05] hover:text-neutral disabled:opacity-40"
          >
            Use initials instead
          </button>
        )}
        {error ? (
          <span className="text-sm text-error">{error}</span>
        ) : (
          <span className="text-xs text-base-content/45">JPG, PNG or GIF, up to 10 MB.</span>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </header>
  );
}

function NameSection({ initialName }: { initialName: string }) {
  const { user } = useUser();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== initialName.trim();

  async function save() {
    if (!user) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (!NAME_RE.test(trimmed)) {
      setError("Name can contain letters and spaces only — no numbers or symbols.");
      return;
    }
    const [firstName, ...rest] = trimmed.split(" ");
    const lastName = rest.join(" ");
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await user.update({ firstName, lastName });
      setSaved(true);
      router.refresh(); // shell reads name from Clerk — refresh so the pill updates
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not update your name."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-neutral">Name</h2>
        <p className="text-sm text-base-content/65">
          The name shown across the platform. Letters and spaces only.
        </p>
      </div>
      <label className="flex max-w-sm flex-col gap-1.5">
        <span className="text-xs font-medium text-base-content/65">Display name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
            setSaved(false);
          }}
          className={inputClass}
          autoComplete="name"
        />
      </label>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {saved && !dirty ? <p className="text-sm text-success">Name updated.</p> : null}
      <div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save name"}
        </button>
      </div>
    </section>
  );
}

function EmailSection({ email }: { email: string | null }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-neutral">Email</h2>
        <p className="text-sm text-base-content/65">
          Your sign-in email. Contact an administrator to change it.
        </p>
      </div>
      <div className="max-w-sm rounded-md border border-base-content/10 bg-base-200/40 px-3 py-2 text-sm text-neutral">
        {email ?? "—"}
      </div>
    </section>
  );
}

function PasswordSection({ passwordEnabled }: { passwordEnabled: boolean }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow(false);
    setError(null);
  }

  async function save() {
    if (!user) return;
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await user.updatePassword({
        currentPassword: current,
        newPassword: next,
        signOutOfOtherSessions: true
      });
      setSaved(true);
      setOpen(false);
      reset();
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not update your password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-neutral">Password</h2>
        <p className="text-sm text-base-content/65">
          {passwordEnabled
            ? "Your password is stored securely and can never be displayed. You can set a new one here."
            : "You sign in with a connected account, so there is no password to change here."}
        </p>
      </div>

      {passwordEnabled ? (
        <>
          <div className="flex items-center gap-3">
            <span className="max-w-sm flex-1 rounded-md border border-base-content/10 bg-base-200/40 px-3 py-2 text-sm tracking-widest text-base-content/60">
              ••••••••••
            </span>
          </div>

          {saved ? <p className="text-sm text-success">Password updated.</p> : null}

          {open ? (
            <div className="flex max-w-sm flex-col gap-3 border-t border-base-content/10 pt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-base-content/65">Current password</span>
                <input
                  type="password"
                  value={current}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setError(null);
                  }}
                  className={inputClass}
                  autoComplete="current-password"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-base-content/65">New password</span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={next}
                    onChange={(e) => {
                      setNext(e.target.value);
                      setError(null);
                    }}
                    className={`${inputClass} pr-10`}
                    autoComplete="new-password"
                  />
                  <EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-base-content/65">
                  Confirm new password
                </span>
                <input
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(null);
                  }}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </label>

              {error ? <p className="text-sm text-error">{error}</p> : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !current || !next || !confirm}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  disabled={saving}
                  className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setSaved(false);
                }}
                className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
              >
                Change password
              </button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-base-content/50 transition-colors hover:text-neutral"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shown ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

function OrgSection({
  orgRoleName,
  teams,
  organizations,
  activeOrgId
}: {
  orgRoleName: string | null;
  teams: ProfileTeam[];
  organizations: MyOrganization[];
  activeOrgId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const hasActive = Boolean(activeOrgId);

  async function switchOrg(orgId: string) {
    if (busy || orgId === activeOrgId) return;
    setBusy(true);
    setError(null);
    const res = await setActiveOrganizationAction(orgId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh(); // re-reads the active org across the shell + this page
  }

  async function createOrg() {
    const name = newName.trim();
    if (name.length < 2) {
      setError("Organization name must be at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createOrganizationAction(name);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewName("");
    setCreating(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-neutral">Organization</h2>
        <p className="text-sm text-base-content/65">
          Choose your active organization, or create a new one. Everything in the portal is scoped
          to it.
        </p>
      </div>

      {!hasActive ? (
        <div className="rounded-md border border-accent/30 bg-accent/[0.07] px-3 py-2.5 text-sm text-base-content/70">
          You haven&apos;t selected an organization yet. Pick one below or create a new one to start
          using the portal.
        </div>
      ) : null}

      {organizations.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {organizations.map((o) => {
            const active = o.id === activeOrgId;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => void switchOrg(o.id)}
                  disabled={busy || active}
                  className={`flex w-full items-center justify-between gap-4 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-default ${
                    active
                      ? "border-primary/40 bg-primary/[0.06]"
                      : "border-base-content/10 hover:bg-base-content/[0.04]"
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-neutral">{o.name}</span>
                    <span className="text-xs text-base-content/50">{o.roleName ?? "Member"}</span>
                  </div>
                  {active ? (
                    <span className="flex-shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      Active
                    </span>
                  ) : (
                    <span className="flex-shrink-0 text-xs font-semibold text-primary">Switch</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-sm italic text-base-content/40">
          You&apos;re not part of any organization yet.
        </span>
      )}

      {creating ? (
        <div className="flex max-w-sm flex-col gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            placeholder="Organization name"
            className={inputClass}
            autoComplete="organization"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void createOrg()}
              disabled={busy || newName.trim().length < 2}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create organization"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
            disabled={busy}
            className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05] disabled:opacity-40"
          >
            Create a new organization
          </button>
        </div>
      )}

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {hasActive ? (
        <div className="flex flex-col gap-3 border-t border-base-content/10 pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-base-content/65">
              Your base role in the active organization
            </span>
            <span className="flex-shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {orgRoleName ?? "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-base-content/65">Your teams &amp; roles</span>
            {teams.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {teams.map((t) => (
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
                    <span className="flex-shrink-0 rounded-full bg-base-content/[0.06] px-2 py-0.5 text-xs text-base-content/70">
                      {t.roleName ?? "No role"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm italic text-base-content/40">
                You&apos;re not on any teams yet.
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
