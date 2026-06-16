// Two-letter avatar initials for the user/org chips. Prefers a name
// ("Brandon Korous" → "BK"), falls back to the email local-part
// ("brandon@…" → "BR"), and finally "?".
export function initialsFrom(name?: string | null, email?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const local = (email ?? "").split("@")[0];
  if (local) return local.slice(0, 2).toUpperCase();
  return "?";
}
