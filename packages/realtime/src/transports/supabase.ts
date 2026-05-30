// v0 transport: Supabase Realtime broadcast.
//
// Direct importers: packages/realtime/src/{client,server}/*.ts ONLY.
// Application code (apps/*) must never import @supabase/supabase-js
// realtime APIs directly; see docs/architecture/realtime-strategy.md
// § Anti-patterns.

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient
} from "@supabase/supabase-js";
import {
  validateForPublish,
  validateReceived,
  type RealtimeEvent,
  type RealtimeEventInput
} from "../events";

const BROADCAST_EVENT = "envelope";

export interface SupabaseTransportConfig {
  url: string;
  anonKey: string;
  // Optional pre-built client (lets the host app share auth state).
  client?: SupabaseClient;
}

function makeClient(config: SupabaseTransportConfig): SupabaseClient {
  if (config.client) return config.client;
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false }
  });
}

export function broadcastFromClient(
  config: SupabaseTransportConfig,
  channelName: string,
  input: RealtimeEventInput
): Promise<void> {
  // Direct client publish path. v0 deployments may proxy publishes through
  // a portal API instead; that path lives in transports/proxy.ts.
  const event = validateForPublish(input);
  const client = makeClient(config);
  const channel = client.channel(channelName, {
    config: { broadcast: { ack: false, self: false } }
  });
  return new Promise((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const result = await channel.send({
          type: "broadcast",
          event: BROADCAST_EVENT,
          payload: event
        });
        await client.removeChannel(channel);
        if (result === "ok") resolve();
        else reject(new Error(`Supabase broadcast failed: ${result}`));
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        await client.removeChannel(channel);
        reject(new Error(`Supabase channel subscribe failed: ${status}`));
      }
    });
  });
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface SubscriptionHandle {
  unsubscribe: () => Promise<void>;
}

export function subscribe(
  config: SupabaseTransportConfig,
  channelName: string,
  handlers: {
    onEvent: (event: RealtimeEvent) => void;
    onStatus?: (status: ConnectionStatus) => void;
  }
): SubscriptionHandle {
  const client = makeClient(config);
  const channel: RealtimeChannel = client.channel(channelName, {
    config: { broadcast: { self: false } }
  });

  channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
    const event = validateReceived(payload);
    if (event) handlers.onEvent(event);
  });

  channel.subscribe((status) => {
    if (!handlers.onStatus) return;
    switch (status) {
      case "SUBSCRIBED":
        handlers.onStatus("connected");
        break;
      case "CHANNEL_ERROR":
      case "TIMED_OUT":
        handlers.onStatus("error");
        break;
      case "CLOSED":
        handlers.onStatus("disconnected");
        break;
      default:
        handlers.onStatus("connecting");
    }
  });

  return {
    unsubscribe: async () => {
      await client.removeChannel(channel);
    }
  };
}
