"use client";

// Anchor that emits a documented public_cta_clicked event before navigating.
// Drop-in replacement for a plain <a> on marketing CTAs — spreads through all
// normal anchor props, so styling/href stay at the call site. `capture()` is a
// no-op when PostHog isn't configured, so this is safe with or without a key.

import { capture } from "@gaia/analytics/client";
import type { LeadSource } from "@gaia/domain";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type CtaLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Stable label for the CTA, e.g. "request_early_access". */
  cta: string;
  /** Where on the page the CTA lives, e.g. "header" | "hero" | "audiences". */
  location: string;
  source: LeadSource;
  children: ReactNode;
};

export function CtaLink({ cta, location, source, onClick, children, ...rest }: CtaLinkProps) {
  return (
    <a
      {...rest}
      onClick={(event) => {
        capture("public_cta_clicked", { cta, location, source });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
