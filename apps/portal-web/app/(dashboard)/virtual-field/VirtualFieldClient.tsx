"use client";

import dynamic from "next/dynamic";

// WebGL is client-only, so pull the simulator in with ssr:false. This wrapper
// exists purely to hold that dynamic import (a Server Component can't pass
// ssr:false). The fallback keeps the layout stable while the 3D bundle loads.
const VirtualField = dynamic(
  () => import("@gaia/virtual-field").then((m) => m.VirtualField),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-base-200">
        <div className="flex flex-col items-center gap-3 text-base-content/60">
          <span className="loading loading-ring loading-lg text-primary" />
          <span className="text-xs uppercase tracking-[0.14em]">Loading simulator…</span>
        </div>
      </div>
    )
  }
);

export function VirtualFieldClient() {
  return <VirtualField />;
}
