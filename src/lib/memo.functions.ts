import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const generateMemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects").select("*").eq("id", data.project_id).single();
    if (error) throw new Error(error.message);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);

    const totalCost = Number(project.acquisition_cost || 0) + Number(project.construction_cost || 0);
    const profit = Number(project.revenue_forecast || 0) - totalCost;
    const margin = project.revenue_forecast ? (profit / Number(project.revenue_forecast)) * 100 : 0;

    const prompt = `You are an institutional real estate analyst. Generate an investor-grade investment memo for the following project. Respond ONLY in strict JSON with keys: executive_summary, project_description, market_overview, sources_and_uses, financial_highlights, risks, opportunities, investment_recommendation. Each value is plaintext markdown, 2-5 paragraphs.

Project: ${project.name}
Location: ${project.location || "N/A"}
Type: ${project.type}
Status: ${project.status}
Acquisition Cost: $${project.acquisition_cost}
Construction Cost: $${project.construction_cost}
Revenue Forecast: $${project.revenue_forecast}
Debt: $${project.debt_amount}
Equity: $${project.equity_amount}
Interest Rate: ${project.interest_rate}%
Total Cost: $${totalCost.toFixed(0)}
Projected Profit: $${profit.toFixed(0)} (Margin ${margin.toFixed(1)}%)
Start: ${project.start_date || "TBD"} / Completion: ${project.completion_date || "TBD"}
Notes: ${project.notes || "None"}`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
    });
    let memo: Record<string, string> = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) memo = JSON.parse(m[0]);
    } catch {
      memo = { executive_summary: text };
    }

    const { data: row, error: insErr } = await context.supabase
      .from("investment_memos")
      .insert({ project_id: project.id, owner_id: context.userId, content: memo })
      .select().single();
    if (insErr) throw new Error(insErr.message);
    await context.supabase.from("activities").insert({
      project_id: project.id, user_id: context.userId,
      activity_type: "memo_generated", description: `Generated investment memo`,
    });
    return row;
  });

export const listMemos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("investment_memos").select("*").eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
