import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter } from "react-router-dom";
import {
  configurePublishFromClient,
  configureRealtimeClient
} from "@gaia/realtime/client";

import { App } from "./App.js";
import { env } from "./env.js";
import { MissingEnvScreen } from "./components/MissingEnvScreen.js";
import "./styles/app.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const root = createRoot(rootEl);

if (env.missing.length > 0) {
  root.render(
    <StrictMode>
      <MissingEnvScreen missing={env.missing} />
    </StrictMode>
  );
} else {
  // Realtime configuration. Both subscribes and publishes go direct to Supabase
  // Realtime with the anon client (channel-name structure provides tenant
  // scoping at the broker for v0). Broadcast needs no Supabase JWT, so the old
  // server proxy (which opened a per-call WebSocket and 500s in the deployed
  // API runtime) is gone.
  configureRealtimeClient({
    url: env.supabase.url,
    anonKey: env.supabase.anonKey
  });
  configurePublishFromClient({
    kind: "supabase",
    config: { url: env.supabase.url, anonKey: env.supabase.anonKey }
  });

  root.render(
    <StrictMode>
      <ClerkProvider
        publishableKey={env.clerk.publishableKey}
        signInUrl={env.clerk.signInUrl}
        signInFallbackRedirectUrl="/"
        afterSignOutUrl="/"
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>
  );
}
