"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TeamSummary } from "../../../lib/api";
import { TeamMultiSelect } from "../_components/TeamMultiSelect";
import { setCaptureTeamAction } from "../captures/actions";

// Per-recording team selector. Recordings are kind='session_recording' captures,
// so team assignment goes through the same capture action. Optimistic; each
// toggle persists immediately (reverts on failure).
export function RecordingTeams({
  recordingId,
  teamIds: initial,
  teams
}: {
  recordingId: string;
  teamIds: string[];
  teams: TeamSummary[];
}) {
  const router = useRouter();
  const [teamIds, setTeamIds] = useState<string[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(teamId: string, assigned: boolean) {
    const prev = teamIds;
    setBusy(teamId);
    setError(null);
    setTeamIds(assigned ? [...prev, teamId] : prev.filter((t) => t !== teamId));
    try {
      await setCaptureTeamAction(recordingId, teamId, assigned);
      router.refresh();
    } catch (err) {
      setTeamIds(prev);
      setError(err instanceof Error ? err.message : "Couldn't update the recording's teams.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-base-content/8 px-2.5 py-2">
      <TeamMultiSelect
        teams={teams}
        selectedIds={teamIds}
        busyId={busy}
        subjectLabel="recording"
        onToggle={onToggle}
      />
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </div>
  );
}
