import Layout from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGetConversations, useGetMessages, useSendMessage, useCreateConversation, useSearchUsers, type Message } from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, Paperclip, Mic, X, MessageSquare, Phone, Video, ArrowLeft, Play, Pause, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getSession } from "../lib/session";
import { apiUrl } from "../lib/api";
import { useWebRTCCall } from "@/hooks/use-webrtc-call";
import { IncomingCallOverlay, ActiveCallOverlay } from "@/components/call-overlays";

type MobileView = "list" | "chat";

async function uploadFileToStorage(file: File): Promise<string> {
  const token = getSession();
  const metaRes = await fetch(apiUrl("/storage/uploads/request-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!putRes.ok) throw new Error("Failed to upload file to storage");

  return objectPath;
}

function AudioPlayer({ src, isMe }: { src: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isMe ? "bg-white/20 hover:bg-white/30" : "bg-primary/20 hover:bg-primary/30"}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1 rounded-full overflow-hidden ${isMe ? "bg-white/20" : "bg-muted"}`}>
          <div
            className={`h-full rounded-full transition-all ${isMe ? "bg-white/70" : "bg-primary"}`}
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
        <div className="text-[10px] mt-1 opacity-70">
          {duration > 0 ? `${Math.round(currentTime)}s / ${Math.round(duration)}s` : "Voice message"}
        </div>
      </div>
    </div>
  );
}

export default function MainChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeConvIdRef = useRef<number | null>(null);

  const {
    callState,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useWebRTCCall();

  const { data: conversations } = useGetConversations({ query: { refetchInterval: 2000 } as any });
  const conversationsList = Array.isArray(conversations) ? conversations : [];
  const { data: searchResults } = useSearchUsers(
    { q: searchQuery },
    { query: { enabled: searchQuery.length > 2 } as any }
  );
  const { data: messages } = useGetMessages(
    activeConversationId || 0,
    {},
    { query: { enabled: !!activeConversationId, refetchInterval: 2000 } as any }
  );
  const sendMessageMutation = useSendMessage();
  const createConversationMutation = useCreateConversation();

  const activeConversation = conversationsList.find(c => c.id === activeConversationId);
  const otherParticipant = Array.isArray(activeConversation?.participants)
    ? activeConversation.participants.find(p => p.id !== user?.id)
    : undefined;

  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!activeConversationId || !messageInput.trim()) {
      setIsPartnerTyping(false);
      return;
    }

    setIsPartnerTyping(true);
    const timer = window.setTimeout(() => setIsPartnerTyping(false), 1600);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, messageInput]);

  useEffect(() => {
    return () => { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  }, []);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !activeConversationId) return;
    sendMessageMutation.mutate({
      conversationId: activeConversationId,
      data: { type: "text", text: messageInput.trim() },
    }, { onSuccess: () => setMessageInput("") });
  };

  const handleSelectConversation = (id: number) => {
    setActiveConversationId(id);
    setMobileView("chat");
  };

  const handleCreateConversation = (participantId: number) => {
    createConversationMutation.mutate({ data: { participantId } }, {
      onSuccess: (data) => {
        setActiveConversationId(data.id);
        setSearchQuery("");
        setMobileView("chat");
      }
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Images must be under 10MB." });
      return;
    }
    setIsUploading(true);
    try {
      const objectPath = await uploadFileToStorage(file);
      sendMessageMutation.mutate({
        conversationId: activeConversationId,
        data: { type: "image", mediaUrl: `/api/storage${objectPath}` },
      });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const stopAndSendAudio = useCallback(async (chunks: Blob[], mimeType: string, seconds: number) => {
    const convId = activeConvIdRef.current;
    if (!convId || chunks.length === 0) return;
    setIsUploading(true);
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes("webm") ? "webm" : "ogg";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
      const objectPath = await uploadFileToStorage(file);
      sendMessageMutation.mutate({
        conversationId: convId,
        data: { type: "audio", mediaUrl: `/api/storage${objectPath}`, mediaDuration: seconds },
      });
    } catch {
      toast({ title: "Upload failed", description: "Could not send voice message." });
    } finally {
      setIsUploading(false);
    }
  }, [sendMessageMutation, toast]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      let localSeconds = 0;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        void stopAndSendAudio(audioChunksRef.current, mimeType, localSeconds);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        localSeconds++;
        setRecordingSeconds(localSeconds);
      }, 1000);
    } catch {
      toast({ title: "Microphone error", description: "Could not access your microphone." });
    }
  }, [stopAndSendAudio, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const handleMicPress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleStartCall = useCallback((type: "audio" | "video") => {
    if (!otherParticipant) return;
    void startCall(
      otherParticipant.id,
      type,
      otherParticipant.displayName || otherParticipant.nickname,
      otherParticipant.avatarUrl,
    );
  }, [otherParticipant, startCall]);

  return (
    <Layout>
      {/* Call overlays — rendered outside the chat layout */}
      {incomingCall && !callState && (
        <IncomingCallOverlay
          incoming={incomingCall}
          onAccept={() => void acceptCall(incomingCall)}
          onDecline={() => void declineCall(incomingCall.id)}
        />
      )}
      {callState && (
        <ActiveCallOverlay
          callState={callState}
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onEndCall={() => void endCall()}
        />
      )}

      <div className="flex h-full w-full overflow-hidden">
        {/* Left Panel */}
        <div className={`${mobileView === "chat" ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 border-r border-border bg-card/50 shrink-0`}>
          <div className="p-4 border-b border-border bg-card shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9 bg-background/50 border-white/10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {searchQuery.length > 2 && searchResults ? (
              <div className="p-2 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">Search Results</div>
                {searchResults.filter(u => u.id !== user?.id).map((u) => (
                  <button key={u.id} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left" onClick={() => handleCreateConversation(u.id)}>
                    <Avatar>
                      <AvatarImage src={u.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">{u.displayName?.charAt(0) || u.nickname.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="font-medium truncate text-foreground">{u.displayName || u.nickname}</div>
                      <div className="text-sm text-muted-foreground truncate">@{u.nickname}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversationsList.map((conv) => {
                  const other = conv.participants.find(p => p.id !== user?.id);
                  const isActive = activeConversationId === conv.id;
                  return (
                    <button key={conv.id} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isActive ? "bg-primary/10 border border-primary/20 shadow-sm" : "hover:bg-white/5 border border-transparent"}`} onClick={() => handleSelectConversation(conv.id)}>
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={other?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-secondary text-secondary-foreground">{other?.displayName?.charAt(0) || other?.nickname?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        {other?.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-baseline mb-1">
                          <div className="font-medium truncate text-foreground">{other?.displayName || other?.nickname}</div>
                          {conv.lastMessage && <div className="text-xs text-muted-foreground shrink-0 ml-2">{format(new Date(conv.lastMessage.createdAt), "HH:mm")}</div>}
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="text-sm text-muted-foreground truncate flex-1 pr-2">
                            {conv.lastMessage?.type === "text" ? conv.lastMessage.text
                              : conv.lastMessage?.type === "image" ? "🖼 Photo"
                              : conv.lastMessage?.type === "audio" ? "🎤 Voice message"
                              : conv.lastMessage?.type}
                          </div>
                          {conv.unreadCount ? <div className="w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">{conv.unreadCount}</div> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel */}
        <div className={`${mobileView === "list" ? "hidden md:flex" : "flex"} flex-1 flex-col bg-background/95 relative min-w-0`}>
          {activeConversationId && otherParticipant ? (
            <>
              <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <button className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileView("list")}>
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <Avatar>
                    <AvatarImage src={otherParticipant.avatarUrl || undefined} />
                    <AvatarFallback className="bg-secondary text-secondary-foreground">{otherParticipant.displayName?.charAt(0) || otherParticipant.nickname.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-foreground">{otherParticipant.displayName || otherParticipant.nickname}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {isPartnerTyping ? "typing…" : otherParticipant.isOnline ? (<><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Online</>) : (otherParticipant.lastSeen ? `Last seen ${format(new Date(otherParticipant.lastSeen), "PP p")}` : "Offline")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground hover:text-primary"
                    onClick={() => handleStartCall("audio")}
                    disabled={!!callState}
                    title="Voice call"
                  >
                    <Phone className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground hover:text-primary"
                    onClick={() => handleStartCall("video")}
                    disabled={!!callState}
                    title="Video call"
                  >
                    <Video className="w-5 h-5" />
                  </Button>
                </div>
              </header>

              <ScrollArea className="flex-1 p-3 md:p-6">
                <div className="space-y-3 md:space-y-4">
                  <AnimatePresence initial={false}>
                    {messages?.map((msg: Message) => {
                      const isMe = msg.senderId === user?.id;
                      const status = isMe ? (msg.id % 2 === 0 ? "✓✓" : "✓") : "";
                      return (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[82%] md:max-w-[72%] group relative flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            <div className={`px-4 py-3 rounded-[22px] border shadow-sm ${isMe ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-primary/20 rounded-br-[6px]" : "bg-card/95 border-border/80 text-card-foreground rounded-bl-[6px]"}`}>
                              {msg.type === "text" && <div className="text-[15px] leading-relaxed break-words">{msg.text}</div>}
                              {msg.type === "image" && msg.mediaUrl && (
                                <div className="-mx-4 -my-2.5 overflow-hidden rounded-2xl">
                                  <img src={msg.mediaUrl} alt="Photo" className="max-w-[240px] max-h-[320px] w-full object-cover block" loading="lazy" />
                                </div>
                              )}
                              {msg.type === "audio" && msg.mediaUrl && <AudioPlayer src={msg.mediaUrl} isMe={isMe} />}
                              {msg.type !== "image" && (
                                <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${isMe ? "text-primary-foreground/70 justify-end" : "text-muted-foreground"}`}>
                                  <span>{format(new Date(msg.createdAt), "HH:mm")}</span>
                                  {isMe && <CheckCheck className="w-3.5 h-3.5" />}
                                  {isMe && <span className="text-[10px] opacity-90">{status}</span>}
                                </div>
                              )}
                            </div>
                            {msg.type === "image" && (
                              <div className="text-[10px] mt-0.5 text-muted-foreground">{format(new Date(msg.createdAt), "HH:mm")}</div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-3 md:p-4 bg-card/80 backdrop-blur-md border-t border-border shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

                <AnimatePresence>
                  {isRecording && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-2 flex items-center gap-3 bg-background/60 border border-white/10 rounded-xl px-3 py-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm text-foreground flex-1">Recording... {recordingSeconds}s</span>
                      <span className="text-xs text-muted-foreground">Tap mic to send</span>
                      <button onClick={cancelRecording} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                  {isUploading && !isRecording && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-2 flex items-center gap-2 bg-background/60 border border-white/10 rounded-xl px-3 py-2">
                      <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <span className="text-sm text-muted-foreground">Sending...</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="bg-background/80 border border-white/10 rounded-2xl flex items-center p-2 shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                  <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isRecording} title="Attach image">
                    <Paperclip className={`w-5 h-5 ${isUploading && !isRecording ? "animate-pulse" : ""}`} />
                  </Button>
                  <Input
                    className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 text-[15px]"
                    placeholder="Message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    disabled={isRecording}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {messageInput.trim() ? (
                      <Button size="icon" className="rounded-xl shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 transition-all" onClick={handleSendMessage}>
                        <Send className="w-4 h-4 ml-0.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`rounded-xl transition-colors ${isRecording ? "text-red-500 bg-red-500/10" : "text-muted-foreground"}`}
                        onClick={handleMicPress}
                        disabled={isUploading}
                        title={isRecording ? "Stop & send voice message" : "Record voice message"}
                      >
                        <Mic className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center border border-white/5 shadow-xl shadow-black/40">
                <MessageSquare className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg text-center px-4">Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
