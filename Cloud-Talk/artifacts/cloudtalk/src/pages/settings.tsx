import Layout from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="flex flex-col h-full bg-background overflow-y-auto">
        <header className="h-16 border-b border-border bg-card/50 flex items-center px-6 sticky top-0 z-10 backdrop-blur-md">
          <h1 className="text-xl font-bold">Settings</h1>
        </header>

        <div className="max-w-2xl mx-auto w-full p-6 space-y-8 pb-20">
          <section className="flex flex-col items-center py-8 space-y-4">
            <div className="relative group cursor-pointer">
              <Avatar className="w-32 h-32 border-4 border-card shadow-xl">
                <AvatarImage src={user?.avatarUrl || undefined} />
                <AvatarFallback className="text-4xl bg-primary/20 text-primary">{user?.displayName?.charAt(0) || user?.nickname?.charAt(0) || "U"}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-sm font-medium text-white">Change Avatar</span>
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">{user?.displayName || user?.nickname}</h2>
              <p className="text-muted-foreground">@{user?.nickname}</p>
            </div>
          </section>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>Manage your public identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" defaultValue={user?.displayName || ""} className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input id="nickname" defaultValue={user?.nickname} disabled className="bg-background/30 text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">Nicknames cannot be changed.</p>
              </div>
              <Button className="mt-4 shadow-lg shadow-primary/20 font-medium">Save Changes</Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive">Delete Account</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
