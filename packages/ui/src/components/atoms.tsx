import type { ReactNode } from "react";
import { Check } from "./icons";

export type Tone = "primary" | "accent" | "secondary" | "success" | "muted";

const pillTones: Record<Tone, { bg: string; dot: string; text: string }> = {
  primary: { bg: "bg-primary/10", dot: "bg-primary", text: "text-primary" },
  accent: { bg: "bg-accent/15", dot: "bg-accent", text: "text-accent" },
  secondary: { bg: "bg-secondary/15", dot: "bg-secondary", text: "text-secondary" },
  success: { bg: "bg-success/15", dot: "bg-success", text: "text-success" },
  muted: { bg: "bg-base-content/10", dot: "bg-base-content/50", text: "text-base-content/60" }
};

export function StatusPill({ label, tone = "primary" }: { label: string; tone?: Tone }) {
  const s = pillTones[tone];
  return (
    <span
      className={`inline-flex h-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

export type IconBadgeTone = "primary" | "accent" | "muted-light";
export type IconBadgeSize = "sm" | "md" | "lg";

const badgeSizes: Record<IconBadgeSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12"
};

const badgeTones: Record<IconBadgeTone, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "border border-accent/35 bg-accent/15 text-accent",
  "muted-light": "border border-base-100/20 bg-base-100/5 text-base-100"
};

export function IconBadge({
  children,
  tone = "primary",
  size = "md"
}: {
  children: ReactNode;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
}) {
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center rounded-lg ${badgeSizes[size]} ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export type CheckListProps = {
  items: ReactNode[];
  tone?: "default" | "light";
  size?: "sm" | "md";
};

export function CheckList({ items, tone = "default", size = "sm" }: CheckListProps) {
  const checkColor = tone === "light" ? "text-leaf-soft" : "text-primary";
  const textColor = tone === "light" ? "text-neutral-content/85" : "text-neutral";
  const listGap = size === "md" ? "gap-3.5" : "gap-2.5";
  const itemGap = size === "md" ? "gap-3" : "gap-2";
  const textSize = size === "md" ? "text-base" : "text-sm";
  const checkSize = size === "md" ? 18 : 14;
  return (
    <ul className={`flex flex-col ${listGap}`}>
      {items.map((item, idx) => (
        <li className={`flex items-center ${itemGap} ${textSize} ${textColor}`} key={idx}>
          <Check className={checkColor} size={checkSize} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export type FeatureRowProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

export function FeatureRow({ icon, title, body }: FeatureRowProps) {
  return (
    <div className="flex gap-4">
      <IconBadge size="sm">{icon}</IconBadge>
      <div>
        <h3 className="mb-1 text-base font-semibold text-neutral">{title}</h3>
        <p className="text-sm leading-6 text-base-content/70">{body}</p>
      </div>
    </div>
  );
}
