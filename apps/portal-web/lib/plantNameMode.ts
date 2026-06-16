"use client";

import { useSyncExternalStore } from "react";

// Per-user display preference for plant names: show the scientific name
// (PlantNet species) or the common/regular name as the primary label. Persisted
// in localStorage like the captures view mode (see CapturesView), and shared
// across every <PlantName> on the page via useSyncExternalStore so toggling it
// in Settings updates the captures list/detail without a reload.
export type PlantNameMode = "scientific" | "common";

const STORAGE_KEY = "captures.plantNameMode";
const listeners = new Set<() => void>();

function read(): PlantNameMode {
  if (typeof window === "undefined") return "scientific";
  return window.localStorage.getItem(STORAGE_KEY) === "common" ? "common" : "scientific";
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  // Cross-tab: another tab writing the key fires a storage event.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function setPlantNameMode(mode: PlantNameMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
  // Notify same-tab subscribers (storage events only fire in other tabs).
  listeners.forEach((listener) => listener());
}

// Server snapshot is always "scientific" so SSR is stable; the client adopts the
// stored value on first commit (useSyncExternalStore reconciles without a
// hydration-mismatch warning).
export function usePlantNameMode(): PlantNameMode {
  return useSyncExternalStore(subscribe, read, () => "scientific");
}
