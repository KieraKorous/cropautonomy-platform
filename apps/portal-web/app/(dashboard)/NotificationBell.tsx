"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NotificationSummary } from "../../lib/api";
import {
  notificationVisual,
  timeAgo,
  toneBubbleClasses
} from "../../lib/notification-display";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction
} from "./notifications/actions";

const PANEL_MAX = 8;

export interface NotificationBellProps {
  orgId: string;
  /** Internal public.users.id — the org channel is shared, so we filter to ours. */
  userId: string;
  initialNotifications: NotificationSummary[];
  initialUnreadCount: number;
}

export function NotificationBell({
  orgId,
  userId,
  initialNotifications,
  initialUnreadCount
}: NotificationBellProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationSummary[]>(initialNotifications);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Live inbox: the org notifications channel carries every member's rows, so we
  // keep only the ones addressed to us. Dedupe by id (a reconnect can replay).
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
        return [next, ...prev].slice(0, 30);
      });
      setUnread((n) => n + 1);
    }
  });

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n
      )
    );
    setUnread((n) => Math.max(0, n - 1));
    void markNotificationReadAction(id);
  }, []);

  const onItemClick = useCallback(
    (n: NotificationSummary) => {
      if (!n.readAt) markRead(n.id);
      setOpen(false);
      if (n.actionUrl) router.push(n.actionUrl);
    },
    [markRead, router]
  );

  const markAllRead = useCallback(() => {
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnread(0);
    void markAllNotificationsReadAction();
  }, []);

  const badge = unread > 9 ? "9+" : String(unread);
  const visible = items.slice(0, PANEL_MAX);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-base-content/[0.05]"
        onClick={() => setOpen((v) => !v)}
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
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-content ring-2 ring-base-100">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] overflow-hidden rounded-xl border border-base-content/10 bg-base-100 shadow-xl">
          <div className="flex items-center justify-between border-b border-base-content/10 px-4 py-3">
            <span className="text-sm font-semibold text-neutral">Notifications</span>
            {unread > 0 && (
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={markAllRead}
                type="button"
              >
                Mark all read
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-base-content/55">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-base-content/[0.06] overflow-y-auto">
              {visible.map((n) => (
                <li key={n.id}>
                  <NotificationRow notification={n} onClick={() => onItemClick(n)} />
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-base-content/10 px-4 py-2.5 text-center">
            <Link
              className="text-xs font-medium text-primary hover:underline"
              href="/notifications"
              onClick={() => setOpen(false)}
            >
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onClick
}: {
  notification: NotificationSummary;
  onClick: () => void;
}) {
  const visual = notificationVisual(notification.type);
  const unread = !notification.readAt;
  return (
    <button
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-base-content/[0.04] ${
        unread ? "bg-primary/[0.04]" : ""
      }`}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${toneBubbleClasses[visual.tone]}`}
      >
        {visual.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${unread ? "font-semibold text-neutral" : "text-base-content/80"}`}
          >
            {notification.title}
          </span>
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
        </span>
        {notification.body && (
          <span className="mt-0.5 line-clamp-2 block text-xs text-base-content/60">
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-base-content/45">
          {timeAgo(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}
