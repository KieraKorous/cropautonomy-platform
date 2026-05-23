import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "CropAutonomy | Autonomous Agricultural Intelligence",
  description:
    "CropAutonomy is an autonomous agricultural intelligence platform for farms, fields, and future robotics-enabled operations."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="gaia-field">
      <body>{children}</body>
    </html>
  );
}
