// Client-generated identifiers for local records.
//
// Browsers cannot read hardware ids, so every record gets a UUID minted at
// creation. IDs are prefixed with their record kind ("plant_…", "obs_…") so they
// are self-describing in DevTools and JSON exports. `crypto.randomUUID()` is
// available in every target browser and in Node 20+ (for future Vitest runs), so
// no polyfill is needed.
//
// NOTE: `cropId` is intentionally NOT generated here — it is a stable human slug
// ("tomato") used as a natural key by seeds and the [cropId+stage] index.

export type IdPrefix =
  | "field"
  | "plant"
  | "obs"
  | "profile"
  | "stage"
  | "rule"
  | "result"
  | "finding"
  | "img"
  | "source";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
