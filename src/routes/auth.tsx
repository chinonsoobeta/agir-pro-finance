import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Terminal } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Agir" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email to confirm.");
    navigate({ to: "/dashboard" });
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent.");
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) return toast.error(typeof result.error === "string" ? result.error : (result.error as Error).message);
    if (!("redirected" in result && result.redirected)) navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border bg-sidebar">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-sm bg-primary flex items-center justify-center">
            <Terminal className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-mono font-bold tracking-widest text-lg">AGIR</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deal Terminal</div>
          </div>
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">
            Institutional-grade <span className="text-primary">project finance</span>,<br />designed for developers.
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Underwrite deals, run scenarios, generate investor memos, and track project performance — in one terminal.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border">
            {[
              { k: "Memos", v: "5 min" },
              { k: "Scenarios", v: "Unlimited" },
              { k: "AI Copilot", v: "Always on" },
            ].map((s) => (
              <div key={s.k}>
                <div className="num text-xl text-primary">{s.v}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{s.k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
          v1.0 · {new Date().getFullYear()}
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Welcome back</h1>
            <p className="text-xs text-muted-foreground mt-1">Sign in to access your deal terminal</p>
          </div>

          <Button onClick={handleGoogle} variant="outline" className="w-full mb-4">
            <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".7"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".5"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".85"/></svg>
            Continue with Google
          </Button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="reset">Reset</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                <div><Label>Full name</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="reset">
              <form onSubmit={handleReset} className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
