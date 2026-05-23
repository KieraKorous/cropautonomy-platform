import type { LeadInterest, LeadSource } from "@gaia/domain";
import type { ReactNode } from "react";
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
};

export type LeadFormPlaceholders = {
  name?: string;
  email?: string;
  organization?: string;
  message?: string;
};

export type LeadFormProps = {
  source: LeadSource;
  defaultInterest?: LeadInterest;
  copy?: LeadFormCopy;
  placeholders?: LeadFormPlaceholders;
  className?: string;
};

export function LeadForm({
  source,
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

  return (
    <form
      action="/api/leads"
      className={`flex flex-col gap-4 rounded-xl bg-base-100 p-7 text-neutral ${className}`}
      method="post"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            className="input input-bordered w-full"
            name="name"
            placeholder={placeholders.name}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className="input input-bordered w-full"
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
          name="organization"
          placeholder={placeholders.organization}
        />
      </Field>
      <Field label={interestLabel}>
        <select
          className="select select-bordered w-full"
          defaultValue={defaultInterest}
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
          name="message"
          placeholder={placeholders.message}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2.5 pt-1">
        <input
          className="checkbox checkbox-primary checkbox-sm"
          name="consent"
          required
          type="checkbox"
        />
        <span className="text-sm text-base-content/72">{consentLabel}</span>
      </label>
      <input name="source" type="hidden" value={source} />
      <div className="mt-1 flex flex-wrap items-center gap-4">
        <button className="btn btn-primary whitespace-nowrap rounded-md px-5" type="submit">
          {submitLabel}
          <ArrowRight />
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
