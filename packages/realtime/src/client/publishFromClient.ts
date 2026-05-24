// Client-side publish entrypoint. Used by the field PWA and any future
// browser-resident device SDKs to emit realtime events.
//
// v0 default transport: proxy through a portal API endpoint (so the browser
// doesn't need a Supabase-authenticated JWT yet). When the Clerk->Supabase
// JWT bridge lands, swap the transport via configurePublishFromClient.

import { publishViaProxy, type ProxyTransportConfig } from "../transports/proxy.js";
import {
  broadcastFromClient,
  type SupabaseTransportConfig
} from "../transports/supabase.js";
import type { RealtimeEventInput } from "../events.js";

export type ClientPublishTransport =
  | { kind: "proxy"; config: ProxyTransportConfig }
  | { kind: "supabase"; config: SupabaseTransportConfig };

let cachedTransport: ClientPublishTransport | null = null;

export function configurePublishFromClient(transport: ClientPublishTransport) {
  cachedTransport = transport;
}

export async function publishFromClient(
  channelName: string,
  input: RealtimeEventInput
): Promise<void> {
  if (!cachedTransport) {
    throw new Error(
      "[@gaia/realtime] publishFromClient called before configurePublishFromClient()."
    );
  }
  switch (cachedTransport.kind) {
    case "proxy":
      return publishViaProxy(cachedTransport.config, channelName, input);
    case "supabase":
      return broadcastFromClient(cachedTransport.config, channelName, input);
  }
}
