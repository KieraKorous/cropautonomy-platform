"use client";

import { useEffect, useRef, useState } from "react";
import { ASSIGNABLE_ROLES } from "../../../lib/api";
import { inviteMemberAction } from "./actions";

// Invite an email to the org at a chosen role. Native <dialog> (Escape +
// backdrop close), driven by the `open` flag from MembersView. Submitting goes
// through a server action that revalidates /members; Clerk sends the email.
export function InviteMemberModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("technician");
    setSaving(false);
    setError(null);
    setSent(null);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("An email address is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await inviteMemberAction(trimmed, role);
      setSent(trimmed);
      setEmail("");
      setSaving(false);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Couldn't send the invitation.");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current && !saving) onClose();
      }}
      className="m-auto w-full max-w-lg rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <form onSubmit={submit} className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral">Invite member</h2>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <p className="text-sm text-base-content/65">
            We&apos;ll email an invitation. When they accept and sign up, they join this
            organization at the role you choose.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-base-content/65">
              Email address<span className="text-error"> *</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSent(null);
              }}
              placeholder="operator@example.com"
              className="w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-base-content/65">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {sent ? (
            <p className="text-sm text-success">Invitation sent to {sent}.</p>
          ) : null}
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-content/10 px-6 py-4">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
          >
            {sent ? "Done" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
