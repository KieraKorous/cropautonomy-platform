"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { Check, StatusPill } from "@gaia/ui";
import type {
  FieldSummary,
  OrgMember,
  ScoutTaskPriority,
  ScoutTaskStatus,
  ScoutTaskSummary,
  TeamSummary
} from "../../../lib/api";
import { TeamMultiSelect } from "../_components/TeamMultiSelect";
import {
  completeScoutTaskAction,
  createScoutTaskAction,
  deleteScoutTaskAction,
  setScoutTaskTeamAction
} from "./actions";

// A rotating palette for assignee avatars, keyed off the user id so a given
// person keeps the same chip color across rows.
const AVATAR_COLORS = [
  "bg-primary text-primary-content",
  "bg-secondary text-secondary-content",
  "bg-accent text-accent-content"
];

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}

function avatarColor(userId: string | null): string {
  if (!userId) return "bg-base-content/10 text-base-content/60";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash + userId.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

// --- Due-window bucketing --------------------------------------------------

type Bucket = "immediate" | "overdue" | "today" | "week" | "later" | "undated" | "done";
// A due-only bucket, ignoring priority — drives the row's due pill so an
// immediate task still shows "Due today" / "Overdue" alongside its red flag.
type DueBucket = Exclude<Bucket, "immediate">;

const BUCKET_META: Record<Bucket, { title: string }> = {
  immediate: { title: "Immediate" },
  overdue: { title: "Overdue" },
  today: { title: "Due today" },
  week: { title: "This week" },
  later: { title: "Later" },
  undated: { title: "No date set" },
  done: { title: "Done" }
};

function localDateStr(d: Date): string {
  // Local-time YYYY-MM-DD (dueOn is a plain date, compared lexically).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The due-only bucket (ignores priority).
function dueBucketFor(task: ScoutTaskSummary, today: string, weekEnd: string): DueBucket {
  if (task.status === "done") return "done";
  if (!task.dueOn) return "undated";
  if (task.dueOn < today) return "overdue";
  if (task.dueOn === today) return "today";
  if (task.dueOn <= weekEnd) return "week";
  return "later";
}

// --- Sorting / grouping ----------------------------------------------------

type SortMode = "due" | "priority" | "team" | "field";

const SORT_LABELS: Record<SortMode, string> = {
  due: "Due date",
  priority: "Priority",
  team: "Team",
  field: "Field"
};

// A rendered section: a heading + its tasks. `accent` red-tints the header
// (Immediate). The row-level red border is independent (keyed off the task's
// own priority), so immediate tasks stay flagged in every sort mode.
interface Group {
  key: string;
  title: string;
  accent: boolean;
  items: ScoutTaskSummary[];
}

const PRIORITY_RANK: Record<string, number> = {
  immediate: 0,
  high: 1,
  normal: 2,
  low: 3
};

function priorityRank(p: string | null): number {
  return p ? (PRIORITY_RANK[p] ?? 2) : 2;
}

// Within-section order: highest priority first, then soonest due (undated last),
// then newest. Shared by every sort mode.
function compareActive(a: ScoutTaskSummary, b: ScoutTaskSummary): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const da = a.dueOn ?? "9999-12-31";
  const db = b.dueOn ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

// Build the sections for a sort mode. Done tasks always land in a trailing
// "Done" section, regardless of mode, so completed walk-outs stay out of the way.
function buildGroups(
  tasks: ScoutTaskSummary[],
  mode: SortMode,
  ctx: { today: string; weekEnd: string; teams: TeamSummary[]; fieldName: Map<string, string> }
): Group[] {
  const active = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const groups: Group[] = [];
  const push = (key: string, title: string, items: ScoutTaskSummary[], accent = false) => {
    if (items.length) groups.push({ key, title, accent, items: [...items].sort(compareActive) });
  };

  if (mode === "due") {
    // Immediate floats above the due windows; the rest group by due window.
    const immediate = active.filter((t) => t.priority === "immediate");
    push("immediate", "Immediate", immediate, true);
    const rest = active.filter((t) => t.priority !== "immediate");
    const byBucket = new Map<DueBucket, ScoutTaskSummary[]>();
    for (const t of rest) {
      const b = dueBucketFor(t, ctx.today, ctx.weekEnd);
      byBucket.set(b, [...(byBucket.get(b) ?? []), t]);
    }
    for (const b of ["overdue", "today", "week", "later", "undated"] as DueBucket[]) {
      push(b, BUCKET_META[b].title, byBucket.get(b) ?? []);
    }
  } else if (mode === "priority") {
    const byPriority = new Map<string, ScoutTaskSummary[]>();
    for (const t of active) {
      const p = t.priority ?? "normal";
      byPriority.set(p, [...(byPriority.get(p) ?? []), t]);
    }
    push("immediate", "Immediate", byPriority.get("immediate") ?? [], true);
    push("high", "High", byPriority.get("high") ?? []);
    push("normal", "Normal", byPriority.get("normal") ?? []);
    push("low", "Low", byPriority.get("low") ?? []);
  } else if (mode === "team") {
    // A task appears under each team it's filed on; unassigned tasks group under
    // "No team". Team order follows the org's team list.
    for (const team of ctx.teams) {
      push(`team:${team.id}`, team.name, active.filter((t) => t.teamIds.includes(team.id)));
    }
    push("team:none", "No team", active.filter((t) => t.teamIds.length === 0));
  } else {
    // field
    const byField = new Map<string, ScoutTaskSummary[]>();
    for (const t of active) {
      const key = t.fieldId ?? "";
      byField.set(key, [...(byField.get(key) ?? []), t]);
    }
    const named = [...byField.keys()]
      .filter((k) => k !== "")
      .sort((a, b) =>
        (ctx.fieldName.get(a) ?? "").localeCompare(ctx.fieldName.get(b) ?? "")
      );
    for (const fid of named) {
      push(`field:${fid}`, ctx.fieldName.get(fid) ?? "Unknown field", byField.get(fid) ?? []);
    }
    push("field:none", "No field", byField.get("") ?? []);
  }

  if (done.length) {
    groups.push({
      key: "done",
      title: "Done",
      accent: false,
      items: [...done].sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1)
    });
  }
  return groups;
}

// Pill tone for a due window (only used on non-done tasks).
function duePill(bucket: DueBucket): { label: string; tone: "accent" | "primary" | "muted" } | null {
  switch (bucket) {
    case "overdue":
      return { label: "Overdue", tone: "accent" };
    case "today":
      return { label: "Due today", tone: "accent" };
    case "week":
      return { label: "This week", tone: "primary" };
    default:
      return null;
  }
}

export function ScoutListView({
  tasks,
  orgId,
  teams,
  members,
  fields,
  canAssignTeams,
  canManage,
  canComplete
}: {
  tasks: ScoutTaskSummary[];
  orgId: string;
  teams: TeamSummary[];
  members: OrgMember[];
  fields: FieldSummary[];
  canAssignTeams: boolean;
  canManage: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();

  // Live scout-task feed: create/update/complete elsewhere publishes
  // scout.task.changed on this channel. Debounced so a burst coalesces.
  const { latest } = useRealtimeChannel(channels.orgScoutTasks(orgId), {
    historyLimit: 1,
    enabled: Boolean(orgId)
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!latest || latest.type !== "scout.task.changed") return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [latest, router]);

  const fieldName = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) map.set(f.id, f.name);
    return map;
  }, [fields]);

  // "today"/"weekEnd" are the viewer's local dates — computed once so both the
  // grouping and each row's due pill agree.
  const { today, weekEnd } = useMemo(() => {
    const t = localDateStr(new Date());
    const week = new Date();
    week.setDate(week.getDate() + 6);
    return { today: t, weekEnd: localDateStr(week) };
  }, []);

  const [sortMode, setSortMode] = useState<SortMode>("due");

  const grouped = useMemo(
    () => buildGroups(tasks, sortMode, { today, weekEnd, teams, fieldName }),
    [tasks, sortMode, today, weekEnd, teams, fieldName]
  );

  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="whitespace-nowrap text-xs font-medium text-base-content/55">
            Sort by
          </span>
          <div className="inline-flex items-center gap-1 rounded-lg border border-base-content/10 bg-base-200/60 p-1">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => {
              const active = sortMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSortMode(m)}
                  aria-pressed={active}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-base-100 text-neutral shadow-sm"
                      : "text-base-content/60 hover:text-neutral"
                  }`}
                >
                  {SORT_LABELS[m]}
                </button>
              );
            })}
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90"
          >
            {showForm ? "Cancel" : "+ New task"}
          </button>
        ) : null}
      </div>

      {showForm && canManage ? (
        <NewTaskForm
          members={members}
          fields={fields}
          teams={teams}
          canAssignTeams={canAssignTeams}
          onDone={() => setShowForm(false)}
        />
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState />
      ) : (
        grouped.map((group) => (
          <section
            key={group.key}
            className={`overflow-hidden rounded-xl border bg-base-100 ${
              group.accent ? "border-error/50" : "border-base-content/10"
            }`}
          >
            <header
              className={`flex items-center justify-between border-b px-5 py-3 ${
                group.accent ? "border-error/30 bg-error/[0.04]" : "border-base-content/10"
              }`}
            >
              <h2
                className={`text-sm font-semibold ${
                  group.accent ? "text-error" : "text-neutral"
                }`}
              >
                {group.title}
              </h2>
              <span className="text-xs text-base-content/45">{group.items.length}</span>
            </header>
            <ul>
              {group.items.map((task, idx) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  weekEnd={weekEnd}
                  last={idx === group.items.length - 1}
                  fieldName={task.fieldId ? (fieldName.get(task.fieldId) ?? null) : null}
                  teams={teams}
                  canAssignTeams={canAssignTeams}
                  canManage={canManage}
                  canComplete={canComplete}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function TaskRow({
  task,
  today,
  weekEnd,
  last,
  fieldName,
  teams,
  canAssignTeams,
  canManage,
  canComplete
}: {
  task: ScoutTaskSummary;
  today: string;
  weekEnd: string;
  last: boolean;
  fieldName: string | null;
  teams: TeamSummary[];
  canAssignTeams: boolean;
  canManage: boolean;
  canComplete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyTeam, setBusyTeam] = useState<string | null>(null);
  const done = task.status === "done";
  const immediate = task.priority === "immediate" && !done;

  const meta = [
    task.assignee?.displayName ?? "Unassigned",
    fieldName,
    task.captureCount > 0
      ? `${task.captureCount} ${task.captureCount === 1 ? "capture" : "captures"} collected`
      : null
  ]
    .filter(Boolean)
    .join(" · ");

  // The due pill reflects the task's own due date even when it's grouped under
  // Immediate.
  const pill = duePill(dueBucketFor(task, today, weekEnd));

  function toggleStatus() {
    if (!canComplete || pending) return;
    // Not done → done; done → back to open. in_progress → done.
    const next: ScoutTaskStatus = done ? "open" : "done";
    startTransition(() => void completeScoutTaskAction(task.id, next));
  }

  function onToggleTeam(teamId: string, assigned: boolean) {
    setBusyTeam(teamId);
    startTransition(async () => {
      await setScoutTaskTeamAction(task.id, teamId, assigned);
      setBusyTeam(null);
    });
  }

  function onDelete() {
    if (!canManage || pending) return;
    startTransition(() => void deleteScoutTaskAction(task.id));
  }

  return (
    <li
      className={`flex items-start gap-3.5 py-3.5 pr-5 ${pending ? "opacity-60" : ""} ${
        last ? "" : "border-b border-base-content/[0.06]"
      } ${
        immediate
          ? "border-l-4 border-l-error bg-error/[0.03] pl-4"
          : "border-l-4 border-l-transparent pl-4"
      }`}
    >
      <button
        type="button"
        onClick={toggleStatus}
        disabled={!canComplete || pending}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`mt-0.5 flex-shrink-0 ${canComplete ? "cursor-pointer" : "cursor-default"}`}
      >
        <ScoutCheckbox status={task.status} />
      </button>

      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(
          task.assignee?.userId ?? null
        )}`}
        title={task.assignee?.displayName ?? "Unassigned"}
      >
        {initials(task.assignee?.displayName ?? null)}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm font-medium ${
              done ? "text-base-content/55 line-through" : "text-neutral"
            }`}
          >
            {task.title}
          </span>
          {immediate ? (
            <span className="rounded-full bg-error px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-content">
              Immediate
            </span>
          ) : task.priority === "high" && !done ? (
            <span className="rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error">
              High
            </span>
          ) : null}
          {task.status === "in_progress" ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              In progress
            </span>
          ) : null}
        </div>
        {meta ? <span className="text-xs text-base-content/55">{meta}</span> : null}
        {task.details ? (
          <span className="text-xs leading-relaxed text-base-content/45">{task.details}</span>
        ) : null}
        {canAssignTeams ? (
          <div className="mt-1 max-w-xs">
            <TeamMultiSelect
              teams={teams}
              selectedIds={task.teamIds}
              busyId={busyTeam}
              subjectLabel="task"
              inline
              onToggle={onToggleTeam}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        {pill && !done ? (
          <StatusPill label={pill.label} tone={pill.tone} />
        ) : done && task.completedAt ? (
          <span className="text-xs text-base-content/45">Done</span>
        ) : null}
        {canManage ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label="Delete task"
            className="text-base-content/35 transition-colors hover:text-error"
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ScoutCheckbox({ status }: { status: ScoutTaskStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded border-[1.5px] border-success bg-success/15">
        <Check className="text-success" size={10} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded border-[1.5px] border-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      </span>
    );
  }
  return <span className="block h-4 w-4 rounded border-[1.5px] border-base-content/30" />;
}

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-10">
      <h2 className="text-base font-semibold text-neutral">Nothing on the board today.</h2>
      <p className="max-w-xl text-sm text-base-content/60">
        When walk-outs and checks are assigned to the crew, they show up here — grouped by when
        they&apos;re due.
      </p>
    </section>
  );
}

// --- New task form ---------------------------------------------------------

function NewTaskForm({
  members,
  fields,
  teams,
  canAssignTeams,
  onDone
}: {
  members: OrgMember[];
  fields: FieldSummary[];
  teams: TeamSummary[];
  canAssignTeams: boolean;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [priority, setPriority] = useState<ScoutTaskPriority>("normal");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!title.trim()) {
      setError("A task needs a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createScoutTaskAction({
          title: title.trim(),
          details: details.trim() || null,
          assigneeUserId: assigneeUserId || null,
          fieldId: fieldId || null,
          dueOn: dueOn || null,
          priority,
          teamIds: teamIds.length ? teamIds : undefined
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the task.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-5">
      <h2 className="text-sm font-semibold text-neutral">New scout task</h2>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-base-content/65">Task</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Walk Doniphan F-22 and confirm the tar spot pattern."
          className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none focus:border-primary/50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-base-content/65">Notes (optional)</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="What to look for, context, anything the scout should know."
          className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none focus:border-primary/50"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/65">Assignee</span>
          <select
            value={assigneeUserId}
            onChange={(e) => setAssigneeUserId(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-2.5 py-2 text-sm text-neutral outline-none focus:border-primary/50"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.email ?? m.userId}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/65">Field</span>
          <select
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-2.5 py-2 text-sm text-neutral outline-none focus:border-primary/50"
          >
            <option value="">No field</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/65">Due date</span>
          <input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-2.5 py-2 text-sm text-neutral outline-none focus:border-primary/50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/65">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as ScoutTaskPriority)}
            className="rounded-md border border-base-content/15 bg-base-100 px-2.5 py-2 text-sm text-neutral outline-none focus:border-primary/50"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="immediate">Immediate</option>
          </select>
        </label>
      </div>

      {canAssignTeams ? (
        <div className="max-w-xs">
          <TeamMultiSelect
            teams={teams}
            selectedIds={teamIds}
            busyId={null}
            subjectLabel="task"
            inline
            onToggle={(teamId, assigned) =>
              setTeamIds((prev) =>
                assigned ? [...prev, teamId] : prev.filter((t) => t !== teamId)
              )
            }
          />
        </div>
      ) : null}

      {error ? <p className="text-xs text-error">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create task"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-sm font-medium text-base-content/55 transition-colors hover:text-neutral"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
