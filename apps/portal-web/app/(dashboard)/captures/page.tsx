import { ApiError, listCaptures, type CaptureSummary } from "../../../lib/api";
import { CaptureRow } from "./CaptureRow";

// Captures table — every observation the platform has ingested, newest first.
// Analysis runs asynchronously, so rows reflect in-flight state until a plant
// type lands. See docs/architecture/capture-pipeline.md.
export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  let captures: CaptureSummary[] = [];
  let loadError: string | null = null;

  try {
    const result = await listCaptures({ limit: 50 });
    captures = result.captures;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : "Could not reach the captures service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Captures</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Every photo, burst, and video collected across the operation — from the field app and
            connected devices.
          </p>
        </div>
        {!loadError && captures.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {captures.length} {captures.length === 1 ? "capture" : "captures"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : captures.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-base-content/[0.03] text-xs uppercase tracking-wide text-base-content/55">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Preview</span>
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Captured
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Plant
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {captures.map((capture) => (
                <CaptureRow capture={capture} key={capture.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
        Nothing captured yet
      </span>
      <h2 className="text-base font-semibold text-neutral">No captures to show.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Start a capture session in the field app and photos will appear here as they upload and get
        analyzed.
      </p>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Couldn&apos;t load captures
      </span>
      <h2 className="text-base font-semibold text-neutral">{message}</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Confirm <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_BASE_URL</code>{" "}
        points at a running API and that you have an active organization.
      </p>
    </section>
  );
}
