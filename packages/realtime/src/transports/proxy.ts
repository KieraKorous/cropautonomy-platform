// v0 client-publish transport: POST the event envelope to a server endpoint
// that holds the privileged Supabase client. Lets the field PWA publish
// without a Clerk->Supabase JWT bridge in place.
//
// When the bridge lands, swap this for transports/supabase.broadcastFromClient
// by configuring the client publishFromClient with mode: "direct".

import { validateForPublish, type RealtimeEventInput } from "../events.js";

export interface ProxyTransportConfig {
  endpoint: string; // absolute URL e.g. https://api.cropautonomy.com/v1/realtime/publish
  // Bearer-token getter. May be sync or async; called before each publish.
  getAuthHeader?: () => string | undefined | Promise<string | undefined>;
}

export async function publishViaProxy(
  config: ProxyTransportConfig,
  channelName: string,
  input: RealtimeEventInput
): Promise<void> {
  const event = validateForPublish(input);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const authHeader = await config.getAuthHeader?.();
  if (authHeader) headers.authorization = authHeader;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel: channelName, event })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Realtime proxy publish failed (${response.status}): ${text || response.statusText}`
    );
  }
}
