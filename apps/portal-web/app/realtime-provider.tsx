"use client";

import {
  configurePublishFromClient,
  configureRealtimeClient
} from "@gaia/realtime/client";
import { type ReactNode } from "react";

// Wires @gaia/realtime for the portal, mirroring the field PWA's main.tsx:
//   - subscribes go direct to Supabase Realtime with the anon key (channel-name
//     tenancy scopes the data)
//   - browser publishes (viewer signaling) also go direct to Supabase Realtime
//     broadcast with the anon key (no Supabase JWT needed for broadcast).
//
// Configuration must happen during render (not in an effect): child effects run
// before parent effects, so a child's useRealtimeChannel would fire before an
// effect here had a chance to set the transport. Guard with a module flag so it
// runs once.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let configured = false;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  if (!configured && SUPABASE_URL && SUPABASE_ANON_KEY) {
    configured = true;
    configureRealtimeClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
    // Publish directly to Supabase Realtime broadcast with the anon client —
    // the same transport subscribes already use. The old proxy through
    // api.cropautonomy.com/v1/realtime/publish opened a server-side WebSocket
    // per call, which 500s in the deployed (serverless) API runtime. Broadcast
    // needs no Supabase JWT (channel-name tenancy), so anon is sufficient.
    configurePublishFromClient({
      kind: "supabase",
      config: { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }
    });
  }

  return <>{children}</>;
}
