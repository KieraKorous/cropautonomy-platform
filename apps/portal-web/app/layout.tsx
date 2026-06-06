import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PortalAnalyticsProvider } from "./analytics-provider";
import { MissingEnvScreen } from "./missing-env-screen";

export const metadata: Metadata = {
  title: "CropAutonomy Portal",
  description: "Operations dashboard for CropAutonomy customers."
};

// Force per-request rendering so the env check below reads from the running
// container's process.env, not the build-time env. Without this the layout is
// statically prerendered during `next build` inside the Docker image — where
// CLERK_SECRET_KEY is intentionally not a build arg — and bakes the
// MissingEnvScreen into the static HTML even when the running pod has the
// secret set.
export const dynamic = "force-dynamic";

// Read on the server at request time. Setting these in apps/portal-web/.env.local
// is enough; see CLERK_SETUP.md for what to put in them.
function checkClerkEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
    missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!process.env.CLERK_SECRET_KEY) missing.push("CLERK_SECRET_KEY");
  return missing;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const missing = checkClerkEnv();

  if (missing.length > 0) {
    return (
      <html data-theme="gaia-field" lang="en">
        <body className="antialiased">
          <MissingEnvScreen missing={missing} />
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider>
      <html data-theme="gaia-field" lang="en">
        <body className="antialiased">
          <PortalAnalyticsProvider>{children}</PortalAnalyticsProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
