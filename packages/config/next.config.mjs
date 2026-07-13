/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@gaia/ui", "@gaia/realtime", "@gaia/analytics", "@gaia/virtual-field"],
  // Dev-only allow-list for the lvh.me hostnames the portal + field PWA use
  // to share the Clerk session cookie across ports. Without this Next 15+
  // blocks HMR + source-map fetches from any non-localhost dev origin.
  allowedDevOrigins: ["app.lvh.me", "field.lvh.me"]
};

export default nextConfig;
