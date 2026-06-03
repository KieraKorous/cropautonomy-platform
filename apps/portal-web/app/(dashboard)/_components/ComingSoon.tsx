import type { ReactNode } from "react";

type ComingSoon = {
  /** Section name, e.g. "Farms". Drives the header + pill. */
  title: string;
  /** One-line page intent, matched to the brand voice. */
  intro: string;
  /** Section icon, sized for a 40px badge. */
  icon: ReactNode;
  /** Short, grounded on-brand line — the "all quiet in the field" beat. */
  note: string;
};

// Shared placeholder for portal sections that are scaffolded in the nav but
// not yet built. Industrial, calm, honest about hardware/software readiness —
// per apps/portal-web/DESIGN.md. Swap the whole component out when the real
// page lands; nothing else imports it.
export function ComingSoon({ title, intro, icon, note }: ComingSoon) {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">{title}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">{intro}</p>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
        <div className="flex flex-col gap-5 px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex items-center gap-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {icon}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              In development
            </span>
          </div>

          <div className="flex max-w-xl flex-col gap-2">
            <h2 className="text-lg font-semibold text-neutral">{title} is on the way.</h2>
            <p className="text-sm leading-relaxed text-base-content/65">{note}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
