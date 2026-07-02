"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribe,
  type ConnectionStatus,
  type SupabaseTransportConfig
} from "../transports/supabase.js";
import type { RealtimeEvent } from "../events.js";

let cachedConfig: SupabaseTransportConfig | null = null;

// Hosts (portal layout, field-web bootstrap) call this once at startup so the
// hook can read transport config without hardcoding env names per surface.
export function configureRealtimeClient(config: SupabaseTransportConfig) {
  cachedConfig = config;
}

export interface UseRealtimeChannelOptions {
  historyLimit?: number;
  enabled?: boolean;
  // Per-event callback invoked synchronously for EVERY received event, before
  // React state is updated. Use this when you must not drop events — e.g. WebRTC
  // signaling, where trickle-ICE candidates arrive in bursts and `latest` would
  // coalesce all but the last. The callback is held in a ref, so changing its
  // identity does not re-subscribe the channel.
  onEvent?: (event: RealtimeEvent) => void;
}

export interface UseRealtimeChannelResult {
  latest: RealtimeEvent | null;
  history: RealtimeEvent[];
  status: ConnectionStatus;
}

export function useRealtimeChannel(
  channelName: string,
  options: UseRealtimeChannelOptions = {}
): UseRealtimeChannelResult {
  const { historyLimit = 1, enabled = true, onEvent } = options;

  const [latest, setLatest] = useState<RealtimeEvent | null>(null);
  const [history, setHistory] = useState<RealtimeEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const limitRef = useRef(historyLimit);
  limitRef.current = historyLimit;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    if (!cachedConfig) {
      // eslint-disable-next-line no-console
      console.warn(
        "[@gaia/realtime] useRealtimeChannel called before configureRealtimeClient()."
      );
      return;
    }

    const handle = subscribe(cachedConfig, channelName, {
      onEvent: (event) => {
        // Fire the per-event callback first so signaling consumers see every
        // event in arrival order, undisturbed by React state batching.
        onEventRef.current?.(event);
        setLatest(event);
        setHistory((prev) => {
          if (limitRef.current <= 1) return [event];
          const next = [event, ...prev];
          return next.length > limitRef.current ? next.slice(0, limitRef.current) : next;
        });
      },
      onStatus: setStatus
    });

    return () => {
      void handle.unsubscribe();
    };
  }, [channelName, enabled]);

  return { latest, history, status };
}
