const metrics = [
  ["August 2026", "prototype target"],
  ["Multi-tenant", "portal foundation"],
  ["AI scans", "first platform workflow"]
];

const capabilities = [
  "Crop scan intake for uploaded and mobile-captured imagery",
  "Farm, field, and organization data models from the start",
  "AI-assisted health reports with queued analysis workflows",
  "Robotics-ready architecture for future GAIA device telemetry"
];

export default function Home() {
  return (
    <main className="gaia-shell">
      <section className="gaia-container grid min-h-screen content-center gap-12 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Coming soon under active development
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] text-neutral md:text-7xl">
            CropAutonomy
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-base-content/78">
            Autonomous agricultural intelligence for farms, fields, and the
            next generation of robotics-enabled crop operations.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="btn btn-primary" href="#early-access">
              Request early access
            </a>
            <a className="btn btn-outline" href="https://gaiabots.ai">
              Explore GaiaBots
            </a>
          </div>
          <dl className="mt-10 grid gap-3 sm:grid-cols-3">
            {metrics.map(([value, label]) => (
              <div className="gaia-panel rounded-box p-4" key={value}>
                <dt className="text-lg font-semibold text-neutral">{value}</dt>
                <dd className="text-sm text-base-content/65">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="gaia-panel rounded-box p-5 shadow-sm">
          <div className="rounded-box border border-base-300 bg-neutral p-5 text-neutral-content">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="font-semibold">Field intelligence stack</span>
              <span className="badge badge-success">prototype</span>
            </div>
            <div className="mt-5 grid gap-3">
              {capabilities.map((capability) => (
                <div
                  className="rounded-field border border-white/10 bg-white/[0.04] p-4 text-sm leading-6"
                  key={capability}
                >
                  {capability}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-base-300 bg-base-100/70 py-16">
        <div className="gaia-container grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Platform direction
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-neutral">
              Built as infrastructure, not generic SaaS.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Multi-tenant organizations for farms and agricultural groups",
              "Supabase-backed data, storage, realtime, and edge workflows",
              "Clerk identity with CropAutonomy-owned membership and roles",
              "pg-boss queues, Resend email, and PostHog interaction analytics"
            ].map((item) => (
              <div className="gaia-panel rounded-box p-5" key={item}>
                <p className="leading-7 text-base-content/75">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gaia-container py-16" id="early-access">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-semibold text-neutral">
              Join the early access list.
            </h2>
            <p className="mt-4 text-lg leading-8 text-base-content/72">
              We are gathering input from farms, agricultural businesses,
              research teams, and robotics collaborators while the prototype
              comes together.
            </p>
          </div>
          <LeadForm />
        </div>
      </section>
    </main>
  );
}

function LeadForm() {
  return (
    <form action="/api/leads" className="gaia-panel rounded-box p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="form-control">
          <span className="label-text">Name</span>
          <input className="input input-bordered" name="name" required />
        </label>
        <label className="form-control">
          <span className="label-text">Email</span>
          <input className="input input-bordered" name="email" required type="email" />
        </label>
      </div>
      <label className="form-control mt-4">
        <span className="label-text">Organization</span>
        <input className="input input-bordered" name="organization" />
      </label>
      <label className="form-control mt-4">
        <span className="label-text">Interest</span>
        <select className="select select-bordered" name="interest" defaultValue="farm_or_grower">
          <option value="farm_or_grower">Farm or grower</option>
          <option value="agricultural_business">Agricultural business</option>
          <option value="research_institution">Research institution</option>
          <option value="robotics_collaborator">Robotics collaborator</option>
          <option value="investor_or_partner">Investor or partner</option>
          <option value="technical_contributor">Technical contributor</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="form-control mt-4">
        <span className="label-text">Message</span>
        <textarea className="textarea textarea-bordered min-h-28" name="message" />
      </label>
      <label className="label mt-4 cursor-pointer justify-start gap-3">
        <input className="checkbox checkbox-primary" name="consent" required type="checkbox" />
        <span className="label-text">I agree to receive development updates.</span>
      </label>
      <input name="source" type="hidden" value="cropautonomy.com" />
      <button className="btn btn-primary mt-5 w-full sm:w-auto" type="submit">
        Request early access
      </button>
    </form>
  );
}
