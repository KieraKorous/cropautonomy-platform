"use client";

import { channels } from "@gaia/realtime/channels";
import { publishFromClient, useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useRef, useState } from "react";

import { getIceServers } from "./ice";

// Viewer side of the mesh WebRTC live preview. The field PWA's useLivePublisher
// (apps/field-web/src/lib/webrtc.ts) is the offerer that holds the camera; this
// hook is the answerer. One hook instance = one camera tile = one peer
// connection to that session's publisher.
//
// Handshake (all over the capture-session-signal channel, addressed by id):
//   1. viewer announces  -> signal.viewer.join  { viewerId }
//   2. publisher offers   -> signal.offer        { from: operatorId, to: viewerId }
//   3. viewer answers     -> signal.answer       { from: viewerId, to: operatorId }
//   4. both trickle ICE   -> signal.ice_candidate
// The viewer learns the publisher id from offer.from, so it never needs to know
// the operator id in advance.

export interface UseLiveViewerOptions {
  orgId: string;
  sessionId: string;
  viewerUserId: string; // clerk user id of the watching supervisor
  enabled: boolean;
}

export interface LiveViewerState {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | "idle";
}

export function useLiveViewer(options: UseLiveViewerOptions): LiveViewerState {
  const { orgId, sessionId, viewerUserId, enabled } = options;
  const channelName = channels.captureSessionSignal(orgId, sessionId);

  // Ephemeral per-tab viewer id, stable for the life of this hook instance.
  const [viewerId] = useState(() => crypto.randomUUID());
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState | "idle">("idle");

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const publisherIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);

  // Refs the signal handler reads; kept current without re-subscribing so the
  // onEvent callback can stay a stable closure over them.
  const handlerCtxRef = useRef<ViewerContext>({
    viewerId,
    channelName,
    peerRef,
    publisherIdRef,
    setStream,
    setConnectionState
  });
  handlerCtxRef.current = {
    viewerId,
    channelName,
    peerRef,
    publisherIdRef,
    setStream,
    setConnectionState
  };

  const { status: channelStatus } = useRealtimeChannel(channelName, {
    enabled,
    historyLimit: 1,
    // Drive the handshake off every event. Trickle-ICE candidates arrive in
    // bursts; reacting to the coalesced `latest` would drop all but the last
    // and the connection would never reach `connected`.
    onEvent: (event) => {
      void handleSignal(event, handlerCtxRef.current);
    }
  });

  // Announce ourselves once the channel is connected — and KEEP re-announcing
  // until the peer is connected. In the request/accept go-live flow the portal
  // viewer joins the instant the session appears, but the phone publisher only
  // comes online seconds later (navigate → camera permission → publish). A join
  // is a no-replay broadcast, so a single announce sent before the publisher is
  // listening would be lost forever — leaving a tile stuck on "Connecting". The
  // publisher ignores duplicate joins for a viewerId it already has a peer for,
  // so re-announcing is safe; we stop as soon as we're connected.
  useEffect(() => {
    if (!enabled || channelStatus !== "connected") return;
    if (connectionState === "connected") return;

    const announce = () => {
      joinedRef.current = true;
      void publishFromClient(channelName, {
        type: "signal.viewer.join",
        version: 1,
        payload: {
          viewerId,
          viewerUserId,
          joinedAt: new Date().toISOString()
        }
      }).catch(() => {});
    };

    announce();
    const interval = setInterval(announce, 2500);
    return () => clearInterval(interval);
  }, [enabled, channelStatus, channelName, viewerId, viewerUserId, connectionState]);

  // Teardown: close the peer and tell the publisher we're gone so it can drop
  // our connection from its mesh.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      const peer = peerRef.current;
      if (peer) {
        peer.close();
        peerRef.current = null;
      }
      publisherIdRef.current = null;
      if (joinedRef.current) {
        void publishFromClient(channelName, {
          type: "signal.viewer.leave",
          version: 1,
          payload: { viewerId, leftAt: new Date().toISOString() }
        }).catch(() => {});
      }
      joinedRef.current = false;
      setStream(null);
      setConnectionState("idle");
    };
  }, [enabled, channelName, viewerId]);

  return { stream, connectionState };
}

interface ViewerContext {
  viewerId: string;
  channelName: string;
  peerRef: React.MutableRefObject<RTCPeerConnection | null>;
  publisherIdRef: React.MutableRefObject<string | null>;
  setStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setConnectionState: React.Dispatch<
    React.SetStateAction<RTCPeerConnectionState | "idle">
  >;
}

interface OfferPayload {
  from: string;
  to: string;
  sdp: string;
}
interface IcePayload {
  from: string;
  to: string;
  candidate: Record<string, unknown>;
}

async function handleSignal(
  event: { type: string; payload: unknown },
  ctx: ViewerContext
) {
  switch (event.type) {
    case "signal.offer":
      await onOffer(event.payload as OfferPayload, ctx);
      break;
    case "signal.ice_candidate":
      await onIceCandidate(event.payload as IcePayload, ctx);
      break;
    case "signal.publisher.terminate":
      onTerminate(ctx);
      break;
    default:
      break;
  }
}

async function onOffer(payload: OfferPayload, ctx: ViewerContext) {
  if (payload.to !== ctx.viewerId) return;

  let peer = ctx.peerRef.current;
  if (!peer) {
    peer = new RTCPeerConnection({ iceServers: getIceServers() });
    ctx.peerRef.current = peer;
    ctx.publisherIdRef.current = payload.from;

    peer.ontrack = (event) => {
      ctx.setStream(event.streams[0] ?? null);
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void publishFromClient(ctx.channelName, {
        type: "signal.ice_candidate",
        version: 1,
        payload: {
          from: ctx.viewerId,
          to: ctx.publisherIdRef.current ?? payload.from,
          candidate: event.candidate.toJSON() as unknown as Record<string, unknown>
        }
      }).catch(() => {});
    };

    const pc = peer;
    pc.onconnectionstatechange = () => {
      ctx.setConnectionState(pc.connectionState);
    };
  }

  await peer.setRemoteDescription({ type: "offer", sdp: payload.sdp });
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await publishFromClient(ctx.channelName, {
    type: "signal.answer",
    version: 1,
    payload: { from: ctx.viewerId, to: payload.from, sdp: answer.sdp ?? "" }
  });
}

async function onIceCandidate(payload: IcePayload, ctx: ViewerContext) {
  if (payload.to !== ctx.viewerId) return;
  const peer = ctx.peerRef.current;
  if (!peer) return;
  try {
    await peer.addIceCandidate(payload.candidate as RTCIceCandidateInit);
  } catch {
    // Late candidates after close are safe to ignore.
  }
}

function onTerminate(ctx: ViewerContext) {
  const peer = ctx.peerRef.current;
  if (peer) {
    peer.close();
    ctx.peerRef.current = null;
  }
  ctx.publisherIdRef.current = null;
  ctx.setStream(null);
  ctx.setConnectionState("closed");
}
