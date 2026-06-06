import "./globals.css";

import { AnalyticsProvider } from "@gaia/analytics/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer, Header, type FooterProps, type HeaderProps } from "@gaia/ui";

export const metadata: Metadata = {
  title: "CropAutonomy | Autonomous Agricultural Intelligence",
  description:
    "CropAutonomy is an autonomous agricultural intelligence platform for farms, fields, and future robotics-enabled operations."
};

const headerConfig: HeaderProps = {
  brand: "cropautonomy",
  source: "cropautonomy.com",
  navLinks: [
    { label: "Platform", href: "#platform" },
    { label: "For farms", href: "#audiences" },
    { label: "For research", href: "#audiences" },
    { label: "Roadmap", href: "#roadmap" },
    { label: "About", href: "#" }
  ],
  sisterBrand: { label: "GAIAbots", href: "https://gaiabots.ai" },
  cta: { label: "Request access", href: "#early-access" }
};

const footerConfig: FooterProps = {
  brand: "cropautonomy",
  tagline:
    "Autonomous agricultural intelligence for farms, fields, and the next generation of crop operations.",
  domain: "cropautonomy.com",
  copyright: "© 2026 CropAutonomy. Built in the field.",
  columns: [
    {
      title: "Platform",
      links: [
        { label: "Crop scans", href: "#platform" },
        { label: "AI analysis", href: "#platform" },
        { label: "Devices & robotics", href: "#platform" },
        { label: "Roadmap", href: "#roadmap" }
      ]
    },
    {
      title: "Audiences",
      links: [
        { label: "For farms", href: "#audiences" },
        { label: "For research", href: "#audiences" },
        { label: "For agricultural businesses", href: "#audiences" },
        { label: "For robotics collaborators", href: "#audiences" }
      ]
    },
    {
      title: "Ecosystem",
      links: [
        { label: "GAIAbots.ai →", href: "https://gaiabots.ai" },
        { label: "GAIA-R rover", href: "https://gaiabots.ai" },
        { label: "GAIA-D drone", href: "https://gaiabots.ai" },
        { label: "Knowledge base", href: "https://gaiabots.ai" }
      ]
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#" },
        { label: "Vision", href: "#" },
        { label: "Contact", href: "#early-access" },
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
          pageviewProperties={{ source: "cropautonomy.com" }}
        >
          <Header {...headerConfig} />
          <main>{children}</main>
          <Footer {...footerConfig} />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
