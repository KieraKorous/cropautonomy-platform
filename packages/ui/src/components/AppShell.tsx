"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Wordmark, type Brand } from "./Wordmark";
import type { Tone } from "./atoms";

const SIDEBAR_COLLAPSED_KEY = "gaia:sidebar-collapsed";

function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

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
export type AppShellUser = { initials: string; name: string; href?: string };
export type AppShellSearch = { placeholder: string; shortcut?: string };

export type AppShellProps = {
  brand: Brand;
  org: AppShellOrg;
  user: AppShellUser;
  navGroups: NavGroup[];
  search?: AppShellSearch;
  hasNotifications?: boolean;
  /**
   * Replaces the static bell in the top bar. Apps pass a live notifications
   * control (the portal's NotificationBell) here; when omitted the shell falls
   * back to the plain `hasNotifications` dot.
   */
  notificationsSlot?: ReactNode;
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
  notificationsSlot,
  sidebarFooter,
  children
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-base-100 text-neutral">
      <AppTopBar
        brand={brand}
        collapsed={collapsed}
        hasNotifications={hasNotifications}
        notificationsSlot={notificationsSlot}
        onToggleCollapse={toggleCollapsed}
        org={org}
        search={search}
        user={user}
      />
      <div className="flex flex-1 items-stretch">
        <AppSidebar collapsed={collapsed} footer={sidebarFooter} navGroups={navGroups} />
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
  hasNotifications,
  notificationsSlot,
  collapsed,
  onToggleCollapse
}: {
  brand: Brand;
  org: AppShellOrg;
  user: AppShellUser;
  search?: AppShellSearch;
  hasNotifications: boolean;
  notificationsSlot?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-base-content/10 bg-base-100 px-6 py-3.5">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <SidebarToggle collapsed={collapsed} onToggle={onToggleCollapse} />
          <Wordmark brand={brand} href="/" />
        </div>
        <span className="h-5 w-px bg-base-content/20" />
        <OrgSwitcher org={org} />
      </div>
      <div className="flex items-center gap-2">
        {search && <SearchField placeholder={search.placeholder} shortcut={search.shortcut} />}
        {notificationsSlot ?? <NotificationsButton hasUnread={hasNotifications} />}
        <UserPill user={user} />
      </div>
    </header>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral hover:bg-base-content/[0.05]"
      onClick={onToggle}
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
      >
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <path d="M9 3v18" />
        {collapsed ? <path d="m13 9 3 3-3 3" /> : <path d="m16 9-3 3 3 3" />}
      </svg>
    </button>
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
  const className =
    "flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-base-content/[0.05]";
  const inner = (
    <>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-content">
        {user.initials}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-neutral">{user.name}</span>
    </>
  );
  if (user.href) {
    return (
      <a aria-label="Your profile" className={className} href={user.href}>
        {inner}
      </a>
    );
  }
  return (
    <button className={className} type="button">
      {inner}
    </button>
  );
}

function AppSidebar({
  navGroups,
  footer,
  collapsed
}: {
  navGroups: NavGroup[];
  footer?: ReactNode;
  collapsed: boolean;
}) {
  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-base-content/8 bg-base-200/55 py-6 transition-[width] duration-200 ${
        collapsed ? "w-16 px-2" : "w-60 px-3.5"
      }`}
    >
      <div className="flex flex-col gap-4">
        {navGroups.map((group, idx) => (
          <SidebarGroup
            collapsed={collapsed}
            group={group}
            key={group.title ?? `nav-group-${idx}`}
            withDivider={idx < navGroups.length - 1}
          />
        ))}
      </div>
      {footer && !collapsed && <div className="mt-auto pt-6">{footer}</div>}
    </aside>
  );
}

function SidebarGroup({
  group,
  withDivider,
  collapsed
}: {
  group: NavGroup;
  withDivider: boolean;
  collapsed: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 ${withDivider ? "border-b border-base-content/8 pb-4" : ""}`}
    >
      {group.title && !collapsed && (
        <span className="px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-base-content/45">
          {group.title}
        </span>
      )}
      {group.items.map((item) => (
        <SidebarNavItem collapsed={collapsed} item={item} key={item.label} />
      ))}
    </div>
  );
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = item.active ?? isRouteActive(pathname, item.href);
  const activeClass = active
    ? "bg-primary/10 text-primary"
    : "text-neutral hover:bg-base-content/[0.04]";
  return (
    <a
      className={`flex items-center rounded-md px-2.5 py-2 text-sm font-medium ${activeClass} ${
        collapsed ? "tooltip tooltip-right justify-center" : "justify-between gap-2.5"
      }`}
      data-tip={collapsed ? item.label : undefined}
      href={item.href}
    >
      <span className={`flex items-center ${collapsed ? "" : "gap-2.5"}`}>
        <span className={active ? "text-primary" : "text-base-content/65"}>{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </span>
      {!collapsed && item.badge && <NavBadge badge={item.badge} />}
      {!collapsed && !item.badge && item.meta && (
        <span className="text-xs text-base-content/50">{item.meta}</span>
      )}
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
