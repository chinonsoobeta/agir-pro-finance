import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  type: z.enum(["multifamily","commercial","mixed_use","land","industrial","retail","office","other"]).default("multifamily"),
  status: z.enum(["pipeline","underwriting","approved","active","completed","cancelled"]).default("pipeline"),
  acquisition_cost: z.number().min(0).default(0),
  construction_cost: z.number().min(0).default(0),
  revenue_forecast: z.number().min(0).default(0),
  debt_amount: z.number().min(0).default(0),
  equity_amount: z.number().min(0).default(0),
  interest_rate: z.number().min(0).max(100).default(0),
  start_date: z.string().optional().nullable(),
  completion_date: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("projects").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return proj;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("projects").insert({ ...data, owner_id: context.userId }).select().single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activities").insert({
      project_id: proj.id, user_id: context.userId,
      activity_type: "project_created", description: `Created project ${proj.name}`,
    });
    return proj;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).merge(ProjectSchema.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: proj, error } = await context.supabase
      .from("projects").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return proj;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("activities").select("*, projects(name)").order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
