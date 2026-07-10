import {
  ApiError,
  getMe,
  listNotifications,
  type NotificationSummary
} from "../../../lib/api";
import { NotificationsView } from "./NotificationsView";

// The full inbox — everything the bell dropdown only previews. Grouped by day,
// filterable to unread, with mark-all-read and per-row dismiss. Live-updates over
// the same org notifications channel the bell uses.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  let notifications: NotificationSummary[] = [];
  let unreadCount = 0;
  let orgId = "";
  let userId = "";
  let loadError: string | null = null;

  try {
    const result = await listNotifications({ limit: 50 });
    notifications = result.notifications;
    unreadCount = result.unreadCount;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the notifications service.";
  }

  // orgId + userId scope the live feed. Non-fatal.
  try {
    const me = await getMe();
    orgId = me.orgId;
    userId = me.userId;
  } catch {
    orgId = "";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Notifications</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Task completions, live requests, analysis results, and roster changes across your
            organization.
          </p>
        </div>
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <NotificationsView
          initialNotifications={notifications}
          initialUnreadCount={unreadCount}
          orgId={orgId}
          userId={userId}
        />
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Off the grid
      </span>
      <h2 className="text-base font-semibold text-neutral">
        We couldn&apos;t load your notifications.
      </h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Refresh in a moment — if it keeps happening, make sure you have an active organization.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
