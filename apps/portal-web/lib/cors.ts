// CORS for cross-origin calls from field.cropautonomy.com (and field.lvh.me
// in local dev). Same-origin portal calls hit the same handler and the
// Origin header simply doesn't match -- the response is harmless.

const allowedOriginPatterns = [
  /^https:\/\/field\.cropautonomy\.com$/,
  /^https?:\/\/field\.lvh\.me(:\d+)?$/,
  /^https?:\/\/field\.localhost(:\d+)?$/,
  /^http:\/\/localhost(:\d+)?$/
];

function originAllowed(origin: string | null): origin is string {
  if (!origin) return false;
  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!originAllowed(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}

export function handlePreflight(request: Request): Response {
  const headers = corsHeaders(request.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}

export function withCors(response: Response, request: Request): Response {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
