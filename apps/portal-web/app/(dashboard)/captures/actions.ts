"use server";

import { revalidatePath } from "next/cache";
import { discardCapture } from "../../../lib/api";

// Soft-discards a capture, then refreshes the table. The capture stays in the
// DB + Storage; it just drops out of the default list. Permanent deletion lives
// on the settings page.
export async function discardCaptureAction(id: string): Promise<void> {
  await discardCapture(id);
  revalidatePath("/captures");
}
