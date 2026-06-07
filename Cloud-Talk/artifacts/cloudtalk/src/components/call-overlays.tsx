import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CallState, IncomingCallInfo } from "@/hooks/use-webrtc-call";

interface IncomingCallOverlayProps {
  incoming: IncomingCallInfo;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallOverlay({ incoming, onAccept, onDecline }: IncomingCallOverlayProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      >
        <div className="flex flex-col items-center gap-6 text-center p-8 max-w-sm w-full">
          {/* Ringing animation */}
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20"
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
            />
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/10"
              animate={{ scale: [1, 1.7, 1] }}
              transition={{ repeat: Infinity, duration: 1.8, delay: 0.3 }}
            />
            <Avatar className="w-24 h-24 border-4 border-primary/40 relative">
              <AvatarImage src={incoming.callerAvatar || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                {incoming.callerName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">{incoming.callerName}</h2>
            <p className="text-muted-foreground mt-1 flex items-center justify-center gap-2">
              {incoming.type === "video" ? (
                <><Video className="w-4 h-4" /> Incoming video call</>
              ) : (
                <><Phone className="w-4 h-4" /> Incoming voice call</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-8 mt-4">
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 shadow-lg"
                onClick={onDecline}
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
              <span className="text-sm text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-400 shadow-lg"
                onClick={onAccept}
              >
                {incoming.type === "video" ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
              </Button>
              <span className="text-sm text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface ActiveCallOverlayProps {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
}

export function ActiveCallOverlay({
  callState,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: ActiveCallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isRinging = callState.status === "ringing";
  const isVideo = callState.type === "video";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
    >
      {/* Remote video / audio bg */}
      {isVideo ? (
        <div className="flex-1 relative bg-black">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-muted-foreground">
              <Avatar className="w-28 h-28 border-2 border-white/10">
                <AvatarImage src={callState.otherUserAvatar || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                  {callState.otherUserName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-white text-lg">
                {isRinging ? "Calling…" : "Connecting…"}
              </p>
            </div>
          )}

          {/* Local PiP */}
          {localStream && (
            <div className="absolute top-4 right-4 w-32 h-44 rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isCameraOff ? "invisible" : ""}`}
              />
              {isCameraOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <VideoOff className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Audio call UI */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-gray-900 to-gray-950">
          <div className="relative">
            {!isRinging && (
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <Avatar className="w-28 h-28 border-2 border-white/10 relative">
              <AvatarImage src={callState.otherUserAvatar || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                {callState.otherUserName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{callState.otherUserName}</h2>
            <p className="text-muted-foreground mt-1">
              {isRinging ? "Calling…" : "Voice call connected"}
            </p>
          </div>

          {/* Animated audio wave */}
          {!isRinging && (
            <div className="flex items-end gap-1 h-8">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-primary rounded-full"
                  animate={{ height: ["8px", "28px", "8px"] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                />
              ))}
            </div>
          )}

          {/* Hidden audio element for remote stream */}
          <audio ref={remoteVideoRef as React.RefObject<HTMLAudioElement>} autoPlay />
        </div>
      )}

      {/* Control bar */}
      <div className="bg-gray-900/90 backdrop-blur-sm px-8 py-6 flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className={`w-14 h-14 rounded-full border ${isMuted ? "bg-destructive/20 border-destructive/50 text-destructive" : "border-white/10 text-white hover:bg-white/10"}`}
            onClick={onToggleMute}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>
          <span className="text-[11px] text-muted-foreground">{isMuted ? "Unmute" : "Mute"}</span>
        </div>

        {isVideo && (
          <div className="flex flex-col items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className={`w-14 h-14 rounded-full border ${isCameraOff ? "bg-destructive/20 border-destructive/50 text-destructive" : "border-white/10 text-white hover:bg-white/10"}`}
              onClick={onToggleCamera}
            >
              {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
            <span className="text-[11px] text-muted-foreground">{isCameraOff ? "Camera on" : "Camera off"}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-1">
          <Button
            size="icon"
            className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/30"
            onClick={onEndCall}
          >
            <PhoneOff className="w-7 h-7" />
          </Button>
          <span className="text-[11px] text-muted-foreground">End</span>
        </div>
      </div>
    </motion.div>
  );
}
