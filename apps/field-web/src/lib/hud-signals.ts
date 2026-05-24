import { useEffect, useState } from "react";

// Tiny purpose-built hooks for HUD signals. Each one mirrors a single browser
// API into React state. Kept individually small so unsupported APIs (Battery)
// degrade gracefully without breaking the rest of the HUD.

export function useConnectivity():
  | "online"
  | "degraded"
  | "offline" {
  const [status, setStatus] = useState<"online" | "offline">(
    typeof navigator === "undefined" ? "online" : navigator.onLine ? "online" : "offline"
  );

  useEffect(() => {
    const handleOnline = () => setStatus("online");
    const handleOffline = () => setStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}

export interface GpsState {
  status: "searching" | "fix" | "unavailable" | "denied";
  position?: GeolocationPosition;
}

export function useGps(enabled: boolean): GpsState {
  const [state, setState] = useState<GpsState>({ status: "searching" });

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setState({ status: "unavailable" });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) => setState({ status: "fix", position }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState({ status: "denied" });
        } else {
          setState({ status: "unavailable" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}

export interface BatteryState {
  supported: boolean;
  level?: number; // 0..1
  charging?: boolean;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>({ supported: false });

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (!nav.getBattery) {
      setState({ supported: false });
      return;
    }
    let cancelled = false;
    let battery: BatteryManager | null = null;
    const sync = () => {
      if (cancelled || !battery) return;
      setState({
        supported: true,
        level: battery.level,
        charging: battery.charging
      });
    };
    nav.getBattery().then((b) => {
      if (cancelled) return;
      battery = b;
      sync();
      b.addEventListener("levelchange", sync);
      b.addEventListener("chargingchange", sync);
    });
    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", sync);
      battery?.removeEventListener("chargingchange", sync);
    };
  }, []);

  return state;
}
