import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CameraIcon, StatusPill } from "@gaia/ui";
import {
  ApiError,
  getCapture,
  listMyTeams,
  listTeams,
  type Annotation,
  type CaptureSummary,
  type Finding
} from "../../../../lib/api";
import { DownloadButton } from "../../_components/DownloadButton";
import { dateFormat, mediaLabel, statusDisplay } from "../captureDisplay";
import { PlantName } from "../PlantName";
import { AnalysisViewedTracker } from "./AnalysisViewedTracker";
import { CaptureDetailsEditor } from "./CaptureDetailsEditor";
import { CaptureFindings } from "./CaptureFindings";
import { CaptureImage } from "./CaptureImage";

// Per-capture detail page reached from the "See more" button in the captures
// lightbox. Header is the identified plant name; below it an editable
// description, the capture metadata, and a bottom bar of other captures of the
// same plant. Data comes from GET /v1/captures/{id} (capture + related).
export const dynamic = "force-dynamic";

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export default async function CaptureDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let capture: CaptureSummary;
  let related: CaptureSummary[] = [];
  let findings: Finding[] = [];
  let annotations: Annotation[] = [];
  let canAnnotate = false;
  // Team-name lookup for the capture's teamIds. listTeams needs teams.read
  // (admins/managers); listMyTeams is always readable and covers the common case
  // where the viewer is on the capture's team. Merge both, best-effort.
  const teamNames = new Map<string, string>();
  try {
    const [result, allTeams, myTeams] = await Promise.all([
      getCapture(id, { relatedLimit: 24 }),
      listTeams().catch(() => null),
      listMyTeams().catch(() => ({ teams: [] }))
    ]);
    capture = result.capture;
    related = result.related;
    findings = result.findings;
    annotations = result.annotations;
    canAnnotate = result.canAnnotate;
    for (const t of allTeams?.teams ?? []) teamNames.set(t.id, t.name);
    for (const t of myTeams.teams) if (!teamNames.has(t.id)) teamNames.set(t.id, t.name);
  } catch (err) {
    // A missing/cross-tenant capture is a genuine 404. Any other failure
    // (API 500, unreachable service) shouldn't crash the whole RSC render —
    // degrade to a readable error like the captures list does, surfacing the
    // underlying message instead of a blank "Server Components render" error.
    if (err instanceof ApiError && err.status === 404) notFound();
    const message =
      err instanceof ApiError ? err.message : "Could not reach the captures service.";
    return <CaptureLoadError message={message} />;
  }

  const display = statusDisplay(capture.status, capture.plantType);
  const size = formatSize(capture.sizeBytes);
  // Resolve the capture's team names (ids that don't resolve are dropped).
  const teamLabel = capture.teamIds
    .map((tid) => teamNames.get(tid))
    .filter((n): n is string => !!n)
    .join(", ");
  // Issue findings (disease/pest/nutrient/…); 'plant' species/object detections
  // are represented by the header/metadata, not the findings panel/overlay. The
  // same array feeds the panel and the image overlay so their numbering agrees.
  const issueFindings = findings.filter((f) => f.findingType !== "plant");

  return (
    <div className="flex flex-col gap-7">
      <AnalysisViewedTracker captureId={capture.id} />
      {/* Back to the captures list */}
      <Link
        href="/captures"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-base-content/60 transition-colors hover:text-neutral"
      >
        <ArrowRight size={16} className="rotate-180" />
        Back to captures
      </Link>

      {/* Header: plant name */}
      <header className="flex flex-col gap-2 border-b border-base-content/10 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          {display.pill ? <StatusPill label={display.pill.label} tone={display.pill.tone} /> : null}
          <span className="text-sm text-base-content/55">
            Captured {dateFormat.format(new Date(capture.capturedAt))}
          </span>
        </div>
        <h1
          className={`text-3xl font-semibold tracking-tight ${
            display.muted ? "text-base-content/70" : "text-neutral"
          }`}
        >
          <PlantName
            scientific={capture.plantType}
            common={capture.commonName}
            fallback={display.label}
            variant="stacked"
          />
        </h1>
      </header>

      {/* Image + sidebar */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Image (with fullscreen zoom/pan viewer + finding overlay) */}
        <CaptureImage
          imageUrl={capture.imageUrl}
          alt={capture.plantType ?? "Capture"}
          findings={issueFindings}
        />

        {/* Description + metadata */}
        <div className="flex w-full flex-col gap-6 lg:w-2/5">
          {/* Capture details — auto-filled by the analysis pipeline, editable
              by a reviewer (suggest-then-confirm). */}
          <section className="rounded-xl border border-base-content/10 bg-base-100 p-5">
            <CaptureDetailsEditor
              captureId={capture.id}
              initialSummary={capture.summary}
              initialDetails={capture.details}
              initialObservationType={capture.observationType}
              initialSeverity={capture.severity}
              analyzed={capture.status === "analyzed"}
            />
          </section>

          {/* Per-detection findings (issues), numbered to the image overlay,
              with the confirm loop (confirm / reject / correct / add). */}
          <CaptureFindings
            captureId={capture.id}
            findings={issueFindings}
            annotations={annotations}
            analyzed={capture.status === "analyzed"}
            canAnnotate={canAnnotate}
          />

          <section className="rounded-xl border border-base-content/10 bg-base-100 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-base-content/55">
                Metadata
              </h2>
              {capture.imageUrl ? (
                <DownloadButton captureId={capture.id} variant="button" label="Download" />
              ) : null}
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="flex-shrink-0 text-base-content/55">Plant type</dt>
                <dd className="min-w-0 truncate text-right font-medium text-neutral">
                  {capture.plantType ? (
                    <PlantName
                      scientific={capture.plantType}
                      common={capture.commonName}
                      variant="inline"
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <DetailRow label="Captured" value={dateFormat.format(new Date(capture.capturedAt))} />
              {capture.uploadedAt ? (
                <DetailRow
                  label="Uploaded"
                  value={dateFormat.format(new Date(capture.uploadedAt))}
                />
              ) : null}
              <DetailRow label="Media" value={mediaLabel(capture.mediaType)} />
              {size ? <DetailRow label="Size" value={size} /> : null}
              {capture.farmName ? <DetailRow label="Farm" value={capture.farmName} /> : null}
              {capture.fieldName ? <DetailRow label="Field" value={capture.fieldName} /> : null}
              {capture.zoneName ? <DetailRow label="Zone" value={capture.zoneName} /> : null}
              {teamLabel ? (
                <DetailRow label={capture.teamIds.length > 1 ? "Teams" : "Team"} value={teamLabel} />
              ) : null}
            </dl>
            {capture.statusMessage ? (
              <p className="mt-4 text-sm leading-relaxed text-base-content/65">
                {capture.statusMessage}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {/* Same-plant bottom bar */}
      {capture.plantType ? (
        <SamePlantBar plantType={capture.plantType} related={related} />
      ) : null}
    </div>
  );
}

// Horizontal gallery of other captures sharing this capture's plant name. Each
// tile links to its own detail page. Hidden entirely when there are no siblings.
function SamePlantBar({
  plantType,
  related
}: {
  plantType: string;
  related: CaptureSummary[];
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-base-content/10 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral">
          More <span className="text-base-content/70">{plantType}</span>
        </h2>
        <span className="text-sm text-base-content/55">
          {related.length} {related.length === 1 ? "capture" : "captures"}
        </span>
      </div>
      {related.length === 0 ? (
        <p className="text-sm text-base-content/55">
          No other captures of {plantType} yet.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {related.map((sibling) => (
            <Link
              key={sibling.id}
              href={`/captures/${sibling.id}`}
              className="group relative aspect-square w-32 flex-shrink-0 overflow-hidden rounded-lg border border-base-content/10 bg-base-content/[0.04] transition-colors hover:border-base-content/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {sibling.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset
                <img
                  alt={sibling.plantType ?? "Capture"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  src={sibling.imageUrl}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base-content/30">
                  <CameraIcon size={24} />
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-neutral/70 px-2 py-1 text-[11px] text-base-100">
                {dateFormat.format(new Date(sibling.capturedAt))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// Shown when the capture can't be loaded for any reason other than 404 (API
// error, service unreachable). Keeps a link back to the list and surfaces the
// underlying message so the failure is diagnosable rather than a blank crash.
function CaptureLoadError({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-7">
      <Link
        href="/captures"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-base-content/60 transition-colors hover:text-neutral"
      >
        <ArrowRight size={16} className="rotate-180" />
        Back to captures
      </Link>
      <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
        <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
          Off the grid
        </span>
        <h2 className="text-base font-semibold text-neutral">
          We couldn&apos;t load this capture.
        </h2>
        <p className="max-w-xl text-sm text-base-content/65">
          The capture service didn&apos;t respond. Refresh in a moment — if it keeps happening,
          make sure you have an active organization or try again shortly.
        </p>
        <p className="text-xs text-base-content/40">{message}</p>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-base-content/55">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-neutral" title={value}>
        {value}
      </dd>
    </div>
  );
}
