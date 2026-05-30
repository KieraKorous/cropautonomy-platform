"use client";

import { useAuth } from "@clerk/nextjs";
import {
  configurePublishFromClient,
  configureRealtimeClient
} from "@gaia/realtime/client";
import { type ReactNode } from "react";

// Wires @gaia/realtime for the portal, mirroring the field PWA's main.tsx:
//   - subscribes go direct to Supabase Realtime with the anon key (channel-name
//     tenancy scopes the data)
//   - browser publishes (viewer signaling) proxy through the API, which holds
//     the service role, until the Clerk -> Supabase JWT bridge lands.
//
// Configuration must happen during render (not in an effect): child effects run
// before parent effects, so a child's useRealtimeChannel would fire before an
// effect here had a chance to set the transport. Guard with a module flag so it
// runs once, and read the Clerk token through a module-level holder so token
// refresh survives provider remounts.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(
  /\/+$/,
  ""
);

let configured = false;
const tokenGetter: { current: (() => Promise<string | null>) | null } = {
  current: null
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  tokenGetter.current = () => getToken();

  if (!configured && SUPABASE_URL && SUPABASE_ANON_KEY) {
    configured = true;
    configureRealtimeClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
    configurePublishFromClient({
      kind: "proxy",
      config: {
        endpoint: `${API_BASE}/v1/realtime/publish`,
        getAuthHeader: async () => {
          const token = await tokenGetter.current?.();
          return token ? `Bearer ${token}` : undefined;
        }
      }
    });
  }

  return <>{children}</>;
}
