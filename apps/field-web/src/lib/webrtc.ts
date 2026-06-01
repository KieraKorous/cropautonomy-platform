import { channels } from "@gaia/realtime/channels";
import { publishFromClient, useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useRef, useState } from "react";

import { getIceServers } from "./ice.js";

// Mesh WebRTC publisher. The field PWA holds the media stream; each portal
// viewer that joins triggers a new RTCPeerConnection. Signaling rides on the
// capture-session-signal channel; messages are addressed by viewerId.
//
// Topology rationale: with one operator broadcasting to a handful of
// supervisors, mesh is the simplest correct answer. When viewer counts grow
// past ~6 we swap to an SFU — but that's a transport change, not a protocol
// change. The signaling envelope stays the same.

export interface UseLivePublisherOptions {
  orgId: string;
  sessionId: string;
  operatorId: string; // clerk user id, used as `from`/`publisherId`
  stream: MediaStream | null;
  enabled: boolean;
}

export interface LivePublisherState {
  viewerCount: number;
  viewers: string[];
}

export function useLivePublisher(
  options: UseLivePublisherOptions
): LivePublisherState {
  const { orgId, sessionId, operatorId, stream, enabled } = options;
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [viewers, setViewers] = useState<string[]>([]);
  const channelName = channels.captureSessionSignal(orgId, sessionId);

  // Ctx the signal handler reads, kept current without re-subscribing so the
  // onEvent callback stays a stable closure over the latest stream/peers.
  const ctxRef = useRef<SignalContext | null>(null);
  ctxRef.current = stream
    ? { orgId, sessionId, operatorId, stream, peersRef, setViewers, channelName }
    : null;

  // Subscribe to signaling events. We drive the handshake off every event
  // (onEvent), not the coalesced `latest`: trickle-ICE candidates arrive in
  // bursts and `latest` would drop all but the last, stalling the connection.
  useRealtimeChannel(channelName, {
    enabled,
    historyLimit: 1,
    onEvent: (event) => {
      if (!enabled) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      void handleSignal(event, ctx);
    }
  });

  useEffect(() => {
    if (!enabled || !stream) return;
    const peers = peersRef.current;
    return () => {
      for (const peer of peers.values()) peer.close();
      peers.clear();
      setViewers([]);
      // Best-effort terminate notification.
      void publishFromClient(channelName, {
        type: "signal.publisher.terminate",
        version: 1,
        payload: { reason: "session_ended" }
      }).catch(() => {});
    };
  }, [enabled, stream, channelName]);

  return {
    viewerCount: viewers.length,
    viewers
  };
}

interface SignalContext {
  orgId: string;
  sessionId: string;
  operatorId: string;
  stream: MediaStream;
  peersRef: React.MutableRefObject<Map<string, RTCPeerConnection>>;
  setViewers: React.Dispatch<React.SetStateAction<string[]>>;
  channelName: string;
}

async function handleSignal(
  event: { type: string; payload: unknown },
  ctx: SignalContext
) {
  switch (event.type) {
    case "signal.viewer.join":
      await onViewerJoin(event.payload as ViewerJoinPayload, ctx);
      break;
    case "signal.viewer.leave":
      onViewerLeave(event.payload as ViewerLeavePayload, ctx);
      break;
    case "signal.answer":
      await onAnswer(event.payload as AnswerPayload, ctx);
      break;
    case "signal.ice_candidate":
      await onIceCandidate(event.payload as IcePayload, ctx);
      break;
    default:
      break;
  }
}

interface ViewerJoinPayload {
  viewerId: string;
  viewerUserId: string;
}
interface ViewerLeavePayload {
  viewerId: string;
}
interface AnswerPayload {
  from: string;
  to: string;
  sdp: string;
}
interface IcePayload {
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
}

async function onViewerJoin(payload: ViewerJoinPayload, ctx: SignalContext) {
  if (ctx.peersRef.current.has(payload.viewerId)) return;
  const peer = new RTCPeerConnection({ iceServers: getIceServers() });
  ctx.peersRef.current.set(payload.viewerId, peer);
  ctx.setViewers((prev) => [...prev, payload.viewerId]);

  for (const track of ctx.stream.getTracks()) {
    peer.addTrack(track, ctx.stream);
  }

  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    void publishFromClient(ctx.channelName, {
      type: "signal.ice_candidate",
      version: 1,
      payload: {
        from: ctx.operatorId,
        to: payload.viewerId,
        candidate: event.candidate.toJSON() as unknown as Record<string, unknown>
      }
    }).catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    if (
      peer.connectionState === "failed" ||
      peer.connectionState === "closed" ||
      peer.connectionState === "disconnected"
    ) {
      ctx.peersRef.current.delete(payload.viewerId);
      ctx.setViewers((prev) => prev.filter((id) => id !== payload.viewerId));
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await publishFromClient(ctx.channelName, {
    type: "signal.offer",
    version: 1,
    payload: {
      from: ctx.operatorId,
      to: payload.viewerId,
      sdp: offer.sdp ?? ""
    }
  });
}

function onViewerLeave(payload: ViewerLeavePayload, ctx: SignalContext) {
  const peer = ctx.peersRef.current.get(payload.viewerId);
  if (peer) {
    peer.close();
    ctx.peersRef.current.delete(payload.viewerId);
  }
  ctx.setViewers((prev) => prev.filter((id) => id !== payload.viewerId));
}

async function onAnswer(payload: AnswerPayload, ctx: SignalContext) {
  if (payload.to !== ctx.operatorId) return;
  const peer = ctx.peersRef.current.get(payload.from);
  if (!peer) return;
  await peer.setRemoteDescription({ type: "answer", sdp: payload.sdp });
}

async function onIceCandidate(payload: IcePayload, ctx: SignalContext) {
  if (payload.to !== ctx.operatorId) return;
  const peer = ctx.peersRef.current.get(payload.from);
  if (!peer) return;
  try {
    await peer.addIceCandidate(payload.candidate);
  } catch {
    // Late candidates after close are fine to ignore.
  }
}
