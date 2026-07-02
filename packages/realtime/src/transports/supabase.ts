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
} from "../events.js";

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

// One client + one persistent send-channel per channel name, reused across
// publishes. Signaling fires a burst of messages (offer, answer, many trickle
// ICE candidates); the previous "create channel, subscribe, send, tear down"
// per call opened a fresh WebSocket join every time — slow (~1s+ each) and the
// churn could exhaust connections. With a cached client all channels multiplex
// over a single socket, so only the first publish on a channel pays setup cost.
const clientCache = new Map<string, SupabaseClient>();
const sendChannels = new Map<string, { channel: RealtimeChannel; ready: Promise<void> }>();

function sharedClient(config: SupabaseTransportConfig): SupabaseClient {
  if (config.client) return config.client;
  const cached = clientCache.get(config.url);
  if (cached) return cached;
  const created = makeClient(config);
  clientCache.set(config.url, created);
  return created;
}

function getSendChannel(client: SupabaseClient, channelName: string) {
  const existing = sendChannels.get(channelName);
  if (existing) return existing;
  const channel = client.channel(channelName, {
    config: { broadcast: { ack: false, self: false } }
  });
  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Drop the cached entry so the next publish retries a fresh subscribe
        // instead of awaiting a permanently-rejected promise.
        sendChannels.delete(channelName);
        reject(new Error(`Supabase channel subscribe failed: ${status}`));
      }
    });
  });
  const entry = { channel, ready };
  sendChannels.set(channelName, entry);
  return entry;
}

export async function broadcastFromClient(
  config: SupabaseTransportConfig,
  channelName: string,
  input: RealtimeEventInput
): Promise<void> {
  // Direct client publish path. v0 used a server proxy (transports/proxy.ts)
  // because the browser had no Supabase JWT; for broadcast the anon client is
  // sufficient (channel-name tenancy), so we publish straight to the broker.
  const event = validateForPublish(input);
  const client = sharedClient(config);
  const { channel, ready } = getSendChannel(client, channelName);
  await ready;
  const result = await channel.send({
    type: "broadcast",
    event: BROADCAST_EVENT,
    payload: event
  });
  if (result !== "ok") {
    throw new Error(`Supabase broadcast failed: ${result}`);
  }
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
