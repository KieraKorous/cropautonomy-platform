// ICE servers for the portal's viewer-side peer connections. STUN-only by
// default; flip on TURN by setting NEXT_PUBLIC_TURN_URL (+ USERNAME/CREDENTIAL)
// when the supervisor network needs relayed media. Mirrors the field PWA's
// apps/field-web/src/lib/ice.ts so both ends of the mesh share the same config
// shape. NEXT_PUBLIC_* vars are inlined into the client bundle at build time.

const DEFAULT_STUN = "stun:stun.l.google.com:19302";

export function getIceServers(): RTCIceServer[] {
  const stunUrls = (process.env.NEXT_PUBLIC_STUN_URLS ?? DEFAULT_STUN)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const servers: RTCIceServer[] = [{ urls: stunUrls }];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    });
  }

  return servers;
}
