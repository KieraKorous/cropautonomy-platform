"use client";

import { useEffect, useRef, useState } from "react";
import { StatusPill } from "@gaia/ui";
import type { Device } from "../../../lib/api";
import { deleteDeviceAction, updateDeviceAction } from "./actions";
import { deviceFamilyMeta, deviceName, deviceStatusDisplay } from "./deviceDisplay";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  return dateFormat.format(new Date(value));
}

// Device detail + management modal. Native <dialog> (Escape + backdrop close),
// driven by the selected device passed from DevicesGrid; `device === null` means
// closed. Edits/retire/delete go through server actions that revalidate /devices,
// so the grid (and this modal's `device` prop) reflect changes without a fetch.
export function DeviceDetailModal({
  device,
  onClose
}: {
  device: Device | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = device != null;

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Seed the form and clear transient UI whenever a different device opens.
  const deviceId = device?.id;
  useEffect(() => {
    if (!device) return;
    setName(device.displayName ?? "");
    setNickname(device.nickname ?? "");
    setSaveState("idle");
    setConfirmingDelete(false);
    setError(null);
    // Intentionally keyed on the device id only — re-seeding on every prop change
    // would clobber edits the user is making mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  if (!device) {
    return <dialog ref={ref} onClose={onClose} className="hidden" />;
  }

  const { label: familyLabel, Icon } = deviceFamilyMeta(device.deviceFamily);
  const status = deviceStatusDisplay(device.status);
  const isRetired = device.status === "retired";
  const dirty = name !== (device.displayName ?? "") || nickname !== (device.nickname ?? "");

  async function onSave() {
    if (!device) return;
    setSaveState("saving");
    setError(null);
    try {
      await updateDeviceAction(device.id, {
        displayName: name.trim() || undefined,
        nickname: nickname.trim() ? nickname.trim() : null
      });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  async function onToggleRetire() {
    if (!device) return;
    setStatusBusy(true);
    setError(null);
    try {
      await updateDeviceAction(device.id, { status: isRetired ? "active" : "retired" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change device status.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function onDelete() {
    if (!device) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDeviceAction(device.id);
      onClose();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Couldn't delete device.");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-lg rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={22} />
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 className="truncate text-lg font-semibold text-neutral" title={deviceName(device)}>
                {deviceName(device)}
              </h2>
              <span className="text-xs text-base-content/55">{familyLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill label={status.label} tone={status.tone} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Metadata */}
        <dl className="flex flex-col gap-3 rounded-lg border border-base-content/10 bg-base-content/[0.02] p-4 text-sm">
          <DetailRow label="Kind" value={familyLabel} />
          <DetailRow label="Serial" value={device.serialNumber} />
          <DetailRow label="Firmware" value={device.firmwareVersion ?? "—"} />
          <DetailRow label="Registered by" value={device.registeredByName ?? "—"} />
          <DetailRow label="Registered" value={formatDate(device.registeredAt)} />
          <DetailRow label="Last seen" value={formatDate(device.lastSeenAt)} />
        </dl>

        {/* Edit form */}
        <div className="flex flex-col gap-3">
          <Field label="Device name">
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
                if (saveState !== "idle") setSaveState("idle");
              }}
              placeholder="e.g. North Field rover"
              className="w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
            />
          </Field>
          <Field label="Nickname">
            <input
              type="text"
              value={nickname}
              maxLength={80}
              onChange={(event) => {
                setNickname(event.target.value);
                if (saveState !== "idle") setSaveState("idle");
              }}
              placeholder="A friendly label (optional)"
              className="w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saveState === "saving"}
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </button>
            {saveState === "saved" ? (
              <span className="text-xs font-medium text-success">Saved</span>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-error">{error}</p> : null}

        {/* Danger zone — retire (reversible) + permanent delete. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 pt-4">
          <button
            type="button"
            onClick={onToggleRetire}
            disabled={statusBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-base-content/15 px-3.5 py-2 text-sm font-medium text-base-content/80 transition-colors hover:bg-base-content/[0.04] hover:text-neutral disabled:opacity-50"
          >
            {statusBusy
              ? "Updating…"
              : isRetired
                ? "Reactivate device"
                : "Disconnect / retire"}
          </button>

          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/65">Delete permanently?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
            >
              Delete device
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-base-content/55">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-neutral" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-base-content/65">{label}</span>
      {children}
    </label>
  );
}
