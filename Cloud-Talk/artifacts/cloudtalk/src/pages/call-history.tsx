import Layout from "@/components/layout";
import { useGetCallHistory } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

export default function CallHistory() {
  const { user } = useAuth();
  const { data: calls } = useGetCallHistory();

  return (
    <Layout>
      <div className="flex flex-col h-full bg-background">
        <header className="h-16 border-b border-border bg-card/50 flex items-center px-6">
          <h1 className="text-xl font-bold">Call History</h1>
        </header>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {calls?.map((call) => {
              const isCaller = call.callerId === user?.id;
              const otherPerson = isCaller ? call.receiver : call.caller;
              const isMissed = call.status === "missed" || call.status === "rejected";
              
              return (
                <div key={call.id} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:bg-card/80 transition-colors">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={otherPerson?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-secondary text-secondary-foreground">{otherPerson?.displayName?.charAt(0) || otherPerson?.nickname?.charAt(0) || "?"}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-lg text-foreground truncate">{otherPerson?.displayName || otherPerson?.nickname}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                      {isMissed ? (
                        <PhoneMissed className="w-4 h-4 text-destructive" />
                      ) : isCaller ? (
                        <PhoneOutgoing className="w-4 h-4" />
                      ) : (
                        <PhoneIncoming className="w-4 h-4" />
                      )}
                      <span>{format(new Date(call.createdAt), "PP p")}</span>
                      {call.duration && (
                        <>
                          <span className="w-1 h-1 bg-muted-foreground rounded-full" />
                          <span>{Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {call.type === "video" ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {calls?.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                  <Phone className="w-6 h-6 opacity-50" />
                </div>
                <p>No call history yet.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </Layout>
  );
}
