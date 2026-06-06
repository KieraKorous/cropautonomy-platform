import "./globals.css";

import { AnalyticsProvider } from "@gaia/analytics/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer, Header, type FooterProps, type HeaderProps } from "@gaia/ui";

export const metadata: Metadata = {
  title: "GAIAbots | Agricultural Robotics in Development",
  description:
    "GAIAbots is developing GAIA-R and GAIA-D, upcoming robotics systems for autonomous agricultural intelligence."
};

const headerConfig: HeaderProps = {
  brand: "gaiabots",
  source: "gaiabots.ai",
  navLinks: [
    { label: "Devices", href: "#devices" },
    { label: "GAIA-R", href: "#devices" },
    { label: "GAIA-D", href: "#devices" },
    { label: "Knowledge base", href: "#knowledge-base" },
    { label: "About", href: "#" }
  ],
  sisterBrand: { label: "CropAutonomy", href: "https://cropautonomy.com" },
  cta: { label: "Follow development", href: "#updates" },
  ctaTone: "neutral"
};

const footerConfig: FooterProps = {
  brand: "gaiabots",
  tagline:
    "Agricultural robotics for the CropAutonomy ecosystem. Building GAIA-R, GAIA-D, and the device families that will work the next generation of fields.",
  domain: "gaiabots.ai",
  copyright: "© 2026 GAIAbots. Hardware in the field.",
  columns: [
    {
      title: "Devices",
      links: [
        { label: "GAIA-R rover", href: "#devices" },
        { label: "GAIA-D drone", href: "#devices" },
        { label: "Future families", href: "#future" },
        { label: "Roadmap", href: "#" }
      ]
    },
    {
      title: "For builders",
      links: [
        { label: "For farms", href: "#updates" },
        { label: "For research partners", href: "#updates" },
        { label: "For integrators", href: "#updates" },
        { label: "For robotics teams", href: "#updates" }
      ]
    },
    {
      title: "Ecosystem",
      links: [
        { label: "CropAutonomy.com →", href: "https://cropautonomy.com" },
        { label: "Knowledge base", href: "#knowledge-base" },
        { label: "Telemetry & integration", href: "#connect" },
        { label: "Field deployment", href: "#knowledge-base" }
      ]
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#" },
        { label: "Vision", href: "#" },
        { label: "Contact", href: "#updates" },
        { label: "Privacy", href: "#" }
      ]
    }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-theme="gaia-field" lang="en">
      <body className="min-h-screen bg-base-100 text-neutral antialiased">
        <AnalyticsProvider
          apiKey={process.env.NEXT_PUBLIC_POSTHOG_KEY}
          apiHost={process.env.NEXT_PUBLIC_POSTHOG_HOST}
          pageviewEvent="public_page_viewed"
          pageviewProperties={{ source: "gaiabots.ai" }}
        >
          <Header {...headerConfig} />
          <main>{children}</main>
          <Footer {...footerConfig} />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
