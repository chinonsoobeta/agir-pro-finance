import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ScenarioSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  revenue_change: z.number().default(0),
  cost_change: z.number().default(0),
  interest_rate_change: z.number().default(0),
  exit_cap_rate: z.number().optional().nullable(),
  rent_growth: z.number().optional().nullable(),
  occupancy: z.number().optional().nullable(),
});

export const listScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id?: string }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("scenarios").select("*").order("created_at", { ascending: false });
    if (data?.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScenarioSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scenarios").insert({ ...data, owner_id: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scenarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
