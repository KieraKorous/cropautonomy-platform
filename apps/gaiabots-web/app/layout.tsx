import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "GAIABots | Agricultural Robotics in Development",
  description:
    "GAIABots is developing GAIA-R and GAIA-D, upcoming robotics systems for autonomous agricultural intelligence."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="gaia-field">
      <body>{children}</body>
    </html>
  );
}
