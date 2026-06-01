import { DevicesGrid } from "./DevicesGrid";

// Devices — the GAIA fleet registry. v0 is a UI placeholder: a grid-only view
// that starts empty with an "add device" tile. Registration and live device
// data land once the devices API is wired up.
export default function DevicesPage() {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Devices</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Register and monitor the GAIA fleet — rovers, drones, and sensor stations working your
            fields.
          </p>
        </div>
      </header>

      <DevicesGrid />
    </div>
  );
}
