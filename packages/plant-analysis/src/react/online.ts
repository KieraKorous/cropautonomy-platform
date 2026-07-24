import { useSyncExternalStore } from "react";

// Reactive online/offline flag. SSR-safe: the server snapshot is `true` (assume
// online) so hydration matches, then the client corrects from navigator.onLine.

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
