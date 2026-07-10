"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import type { NotificationSummary } from "../../../lib/api";
import {
  dayGroupLabel,
  notificationVisual,
  timeAgo,
  toneBubbleClasses
} from "../../../lib/notification-display";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction
} from "./actions";

type Filter = "all" | "unread";

export interface NotificationsViewProps {
  orgId: string;
  userId: string;
  initialNotifications: NotificationSummary[];
  initialUnreadCount: number;
}

export function NotificationsView({
  orgId,
  userId,
  initialNotifications,
  initialUnreadCount
}: NotificationsViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationSummary[]>(initialNotifications);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [filter, setFilter] = useState<Filter>("all");

  // Live: same org channel as the bell, filtered to our own rows.
  useRealtimeChannel(channels.orgNotifications(orgId), {
    enabled: Boolean(orgId),
    onEvent: (event) => {
      if (event.type !== "notification.created") return;
      const p = event.payload;
      if (p.userId !== userId) return;
      setItems((prev) => {
        if (prev.some((n) => n.id === p.notificationId)) return prev;
        const next: NotificationSummary = {
          id: p.notificationId,
          type: p.notifType,
          title: p.title,
          body: p.body ?? null,
          payload: {},
          actionUrl: p.actionUrl ?? null,
          readAt: null,
          dismissedAt: null,
          createdAt: p.createdAt
        };
        return [next, ...prev];
      });
      setUnread((n) => n + 1);
    }
  });

  const markRead = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.readAt) return prev;
      return prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    });
    setUnread((n) => Math.max(0, n - 1));
    void markNotificationReadAction(id);
  }, []);

  const onRowClick = useCallback(
    (n: NotificationSummary) => {
      if (!n.readAt) markRead(n.id);
      if (n.actionUrl) router.push(n.actionUrl);
    },
    [markRead, router]
  );

  const dismiss = useCallback((id: string) => {
    let wasUnread = false;
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      wasUnread = Boolean(target && !target.readAt);
      return prev.filter((n) => n.id !== id);
    });
    if (wasUnread) setUnread((n) => Math.max(0, n - 1));
    void dismissNotificationAction(id);
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnread(0);
    void markAllNotificationsReadAction();
  }, []);

  const shown = filter === "unread" ? items.filter((n) => !n.readAt) : items;

  // Group by calendar day, preserving newest-first order.
  const groups = useMemo(() => {
    const out: { label: string; rows: NotificationSummary[] }[] = [];
    for (const n of shown) {
      const label = dayGroupLabel(n.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(n);
      else out.push({ label, rows: [n] });
    }
    return out;
  }, [shown]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-base-content/[0.05] p-1">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          <FilterTab
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
            label={unread > 0 ? `Unread (${unread})` : "Unread"}
          />
        </div>
        {unread > 0 && (
          <button
            className="text-sm font-medium text-primary hover:underline"
            onClick={markAllRead}
            type="button"
          >
            Mark all read
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState unreadOnly={filter === "unread"} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                {group.label}
              </h2>
              <ul className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100 divide-y divide-base-content/[0.06]">
                {group.rows.map((n) => (
                  <li key={n.id}>
                    <Row
                      notification={n}
                      onClick={() => onRowClick(n)}
                      onDismiss={() => dismiss(n.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-base-100 text-neutral shadow-sm"
          : "text-base-content/60 hover:text-neutral"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Row({
  notification,
  onClick,
  onDismiss
}: {
  notification: NotificationSummary;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const visual = notificationVisual(notification.type);
  const unread = !notification.readAt;
  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-base-content/[0.03] ${
        unread ? "bg-primary/[0.04]" : ""
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${toneBubbleClasses[visual.tone]}`}
      >
        {visual.glyph}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={onClick} type="button">
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-base-content/45">
            {visual.category}
          </span>
          {unread && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </span>
        <span
          className={`mt-0.5 block text-sm ${unread ? "font-semibold text-neutral" : "text-base-content/80"}`}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 block text-xs text-base-content/60">{notification.body}</span>
        )}
        <span className="mt-1 block text-[11px] text-base-content/45">
          {timeAgo(notification.createdAt)}
        </span>
      </button>
      <button
        aria-label="Dismiss notification"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base-content/35 opacity-0 transition-opacity hover:bg-base-content/[0.06] hover:text-base-content/70 group-hover:opacity-100"
        onClick={onDismiss}
        type="button"
      >
        <svg
          fill="none"
          height="15"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="15"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function EmptyState({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-base-content/15 bg-base-100 px-6 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-base-content/[0.06] text-base-content/40">
        <svg
          fill="none"
          height="20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </span>
      <h2 className="text-base font-semibold text-neutral">
        {unreadOnly ? "No unread notifications" : "Nothing here yet"}
      </h2>
      <p className="max-w-sm text-sm text-base-content/60">
        {unreadOnly
          ? "You're all caught up."
          : "Task completions, live requests, and analysis results will show up here."}
      </p>
    </section>
  );
}
