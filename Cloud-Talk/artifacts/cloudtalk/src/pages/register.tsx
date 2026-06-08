import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "../hooks/use-theme";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { saveSession } from "@/lib/session";
import { Moon, Sun } from "lucide-react";

const registerSchema = z.object({
  nickname: z
    .string()
    .min(3, "Nickname must be at least 3 characters")
    .max(32, "Nickname cannot exceed 32 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
  displayName: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Register() {
  const { toast } = useToast();
  const registerMutation = useRegister();
  const { theme, toggleTheme } = useTheme();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nickname: "", displayName: "", password: "" },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerMutation.mutate(
      { data: values },
      {
        onSuccess: (data: any) => {
          if (data.token) saveSession(data.token);
          window.location.replace("/");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: error?.data?.error || error.message || "Please check your inputs and try again.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-20 rounded-full border border-border bg-card/80 p-2 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-chart-2/20 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
      </div>

      <Card className="w-full max-w-md glass z-10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold tracking-tight text-center text-primary">CloudTalk</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Register your callsign.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nickname</FormLabel>
                    <FormControl>
                      <Input placeholder="pilot1" {...field} className="bg-background/50 border-white/10 focus-visible:ring-primary" />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">Unique, letters/numbers/underscores only</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Maverick" {...field} className="bg-background/50 border-white/10 focus-visible:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 border-white/10 focus-visible:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full font-semibold shadow-lg shadow-primary/20"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Registering..." : "Initialize"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
              Login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
