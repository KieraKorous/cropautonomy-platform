"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MyTeam } from "../../../lib/api";

// A compact team scope selector for entity pages. Reads/writes the `?team=<id>`
// URL param: selecting a team narrows the list to that team's ground, "All
// teams" clears the filter. Renders nothing when the caller belongs to no
// teams (the filter would only offer "All teams").
export function TeamFilter({ teams }: { teams: MyTeam[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (teams.length === 0) return null;

  const current = searchParams.get("team") ?? "";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("team", value);
    else params.delete("team");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-base-content/55">
      <span className="whitespace-nowrap font-medium">Team</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-base-content/15 bg-base-100 px-2.5 py-1.5 text-sm text-neutral outline-none transition-colors focus:border-primary/50"
      >
        <option value="">All teams</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
