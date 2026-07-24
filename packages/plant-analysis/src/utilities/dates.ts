// Timestamp helpers. Every stored timestamp is an ISO-8601 string: it sorts
// lexicographically = chronologically (so compound indexes like
// [plantId+recordedAt] order correctly), is human-readable in exports, and round-
// trips through JSON without a numeric-epoch ambiguity.

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: Date | number | string): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value.toISOString();
}
