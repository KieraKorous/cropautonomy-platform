// Server-side publish entrypoint. Used by Next.js route handlers, server
// actions, and pg-boss workers to emit realtime events with the service-role
// Supabase client. Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from
// process.env on first call.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateForPublish, type RealtimeEventInput } from "../events";

const BROADCAST_EVENT = "envelope";

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "@gaia/realtime/server: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false }
  });
  return cachedClient;
}

export async function publish(
  channelName: string,
  input: RealtimeEventInput
): Promise<void> {
  const event = validateForPublish(input);
  const client = getServiceClient();
  // ack: true is essential — `send` then resolves only after the Realtime server
  // acknowledges receipt, so we know the broadcast actually reached the broker
  // (and will fan out to subscribers) BEFORE we remove the channel. With ack:false
  // `send` resolves as soon as the frame is written locally, and the immediate
  // removeChannel below would close the socket before the message flushed —
  // silently dropping every server-published event. That bug made the field PWA
  // never receive go-live grants and the Live wall never update in real time.
  const channel = client.channel(channelName, {
    config: { broadcast: { ack: true, self: false } }
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void client.removeChannel(channel);
      reject(new Error(`Supabase channel subscribe timeout for ${channelName}`));
    }, 5000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !settled) {
        let result: string;
        try {
          result = await channel.send({
            type: "broadcast",
            event: BROADCAST_EVENT,
            payload: event
          });
        } catch (err) {
          clearTimeout(timer);
          settled = true;
          await client.removeChannel(channel);
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        clearTimeout(timer);
        settled = true;
        await client.removeChannel(channel);
        if (result === "ok") resolve();
        else reject(new Error(`Supabase broadcast failed: ${result}`));
      } else if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
        !settled
      ) {
        clearTimeout(timer);
        settled = true;
        await client.removeChannel(channel);
        reject(new Error(`Supabase channel subscribe failed: ${status}`));
      }
    });
  });
}
