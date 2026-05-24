// Bridge to Clerk's session token from non-React contexts (api.ts, upload
// worker). Clerk's react SDK exposes `window.Clerk` after init; this wraps it
// so callers don't have to know the global is mutable.

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      } | null;
    };
  }
}

export async function getApiToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return (await window.Clerk?.session?.getToken?.()) ?? null;
}
