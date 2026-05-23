import type { ReactNode } from "react";
import { Wordmark, type Brand } from "./Wordmark";
import type { Tone } from "./atoms";

const navBadgeTones: Record<Tone, { bg: string; text: string; dot: string }> = {
  primary: { bg: "bg-primary/15", text: "text-primary", dot: "bg-primary" },
  accent: { bg: "bg-accent/15", text: "text-accent", dot: "bg-accent" },
  secondary: { bg: "bg-secondary/15", text: "text-secondary", dot: "bg-secondary" },
  success: { bg: "bg-success/15", text: "text-success", dot: "bg-success" },
  muted: { bg: "bg-base-content/10", text: "text-base-content/60", dot: "bg-base-content/50" }
};

export type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
  /** Right-side counter (plain text), e.g. "33" or "5 / 6". Mutually exclusive with `badge`. */
  meta?: string;
  /** Right-side badge with tone (colored dot + count). Use for attention items. */
  badge?: { tone: Tone; label: string };
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

export type AppShellOrg = { initials: string; name: string };
export type AppShellUser = { initials: string; name: string };
export type AppShellSearch = { placeholder: string; shortcut?: string };

export type AppShellProps = {
  brand: Brand;
  org: AppShellOrg;
  user: AppShellUser;
  navGroups: NavGroup[];
  search?: AppShellSearch;
  hasNotifications?: boolean;
  sidebarFooter?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  brand,
  org,
  user,
  navGroups,
  search,
  hasNotifications = false,
  sidebarFooter,
  children
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-base-100 text-neutral">
      <AppTopBar
        brand={brand}
        hasNotifications={hasNotifications}
        org={org}
        search={search}
        user={user}
      />
      <div className="flex flex-1 items-stretch">
        <AppSidebar footer={sidebarFooter} navGroups={navGroups} />
        <main className="flex-1 px-10 py-8">{children}</main>
      </div>
    </div>
  );
}

function AppTopBar({
  brand,
  org,
  user,
  search,
  hasNotifications
}: {
  brand: Brand;
  org: AppShellOrg;
  user: AppShellUser;
  search?: AppShellSearch;
  hasNotifications: boolean;
}) {
  return (
    <header className="flex items-center justify-between border-b border-base-content/10 bg-base-100 px-6 py-3.5">
      <div className="flex items-center gap-6">
        <Wordmark brand={brand} href="/" />
        <span className="h-5 w-px bg-base-content/20" />
        <OrgSwitcher org={org} />
      </div>
      <div className="flex items-center gap-2">
        {search && <SearchField placeholder={search.placeholder} shortcut={search.shortcut} />}
        <NotificationsButton hasUnread={hasNotifications} />
        <UserPill user={user} />
      </div>
    </header>
  );
}

function OrgSwitcher({ org }: { org: AppShellOrg }) {
  return (
    <button
      className="flex items-center gap-2 rounded-md bg-base-content/[0.04] px-2.5 py-1.5 text-left hover:bg-base-content/[0.08]"
      type="button"
    >
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded bg-primary text-xs font-semibold text-primary-content">
        {org.initials}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-neutral">{org.name}</span>
      <svg
        fill="none"
        height="13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="13"
        className="text-base-content/55"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function SearchField({ placeholder, shortcut }: { placeholder: string; shortcut?: string }) {
  return (
    <div className="flex min-w-[280px] items-center gap-2 rounded-lg border border-base-content/15 px-3 py-2">
      <svg
        fill="none"
        height="14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="14"
        className="text-base-content/50"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="text-xs text-base-content/45">{placeholder}</span>
      {shortcut && (
        <span className="ml-auto rounded border border-base-content/15 px-1.5 py-px text-xs text-base-content/55">
          {shortcut}
        </span>
      )}
    </div>
  );
}

function NotificationsButton({ hasUnread }: { hasUnread: boolean }) {
  return (
    <button
      aria-label="Notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-base-content/[0.05]"
      type="button"
    >
      <svg
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
        className="text-neutral"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {hasUnread && (
        <span className="absolute right-[9px] top-[8px] h-1.5 w-1.5 rounded-full bg-accent ring-[1.5px] ring-base-100" />
      )}
    </button>
  );
}

function UserPill({ user }: { user: AppShellUser }) {
  return (
    <button
      className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-base-content/[0.05]"
      type="button"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-content">
        {user.initials}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-neutral">{user.name}</span>
    </button>
  );
}

function AppSidebar({
  navGroups,
  footer
}: {
  navGroups: NavGroup[];
  footer?: ReactNode;
}) {
  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-base-content/8 bg-base-200/55 px-3.5 py-6">
      <div className="flex flex-col gap-4">
        {navGroups.map((group, idx) => (
          <SidebarGroup
            group={group}
            key={group.title ?? `nav-group-${idx}`}
            withDivider={idx < navGroups.length - 1}
          />
        ))}
      </div>
      {footer && <div className="mt-auto pt-6">{footer}</div>}
    </aside>
  );
}

function SidebarGroup({ group, withDivider }: { group: NavGroup; withDivider: boolean }) {
  return (
    <div
      className={`flex flex-col gap-0.5 ${withDivider ? "border-b border-base-content/8 pb-4" : ""}`}
    >
      {group.title && (
        <span className="px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-base-content/45">
          {group.title}
        </span>
      )}
      {group.items.map((item) => (
        <SidebarNavItem item={item} key={item.label} />
      ))}
    </div>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const activeClass = item.active
    ? "bg-primary/10 text-primary"
    : "text-neutral hover:bg-base-content/[0.04]";
  return (
    <a
      className={`flex items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium ${activeClass}`}
      href={item.href}
    >
      <span className="flex items-center gap-2.5">
        <span className={item.active ? "text-primary" : "text-base-content/65"}>{item.icon}</span>
        <span>{item.label}</span>
      </span>
      {item.badge && <NavBadge badge={item.badge} />}
      {!item.badge && item.meta && <span className="text-xs text-base-content/50">{item.meta}</span>}
    </a>
  );
}

function NavBadge({ badge }: { badge: { tone: Tone; label: string } }) {
  const tone = navBadgeTones[badge.tone];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 ${tone.bg}`}>
      <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
      <span className={`text-xs font-semibold ${tone.text}`}>{badge.label}</span>
    </span>
  );
}

export function SidebarPulseCard({
  title,
  body,
  tone = "success"
}: {
  title: string;
  body: string;
  tone?: "success" | "accent" | "muted";
}) {
  const dotColor =
    tone === "success" ? "bg-success" : tone === "accent" ? "bg-accent" : "bg-base-content/50";
  const titleColor =
    tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-base-content/65";
  return (
    <div className="rounded-lg border border-base-content/10 bg-base-100/60 p-3.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className={`text-xs font-semibold ${titleColor}`}>{title}</span>
      </div>
      <p className="text-xs leading-snug text-base-content/65">{body}</p>
    </div>
  );
}
