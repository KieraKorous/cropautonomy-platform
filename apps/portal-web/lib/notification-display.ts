import type { Tone } from "@gaia/ui";

// Compact relative time for the notification feed (e.g. "3 min ago", "Just now").
// Notification-specific twin of deviceDisplay.formatRelativeTime — no "Never"
// case (a notification always has a created_at).
export function timeAgo(value: string): string {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.round(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// The calendar-day bucket ("Today" / "Yesterday" / "12 Mar") a notification
// belongs to, for the full page's grouped list.
export function dayGroupLabel(value: string): string {
  const then = new Date(value);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Presentation for a notification `type`: a short glyph, an accent tone, and a
// human category label. Unknown types fall back to a neutral bell.
export interface NotificationVisual {
  glyph: string;
  tone: Tone;
  category: string;
}

// Static class strings for the icon bubble, one per tone. Kept literal so
// Tailwind's compile-time scan keeps them (a `toned-${tone}` template would be
// purged). Mirrors AppShell's navBadgeTones.
export const toneBubbleClasses: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  secondary: "bg-secondary/15 text-secondary",
  success: "bg-success/15 text-success",
  muted: "bg-base-content/10 text-base-content/60"
};

export function notificationVisual(type: string): NotificationVisual {
  switch (type) {
    case "scout_task.completed":
      return { glyph: "✓", tone: "success", category: "Task completed" };
    case "scout_task.assigned":
      return { glyph: "◈", tone: "primary", category: "Task assigned" };
    case "live.request":
      return { glyph: "◉", tone: "accent", category: "Live request" };
    case "live.session.started":
      return { glyph: "◉", tone: "accent", category: "Went live" };
    case "analysis.completed":
      return { glyph: "❋", tone: "success", category: "Analysis" };
    case "analysis.failed":
      return { glyph: "!", tone: "secondary", category: "Analysis" };
    case "analysis.concern":
      return { glyph: "⚠", tone: "secondary", category: "Crop concern" };
    case "member.joined":
      return { glyph: "+", tone: "primary", category: "Member" };
    default:
      return { glyph: "•", tone: "muted", category: "Notification" };
  }
}
