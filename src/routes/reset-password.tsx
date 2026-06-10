import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    setReady(hash.includes("type=recovery") || hash.includes("access_token"));
  }, []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    toast.success("Password updated. You can sign in now.");
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="text-xs text-muted-foreground mt-1">Choose a new password for your account.</p>
        {ready ? (
          <form onSubmit={handle} className="space-y-3 mt-4">
            <div><Label>New password</Label>
              <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full">Update password</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground mt-4">Open this page from the reset email link.</p>
        )}
      </Card>
    </div>
  );
}
