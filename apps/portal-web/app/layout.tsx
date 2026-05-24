import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "CropAutonomy Portal",
  description: "Operations dashboard for CropAutonomy customers."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html data-theme="gaia-field" lang="en">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
