import { VirtualFieldClient } from "./VirtualFieldClient";

// Virtual Field — the browser-based agricultural digital-twin simulator. Phase 1:
// rendered field, camera, lighting, and a placeholder robot with a live HUD. The
// simulator itself lives in @gaia/virtual-field so it can move surfaces later;
// this route just mounts it. Auth-scoped like the rest of the dashboard.
export const dynamic = "force-dynamic";

export default function VirtualFieldPage() {
  return (
    <div className="h-[calc(100vh-7rem)] w-full overflow-hidden rounded-xl border border-base-content/10 bg-base-200">
      <VirtualFieldClient />
    </div>
  );
}
