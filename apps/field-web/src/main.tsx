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
import { getApiToken } from "./lib/auth.js";
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
  // Realtime configuration. Publishes proxy through portal until the
  // Clerk -> Supabase JWT bridge lands; subscribes use the anon Supabase client
  // (channel-name structure provides tenant scoping at the broker for v0).
  configureRealtimeClient({
    url: env.supabase.url,
    anonKey: env.supabase.anonKey
  });
  configurePublishFromClient({
    kind: "proxy",
    config: {
      endpoint: `${env.apiBase}/v1/realtime/publish`,
      getAuthHeader: async () => {
        const token = await getApiToken();
        return token ? `Bearer ${token}` : undefined;
      }
    }
  });

  root.render(
    <StrictMode>
      <ClerkProvider
        publishableKey={env.clerk.publishableKey}
        isSatellite
        domain={env.clerk.satelliteDomain}
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
