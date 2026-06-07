import { createContext, useContext, ReactNode, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

interface AuthContextType {
  user: any;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user, isLoading } = useGetMe({
    // cast needed: Orval uses full UseQueryOptions which requires queryKey,
    // but the hook sets queryKey internally — runtime is correct
    query: {
      retry: false,
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    } as any
  });

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isAuthenticated }}>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-background text-primary">
          <Spinner className="size-10" />
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || !isAuthenticated) return null;

  return <>{children}</>;
}
