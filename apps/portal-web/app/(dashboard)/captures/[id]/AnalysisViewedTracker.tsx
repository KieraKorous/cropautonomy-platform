"use client";

// Fires scan_analysis_viewed once when the capture detail page mounts. The page
// itself is a server component, so this tiny client child carries the event.
// The detail page (not the captures lightbox) is the authoritative analysis view,
// so tracking here keeps the count meaningful rather than firing on every
// gallery preview.

import { capture } from "@gaia/analytics";
import { useEffect } from "react";

export function AnalysisViewedTracker({ captureId }: { captureId: string }) {
  useEffect(() => {
    capture("scan_analysis_viewed", { captureId });
  }, [captureId]);

  return null;
}
