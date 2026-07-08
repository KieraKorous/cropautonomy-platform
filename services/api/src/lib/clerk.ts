import { createClerkClient, type ClerkClient } from "@clerk/backend";
import { loadConfig } from "../config.js";

// Single shared Clerk backend client. The auth plugin uses it to authenticate
// requests; the members routes use it to issue/list/revoke org invitations.
// Mirrors the getDb() singleton pattern in ./db.ts so routes don't each build
// their own client.
let cached: ClerkClient | undefined;

export function getClerk(): ClerkClient {
  if (cached) return cached;
  const config = loadConfig();
  cached = createClerkClient({
    secretKey: config.CLERK_SECRET_KEY,
    publishableKey: config.CLERK_PUBLISHABLE_KEY
  });
  return cached;
}
