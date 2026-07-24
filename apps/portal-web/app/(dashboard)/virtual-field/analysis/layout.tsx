import type { ReactNode } from "react";
import { OfflineBanner } from "./_components/OfflineBanner";

// Wraps every /virtual-field/analysis route so the offline banner shows on all of
// them (hub, field, plant, admin, backup) without repeating it per page.
export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <OfflineBanner />
      {children}
    </div>
  );
}
