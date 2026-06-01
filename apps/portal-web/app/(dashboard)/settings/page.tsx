import { ApiError, listDiscardedCaptures, type CaptureSummary } from "../../../lib/api";
import { DiscardedCaptures } from "./DiscardedCaptures";

// First real settings surface. Organized as stacked sections so more settings
// (org, members, integrations) can be added later without restructuring.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let discarded: CaptureSummary[] = [];
  let loadError: string | null = null;

  try {
    const result = await listDiscardedCaptures();
    discarded = result.captures;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the captures service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-1.5 border-b border-base-content/10 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral">Settings</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
          Manage your organization&apos;s data and preferences.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Discarded captures</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Captures you discard are hidden from the captures list but kept in storage. Permanently
            delete them here to free up space — this removes the image and cannot be undone.
          </p>
        </div>

        {loadError ? (
          <p className="text-sm text-error">{loadError}</p>
        ) : (
          <DiscardedCaptures captures={discarded} />
        )}
      </section>
    </div>
  );
}
