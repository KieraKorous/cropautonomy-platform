"use server";

import { revalidatePath } from "next/cache";
import { discardCapture } from "../../../lib/api";

// Soft-discards a recording, then refreshes the grid. The recording stays in the
// DB + Storage (it's a capture with kind='session_recording'); it just drops out
// of the default list. Permanent deletion lives on the settings page.
export async function discardRecordingAction(id: string): Promise<void> {
  await discardCapture(id);
  revalidatePath("/recordings");
}
