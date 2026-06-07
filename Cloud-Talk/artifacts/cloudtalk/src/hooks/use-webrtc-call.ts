import { useState, useRef, useCallback, useEffect } from "react";
import { getSession } from "../lib/session";
import { useToast } from "./use-toast";
import { apiUrl } from "../lib/api";

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

async function apiCall(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const token = getSession();
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

interface ApiCall {
  id: number;
  callerId: number;
  receiverId: number;
  type: string;
  status: string;
  sdpOffer?: string | null;
  sdpAnswer?: string | null;
  iceCandidatesA?: string | null;
  iceCandidatesB?: string | null;
  caller?: { id: number; nickname: string; displayName?: string | null; avatarUrl?: string | null };
  receiver?: { id: number; nickname: string; displayName?: string | null; avatarUrl?: string | null };
}

export type CallState = {
  id: number;
  type: "audio" | "video";
  status: "ringing" | "active" | "ended" | "rejected" | "missed";
  role: "caller" | "receiver";
  otherUserId: number;
  otherUserName: string;
  otherUserAvatar?: string | null;
};

export type IncomingCallInfo = {
  id: number;
  type: "audio" | "video";
  callerId: number;
  callerName: string;
  callerAvatar?: string | null;
};

export function useWebRTCCall() {
  const { toast } = useToast();
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallIdRef = useRef<number | null>(null);
  const roleRef = useRef<"caller" | "receiver" | null>(null);
  const remoteDescSetRef = useRef(false);
  const lastAppliedCandARef = useRef(0);
  const lastAppliedCandBRef = useRef(0);
  const pendingLocalCandRef = useRef<RTCIceCandidate[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceSendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState | null>(null);
  const incomingCallRef = useRef<IncomingCallInfo | null>(null);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const stopStreams = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const closePc = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (iceSendRef.current) { clearInterval(iceSendRef.current); iceSendRef.current = null; }
  }, []);

  const resetCallState = useCallback(() => {
    clearTimers();
    closePc();
    stopStreams();
    pendingLocalCandRef.current = [];
    remoteDescSetRef.current = false;
    lastAppliedCandARef.current = 0;
    lastAppliedCandBRef.current = 0;
    currentCallIdRef.current = null;
    roleRef.current = null;
    setCallState(null);
    setIsMuted(false);
    setIsCameraOff(false);
  }, [clearTimers, closePc, stopStreams]);

  const applyRemoteCandidates = useCallback(async (call: ApiCall) => {
    const pc = pcRef.current;
    const role = roleRef.current;
    if (!pc || !role || pc.remoteDescription === null) return;

    const rawJson = role === "caller" ? call.iceCandidatesB : call.iceCandidatesA;
    if (!rawJson) return;

    const all = JSON.parse(rawJson) as RTCIceCandidateInit[];
    const lastRef = role === "caller" ? lastAppliedCandBRef : lastAppliedCandARef;
    const newOnes = all.slice(lastRef.current);

    for (const c of newOnes) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
    }
    lastRef.current = all.length;
  }, []);

  const flushLocalCandidates = useCallback(async () => {
    const callId = currentCallIdRef.current;
    const role = roleRef.current;
    if (!callId || !role || pendingLocalCandRef.current.length === 0) return;

    const toSend = pendingLocalCandRef.current.splice(0);
    const payload = JSON.stringify(toSend.map(c => c.toJSON()));

    try {
      if (role === "caller") {
        await apiCall(`/calls/${callId}/signal`, "POST", { candidatesA: payload });
      } else {
        await apiCall(`/calls/${callId}/signal`, "POST", { candidatesB: payload });
      }
    } catch {
      pendingLocalCandRef.current.unshift(...toSend);
    }
  }, []);

  const startPolling = useCallback((callId: number) => {
    pollingRef.current = setInterval(async () => {
      try {
        const call = await apiCall(`/calls/${callId}`) as ApiCall;
        const role = roleRef.current;

        if (call.status === "rejected") {
          resetCallState();
          toast({ title: "Call declined", description: "The other person declined the call." });
          return;
        }
        if (call.status === "ended" || call.status === "missed") {
          resetCallState();
          return;
        }

        setCallState(prev => prev ? { ...prev, status: call.status as CallState["status"] } : prev);

        // Caller: set remote description when answer arrives
        if (role === "caller" && call.sdpAnswer && !remoteDescSetRef.current && pcRef.current) {
          remoteDescSetRef.current = true;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(JSON.parse(call.sdpAnswer)));
        }

        await applyRemoteCandidates(call);
      } catch { /* network hiccup */ }
    }, 2000);

    iceSendRef.current = setInterval(flushLocalCandidates, 2000);
  }, [resetCallState, applyRemoteCandidates, flushLocalCandidates, toast]);

  const buildPc = useCallback(() => {
    const pc = new RTCPeerConnection(STUN_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate) pendingLocalCandRef.current.push(e.candidate);
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) setRemoteStream(stream);
    };
    pcRef.current = pc;
    return pc;
  }, []);

  const getMedia = useCallback(async (type: "audio" | "video") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone/camera access.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === "video",
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // --- Public API ---

  const startCall = useCallback(async (
    receiverId: number,
    type: "audio" | "video",
    otherUserName: string,
    otherUserAvatar?: string | null,
  ) => {
    if (callStateRef.current) return;
    try {
      const call = await apiCall("/calls", "POST", { receiverId, type }) as ApiCall;
      currentCallIdRef.current = call.id;
      roleRef.current = "caller";

      setCallState({ id: call.id, type, status: "ringing", role: "caller", otherUserId: receiverId, otherUserName, otherUserAvatar });

      const pc = buildPc();
      const stream = await getMedia(type);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await apiCall(`/calls/${call.id}/signal`, "POST", { sdpOffer: JSON.stringify(offer) });

      startPolling(call.id);
    } catch (err) {
      resetCallState();
      toast({ title: "Call failed", description: String(err) });
    }
  }, [buildPc, getMedia, startPolling, resetCallState, toast]);

  const acceptCall = useCallback(async (info: IncomingCallInfo) => {
    if (callStateRef.current) return;
    setIncomingCall(null);

    try {
      await apiCall(`/calls/${info.id}/accept`, "POST");

      currentCallIdRef.current = info.id;
      roleRef.current = "receiver";

      setCallState({ id: info.id, type: info.type, status: "active", role: "receiver", otherUserId: info.callerId, otherUserName: info.callerName, otherUserAvatar: info.callerAvatar });

      const pc = buildPc();
      const stream = await getMedia(info.type);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const call = await apiCall(`/calls/${info.id}`) as ApiCall;
      if (!call.sdpOffer) throw new Error("No SDP offer available");

      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(call.sdpOffer)));
      remoteDescSetRef.current = true;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await apiCall(`/calls/${info.id}/signal`, "POST", { sdpAnswer: JSON.stringify(answer) });

      // Apply any ICE candidates that arrived before we connected
      await applyRemoteCandidates(call);

      startPolling(info.id);
    } catch (err) {
      resetCallState();
      toast({ title: "Failed to join call", description: String(err) });
    }
  }, [buildPc, getMedia, startPolling, applyRemoteCandidates, resetCallState, toast]);

  const declineCall = useCallback(async (callId: number) => {
    setIncomingCall(null);
    try { await apiCall(`/calls/${callId}/reject`, "POST"); } catch { /* ignore */ }
  }, []);

  const endCall = useCallback(async () => {
    const callId = currentCallIdRef.current;
    resetCallState();
    if (callId) {
      try { await apiCall(`/calls/${callId}/end`, "POST"); } catch { /* ignore */ }
    }
  }, [resetCallState]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isMuted;
    stream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isCameraOff;
    stream.getVideoTracks().forEach(t => { t.enabled = !next; });
    setIsCameraOff(next);
  }, [isCameraOff]);

  // Poll for incoming calls when idle
  useEffect(() => {
    incomingPollRef.current = setInterval(async () => {
      if (callStateRef.current) return;
      try {
        const call = await apiCall("/calls/incoming") as ApiCall | null;
        if (!call) {
          if (incomingCallRef.current) setIncomingCall(null);
          return;
        }
        // Only update if it's a new call
        if (incomingCallRef.current?.id !== call.id) {
          setIncomingCall({
            id: call.id,
            type: call.type as "audio" | "video",
            callerId: call.callerId,
            callerName: call.caller?.displayName ?? call.caller?.nickname ?? "Unknown",
            callerAvatar: call.caller?.avatarUrl,
          });
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => { if (incomingPollRef.current) clearInterval(incomingPollRef.current); };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
      closePc();
      stopStreams();
    };
  }, [clearTimers, closePc, stopStreams]);

  return { callState, incomingCall, localStream, remoteStream, isMuted, isCameraOff, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera };
}
