import { ApiError, listDevices, type Device } from "../../../lib/api";
import { DevicesGrid } from "./DevicesGrid";

// Devices — the GAIA fleet registry. Lists the org's registered devices (paired
// phones today, the GAIA fleet next) and lets operators rename, retire, and
// deregister them. Adding a device keeps it on this page.
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  let devices: Device[] = [];
  let canManage = false;
  let loadError: string | null = null;

  try {
    const result = await listDevices();
    devices = result.devices;
    canManage = result.canManage;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the devices service.";
  }

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
        {!loadError && devices.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {devices.length} {devices.length === 1 ? "device" : "devices"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <DevicesGrid devices={devices} canManage={canManage} />
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Couldn&apos;t load devices
      </span>
      <h2 className="text-base font-semibold text-neutral">{message}</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Confirm{" "}
        <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">
          NEXT_PUBLIC_API_BASE_URL
        </code>{" "}
        points at a running API and that you have an active organization.
      </p>
    </section>
  );
}
