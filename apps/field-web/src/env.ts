// Centralized env var access. All field-web env vars are public (VITE_-prefixed)
// since the PWA is purely client-side. Sensitive values (service-role keys)
// live exclusively in services/api.
//
// Missing required vars don't throw at module-eval time — that would crash
// the bundle and leave the user with a blank page. Instead the missing keys
// are collected and exposed as `env.missing`; `main.tsx` reads that and
// renders a diagnostic screen so the operator sees what to set.

const DEFAULTS = {
  VITE_API_BASE: "http://localhost:8080",
  VITE_CLERK_SIGN_IN_URL: "http://app.lvh.me:3002/sign-in",
  VITE_STUN_URLS: "stun:stun.l.google.com:19302"
} as const;

const REQUIRED_KEYS = [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
] as const;

const missing: string[] = [];

function read(key: string, fallback?: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  return "";
}

function requireKey(key: (typeof REQUIRED_KEYS)[number]): string {
  const value = read(key);
  if (!value) missing.push(key);
  return value;
}

export const env = {
  apiBase: read("VITE_API_BASE", DEFAULTS.VITE_API_BASE),
  clerk: {
    publishableKey: requireKey("VITE_CLERK_PUBLISHABLE_KEY"),
    signInUrl: read("VITE_CLERK_SIGN_IN_URL", DEFAULTS.VITE_CLERK_SIGN_IN_URL)
  },
  supabase: {
    url: requireKey("VITE_SUPABASE_URL"),
    anonKey: requireKey("VITE_SUPABASE_ANON_KEY")
  },
  // Mapbox is intentionally soft-required: the /map view degrades to a
  // "needs Mapbox token" panel if missing, but the rest of the PWA (capture,
  // queue, settings) continues to work without it.
  mapboxToken: read("VITE_MAPBOX_TOKEN") || undefined,
  ice: {
    stunUrls: read("VITE_STUN_URLS", DEFAULTS.VITE_STUN_URLS)
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    turnUrl: read("VITE_TURN_URL") || undefined,
    turnUsername: read("VITE_TURN_USERNAME") || undefined,
    turnCredential: read("VITE_TURN_CREDENTIAL") || undefined
  },
  missing: missing as readonly string[]
};
