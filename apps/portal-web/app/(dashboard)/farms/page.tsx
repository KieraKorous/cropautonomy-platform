import {
  ApiError,
  listFarms,
  listFields,
  type FarmSummary,
  type FieldSummary
} from "../../../lib/api";
import { FarmsView } from "./FarmsView";

// Farms — the top of the land hierarchy (org → farm → field → zone). Lists the
// org's farms and lets managers create, edit, and delete them. Each card shows a
// map preview of the farm's fields.
export const dynamic = "force-dynamic";

export default async function FarmsPage() {
  let farms: FarmSummary[] = [];
  let fields: FieldSummary[] = [];
  let canManage = false;
  let loadError: string | null = null;

  try {
    // Fields feed each farm card's map preview (drawn as gray outlines).
    const [farmsResult, fieldsResult] = await Promise.all([listFarms(), listFields()]);
    farms = farmsResult.farms;
    canManage = farmsResult.canManage;
    fields = fieldsResult.fields;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the farms service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Farms</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Every operation under management, from the home quarter to leased ground. Fields and
            zones live inside a farm.
          </p>
        </div>
        {!loadError && farms.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {farms.length} {farms.length === 1 ? "farm" : "farms"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <FarmsView farms={farms} fields={fields} canManage={canManage} />
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Off the grid
      </span>
      <h2 className="text-base font-semibold text-neutral">Can&apos;t reach your ground.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Farms aren&apos;t loading right now. Refresh in a moment — if it keeps happening, make sure
        you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
