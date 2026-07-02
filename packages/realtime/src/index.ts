// NOTE: relative imports in this package are intentionally EXTENSIONLESS.
// @gaia/realtime is consumed as raw .ts source by BOTH Turbopack (portal-web,
// via transpilePackages) and NodeNext tsc (services/api, services/workers).
// Turbopack cannot resolve a `.js` specifier pointing at a `.ts` file, so adding
// `.js` extensions breaks `next build`. Tradeoff: api/workers' NodeNext
// typecheck reports TS2835 here — accepted until this package ships a built
// dist + exports. Do NOT "fix" the typecheck by adding extensions.
export { channels, type ChannelName } from "./channels";
export {
  validateForPublish,
  validateReceived,
  type RealtimeEvent,
  type RealtimeEventEnvelope,
  type RealtimeEventInput
} from "./events";
