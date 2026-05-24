import { env } from "../env.js";

// STUN-only by default. Add TURN by setting VITE_TURN_URL (+ VITE_TURN_USERNAME
// and VITE_TURN_CREDENTIAL) in .env. No code change needed when the operator
// network requires TURN — flip the env vars and redeploy.
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: env.ice.stunUrls }];
  if (env.ice.turnUrl) {
    servers.push({
      urls: env.ice.turnUrl,
      username: env.ice.turnUsername,
      credential: env.ice.turnCredential
    });
  }
  return servers;
}
