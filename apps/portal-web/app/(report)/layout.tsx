import type { ReactNode } from "react";

// Standalone shell for exportable report documents. Deliberately omits the app
// sidebar/topbar (AppShell) so the page reads — and prints — as a clean
// document. Sits under the root layout (ClerkProvider + <html>/<body>); auth is
// enforced globally by proxy.ts, so no extra guard is needed here. First user is
// reports/weekly (the Overview's "Export weekly").
export default function ReportLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-base-200 text-base-content">{children}</div>;
}
