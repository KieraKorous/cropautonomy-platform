import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getPairedDevice, type PairedDevice } from "../lib/db.js";
import { adoptActiveSession } from "../lib/session.js";

// App-global listener for the "go live" grant. Mounted once for the whole signed-in
// app (not tied to the session picker) so a watcher's Accept reliably lands the
// phone on the camera even if the operator wandered off to Map/Queue/Settings
// while waiting — Supabase broadcast has no replay, so the subscription must
// already be open when the grant fires. On grant we adopt the session and jump
// straight to /capture, where the live publisher starts.
export function GoLiveGrantWatcher() {
  const navigate = useNavigate();
  const [device, setDevice] = useState<PairedDevice | null>(null);

  useEffect(() => {
    void getPairedDevice().then(setDevice);
  }, []);

  useRealtimeChannel(
    device
      ? channels.deviceCommands(device.orgId, device.deviceId)
      : "org.none.device.none.commands",
    {
      enabled: Boolean(device),
      historyLimit: 1,
      onEvent: (event) => {
        if (event.type !== "device.command.live_granted") return;
        void adoptActiveSession({
          sessionId: event.payload.sessionId,
          orgId: event.payload.orgId,
          startedAt: event.payload.grantedAt,
          status: "live"
        });
        navigate("/capture", { replace: true });
      }
    }
  );

  return null;
}
