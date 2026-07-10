"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead
} from "../../../lib/api";

// A throw inside a server action is masked by Next in production, hiding the
// cause. These actions RETURN the error instead. Mirrors scout-list/actions.ts.
export type ActionResult = { ok: true } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.code ? `${err.message} (${err.code})` : err.message;
  }
  return err instanceof Error ? err.message : "Unknown error.";
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  try {
    await markNotificationRead(id);
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    await markAllNotificationsRead();
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  revalidatePath("/notifications");
  return { ok: true };
}

export async function dismissNotificationAction(id: string): Promise<ActionResult> {
  try {
    await dismissNotification(id);
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  revalidatePath("/notifications");
  return { ok: true };
}
