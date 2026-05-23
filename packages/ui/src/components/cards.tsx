import type { ReactNode } from "react";
import { Check } from "./icons";

export type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  body: string;
  bullets?: string[];
};

export function FeatureCard({ icon, title, body, bullets }: FeatureCardProps) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-base-content/10 bg-base-100 p-7">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-3 text-xl font-semibold leading-tight text-neutral">{title}</h3>
      <p className="mb-5 text-sm leading-6 text-base-content/70">{body}</p>
      {bullets && bullets.length > 0 && (
        <ul className="mt-auto space-y-2.5">
          {bullets.map((bullet) => (
            <li className="flex items-center gap-2 text-sm text-neutral" key={bullet}>
              <Check className="text-primary" />
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export type AudienceCardProps = {
  title: string;
  body: string;
  image: string;
  imageAlt?: string;
};

export function AudienceCard({ title, body, image, imageAlt = "" }: AudienceCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <div className="h-44 w-full overflow-hidden bg-base-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={imageAlt} className="h-full w-full object-cover" loading="lazy" src={image} />
      </div>
      <div className="flex flex-col gap-2 p-6">
        <h3 className="text-lg font-semibold text-neutral">{title}</h3>
        <p className="text-sm leading-6 text-base-content/70">{body}</p>
      </div>
    </article>
  );
}

export type DeviceSpec = readonly [label: string, value: string];

export type DeviceCardProps = {
  code: string;
  label: string;
  status: string;
  image: string;
  imageAlt?: string;
  description: string;
  specs: readonly DeviceSpec[];
};

export function DeviceCard({
  code,
  label,
  status,
  image,
  imageAlt = "",
  description,
  specs
}: DeviceCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-200/60">
      <div className="h-64 w-full overflow-hidden border-b border-base-content/10 bg-base-300 md:h-72">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={imageAlt} className="h-full w-full object-cover" loading="lazy" src={image} />
      </div>
      <div className="flex flex-col p-7 lg:p-8">
        <div className="mb-3.5 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-primary">{label}</span>
          <span className="text-base-content/40">·</span>
          <span className="text-base-content/55">{status}</span>
        </div>
        <h3 className="mb-3.5 text-4xl font-semibold leading-tight tracking-tight text-neutral">
          {code}
        </h3>
        <p className="mb-6 text-base leading-6 text-base-content/70">{description}</p>
        <dl className="grid gap-3.5 border-t border-base-content/10 pt-6">
          {specs.map(([k, v]) => (
            <div className="flex flex-col gap-1 md:flex-row md:gap-4" key={k}>
              <dt className="w-36 flex-shrink-0 text-xs text-base-content/55">{k}</dt>
              <dd className="text-sm text-neutral">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

export type FutureFamilyCardProps = {
  code: string;
  title: string;
  body: string;
  status?: string;
};

export function FutureFamilyCard({
  code,
  title,
  body,
  status = "Concept"
}: FutureFamilyCardProps) {
  return (
    <article className="flex flex-col rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight text-neutral">{code}</span>
        <span className="rounded bg-base-content/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-base-content/60">
          {status}
        </span>
      </div>
      <h3 className="mb-2 text-base font-semibold text-neutral">{title}</h3>
      <p className="text-sm leading-6 text-base-content/65">{body}</p>
    </article>
  );
}
