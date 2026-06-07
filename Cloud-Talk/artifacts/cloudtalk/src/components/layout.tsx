import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Phone, Settings, LogOut } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { clearSession } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        clearSession();
        queryClient.clear();
        window.location.replace("/login");
      }
    });
  };

  const navItems = [
    { href: "/conversations", icon: MessageSquare, label: "Chat" },
    { href: "/calls", icon: Phone, label: "Calls" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-16 lg:w-20 border-r border-border bg-card flex-col items-center py-4 z-20 shrink-0">
        <div className="mb-8">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/50 shadow-sm shadow-primary/20">
            <span className="text-primary font-bold text-lg">C</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-4 w-full px-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (location === "/" && item.href === "/conversations");
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link href={item.href} className={`flex items-center justify-center p-3 rounded-xl transition-all duration-200 ${isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                    <item.icon className="w-5 h-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-4 w-full px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={handleLogout} className="p-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>

          <Link href="/settings">
            <Avatar className="w-10 h-10 border border-border cursor-pointer hover:border-primary transition-colors">
              <AvatarImage src={user?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">{user?.displayName?.charAt(0) || user?.nickname?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex flex-col min-w-0">
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Bottom Tab Bar — mobile only: Chat | Calls | Settings | Avatar */}
        <nav className="md:hidden flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-md h-16 shrink-0 z-20">
          {navItems.map((item) => {
            const isActive = location === item.href || (location === "/" && item.href === "/conversations");
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <Link href="/settings" className="flex flex-col items-center gap-1 px-3 py-1.5">
            <Avatar className="w-7 h-7 border border-border">
              <AvatarImage src={user?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">{user?.displayName?.charAt(0) || user?.nickname?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium text-muted-foreground">Profile</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}
