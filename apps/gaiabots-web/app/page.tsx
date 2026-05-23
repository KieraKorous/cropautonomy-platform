const devices = [
  {
    name: "GAIA-R",
    type: "Ground rover platform",
    description:
      "Designed for crop scanning, field traversal, localized sensing, and future autonomous route execution."
  },
  {
    name: "GAIA-D",
    type: "Aerial drone platform",
    description:
      "Designed for overhead crop intelligence, large-area inspection, field imaging, and future mapping workflows."
  }
];

export default function Home() {
  return (
    <main className="gaia-shell">
      <section className="gaia-container grid min-h-screen content-center gap-12 py-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Upcoming hardware under active development
          </p>
          <div className="relative">
            <h1 className="text-5xl font-semibold leading-[1.02] text-neutral md:text-7xl">GAIA</h1>
            <br /><span className="text-primary text-xl absolute bottom-0 right-90">bots</span>
          </div>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-base-content/78">
            Agricultural robotics systems being built to extend CropAutonomy
            from cloud intelligence into field-capable autonomous devices.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="btn btn-primary" href="#updates">
              Follow development
            </a>
            <a className="btn btn-outline" href="https://cropautonomy.com">
              Visit CropAutonomy
            </a>
          </div>
        </div>

        <div className="grid gap-4">
          {devices.map((device) => (
            <article className="gaia-panel rounded-box p-6" key={device.name}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-semibold text-neutral">{device.name}</h2>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                    {device.type}
                  </p>
                </div>
                <span className="badge badge-outline">concept</span>
              </div>
              <p className="mt-5 text-lg leading-8 text-base-content/72">
                {device.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-base-300 bg-base-100/70 py-16">
        <div className="gaia-container grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Knowledge base direction
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-neutral">
              The future technical home for GAIA devices.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Device family documentation",
              "Setup, safety, and maintenance guidance",
              "Telemetry and diagnostics references",
              "CropAutonomy integration notes"
            ].map((item) => (
              <div className="gaia-panel rounded-box p-5" key={item}>
                <p className="leading-7 text-base-content/75">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gaia-container py-16" id="updates">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-semibold text-neutral">
              Follow GAIA-R and GAIA-D development.
            </h2>
            <p className="mt-4 text-lg leading-8 text-base-content/72">
              Join the update list for hardware progress, collaboration
              opportunities, and early technical documentation.
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
        <select className="select select-bordered" name="interest" defaultValue="robotics_collaborator">
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
      <input name="source" type="hidden" value="gaiabots.ai" />
      <button className="btn btn-primary mt-5 w-full sm:w-auto" type="submit">
        Request updates
      </button>
    </form>
  );
}
