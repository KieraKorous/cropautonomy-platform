import { ApiError, listDiscardedCaptures, type CaptureSummary } from "../../../lib/api";
import { DiscardedCaptures } from "./DiscardedCaptures";
import { PlantNameSetting } from "./PlantNameSetting";

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
          <h2 className="text-base font-semibold text-neutral">Display</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Choose which plant name to show as the primary label across the captures list and
            detail views. Both names are always shown on a capture&apos;s detail page; this picks
            which one leads.
          </p>
        </div>
        <PlantNameSetting />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Discarded items</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Captures and recordings you discard are hidden from their lists but kept in storage.
            Recover them, or permanently delete them here to free up space — deletion removes the
            file and cannot be undone.
          </p>
        </div>

        {loadError ? (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
            <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
              Off the grid
            </span>
            <h2 className="text-base font-semibold text-neutral">
              We&apos;ve lost the line to the field.
            </h2>
            <p className="max-w-xl text-sm text-base-content/65">
              Discarded items aren&apos;t loading right now. Refresh in a moment — if it keeps
              happening, make sure you have an active organization or try again shortly.
            </p>
            <p className="text-xs text-base-content/40">{loadError}</p>
          </section>
        ) : (
          <DiscardedCaptures captures={discarded} />
        )}
      </section>
    </div>
  );
}
