"use client";

import type { LeadInterest, LeadSource, PublicLead } from "@gaia/domain";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight } from "./icons";

const interestOptions: { value: LeadInterest; label: string }[] = [
  { value: "farm_or_grower", label: "Farm or grower" },
  { value: "agricultural_business", label: "Agricultural business" },
  { value: "research_institution", label: "Research institution" },
  { value: "robotics_collaborator", label: "Robotics collaborator" },
  { value: "investor_or_partner", label: "Investor or partner" },
  { value: "technical_contributor", label: "Technical contributor" },
  { value: "other", label: "Other" }
];

export type LeadFormCopy = {
  submitLabel?: string;
  consentLabel?: string;
  messageLabel?: string;
  reassurance?: string;
  interestLabel?: string;
  successHeadline?: string;
  successBody?: string;
};

export type LeadFormPlaceholders = {
  name?: string;
  email?: string;
  organization?: string;
  message?: string;
};

export type LeadFormProps = {
  source: LeadSource;
  apiUrl: string;
  defaultInterest?: LeadInterest;
  copy?: LeadFormCopy;
  placeholders?: LeadFormPlaceholders;
  className?: string;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function LeadForm({
  source,
  apiUrl,
  defaultInterest = "farm_or_grower",
  copy = {},
  placeholders = {},
  className = ""
}: LeadFormProps) {
  const submitLabel = copy.submitLabel ?? "Request early access";
  const consentLabel = copy.consentLabel ?? "I agree to receive development updates.";
  const messageLabel = copy.messageLabel ?? "What would matter most to you?";
  const interestLabel = copy.interestLabel ?? "I'm interested as a…";
  const reassurance = copy.reassurance ?? "We reply personally within a week.";
  const successHeadline = copy.successHeadline ?? "Thanks — we've got it.";
  const successBody =
    copy.successBody ??
    "Someone from the team will reach out personally. Keep an eye on your inbox.";

  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    const lead: PublicLead = {
      name: (formData.get("name") as string | null)?.trim() ?? "",
      email: (formData.get("email") as string | null)?.trim() ?? "",
      organization: (formData.get("organization") as string | null)?.trim() || undefined,
      interest: formData.get("interest") as LeadInterest,
      message: (formData.get("message") as string | null)?.trim() || undefined,
      consent: formData.get("consent") === "on",
      source
    };

    setState({ kind: "submitting" });
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const message =
          payload?.error?.message ??
          (response.status >= 500
            ? "Lead capture is temporarily unavailable. Please try again shortly."
            : "We couldn't submit your request. Please check the form and try again.");
        setState({ kind: "error", message });
        return;
      }

      form.reset();
      setState({ kind: "success" });
    } catch {
      setState({
        kind: "error",
        message:
          "We couldn't reach the server. Check your connection and try again, or email us directly."
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div
        className={`flex flex-col gap-3 rounded-xl bg-base-100 p-7 text-neutral ${className}`}
      >
        <h3 className="text-xl font-semibold">{successHeadline}</h3>
        <p className="text-base leading-6 text-base-content/70">{successBody}</p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <form
      className={`flex flex-col gap-4 rounded-xl bg-base-100 p-7 text-neutral ${className}`}
      method="post"
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            className="input input-bordered w-full"
            disabled={submitting}
            name="name"
            placeholder={placeholders.name}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className="input input-bordered w-full"
            disabled={submitting}
            name="email"
            placeholder={placeholders.email}
            required
            type="email"
          />
        </Field>
      </div>
      <Field label="Organization">
        <input
          className="input input-bordered w-full"
          disabled={submitting}
          name="organization"
          placeholder={placeholders.organization}
        />
      </Field>
      <Field label={interestLabel}>
        <select
          className="select select-bordered w-full"
          defaultValue={defaultInterest}
          disabled={submitting}
          name="interest"
        >
          {interestOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={messageLabel}>
        <textarea
          className="textarea textarea-bordered min-h-24 w-full"
          disabled={submitting}
          name="message"
          placeholder={placeholders.message}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2.5 pt-1">
        <input
          className="checkbox checkbox-primary checkbox-sm"
          disabled={submitting}
          name="consent"
          required
          type="checkbox"
        />
        <span className="text-sm text-base-content/72">{consentLabel}</span>
      </label>
      {state.kind === "error" ? (
        <p className="text-sm text-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-4">
        <button
          className="btn btn-primary whitespace-nowrap rounded-md px-5"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Sending…" : submitLabel}
          {submitting ? null : <ArrowRight />}
        </button>
        <span className="text-xs text-base-content/55">{reassurance}</span>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium text-neutral">{label}</span>
      {children}
    </label>
  );
}
