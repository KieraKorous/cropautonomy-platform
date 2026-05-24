// Next 16+ proxy.ts (replaces the older middleware.ts convention).
// Runs at the edge for every request. Clerk wires authentication state into
// the request so server components and route handlers can call auth().
//
// When Clerk env vars aren't set yet, we short-circuit and let requests pass
// through unauthenticated. The layout renders a diagnostic screen instead of
// crashing — see app/layout.tsx.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)"
]);

const clerkConfigured =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

const wrapped = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  await auth.protect();
});

export default async function middleware(
  request: NextRequest,
  ...rest: unknown[]
) {
  if (!clerkConfigured) return NextResponse.next();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (wrapped as any)(request, ...rest);
}

export const config = {
  matcher: [
    // Skip Next internals and all static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API + tRPC routes
    "/(api|trpc)(.*)"
  ]
};
