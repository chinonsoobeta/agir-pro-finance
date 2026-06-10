import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Agir" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? "");
      if (data.user) {
        const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        setRoles((r ?? []).map((x: any) => x.role));
      }
    });
  }, []);

  return (
    <>
      <PageHeader title="Settings" subtitle="Account & workspace" />
      <div className="p-6 space-y-4 max-w-3xl">
        <Card className="p-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Account</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Email</div><div className="num">{email}</div></div>
            <div><div className="text-xs text-muted-foreground">Roles</div><div className="capitalize">{roles.join(", ") || "—"}</div></div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Assumption Registry</div>
          <p className="text-sm text-muted-foreground mt-2">Centralized assumption versioning with audit trail. Coming in next release.</p>
        </Card>
      </div>
    </>
  );
}
